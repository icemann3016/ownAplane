import "server-only";

import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { calendarConnections, type CalendarConnection } from "@/lib/db/schema";
import { reportError } from "@/lib/monitoring";
import { applyEvents } from "./apply";
import { normalizeEvents } from "./events";
import { FeedError, fetchFeed, parseFeed } from "./feeds";

// Pulling linked calendars (SYN-1, SYN-2). Trusted code: run by the owner's "Sync now", right
// before a booking is requested or accepted, and by the scheduled jobs.

type Pull = Pick<CalendarConnection, "id" | "inbound" | "feedUrl">;

export type SyncOutcome =
  { ok: true; count: number; conflicts: number } | { ok: false; error: string };

/** Fetch one iCal/JSON connection and store its busy times; the result is saved on the row. */
export async function syncConnection(
  conn: Pull,
  fetcher: typeof fetchFeed = fetchFeed,
): Promise<SyncOutcome> {
  if ((conn.inbound !== "ical" && conn.inbound !== "json") || !conn.feedUrl) {
    return { ok: false, error: "not_a_feed" };
  }
  let outcome: SyncOutcome;
  try {
    const { text } = await fetcher(conn.feedUrl);
    const { events } = normalizeEvents(parseFeed(conn.inbound, text));
    const result = await applyEvents(conn.id, events, "replace");
    outcome = { ok: true, count: events.length, conflicts: result.conflicts };
  } catch (e) {
    if (!(e instanceof FeedError)) {
      await reportError(e, { where: "calendar-sync", tags: { connection: conn.id } });
    }
    outcome = { ok: false, error: e instanceof FeedError ? e.code : "failed" };
  }
  await getDb()
    .update(calendarConnections)
    .set(
      outcome.ok
        ? { lastSyncAt: new Date(), lastSyncError: null, lastSyncCount: outcome.count }
        : { lastSyncAt: new Date(), lastSyncError: outcome.error },
    )
    .where(eq(calendarConnections.id, conn.id));
  return outcome;
}

const pullKinds = inArray(calendarConnections.inbound, ["ical", "json"]);
const staleSince = (ms: number) =>
  or(
    isNull(calendarConnections.lastSyncAt),
    lt(calendarConnections.lastSyncAt, new Date(Date.now() - ms)),
  );

/**
 * Refresh an aircraft's linked calendars that weren't read in the last `maxAgeMs` (SYN-2: right
 * before a booking is requested or accepted). Runs them in parallel; never throws.
 */
export async function syncAircraftCalendars(aircraftId: string, maxAgeMs = 60_000) {
  try {
    const due = await getDb()
      .select({
        id: calendarConnections.id,
        inbound: calendarConnections.inbound,
        feedUrl: calendarConnections.feedUrl,
      })
      .from(calendarConnections)
      .where(and(eq(calendarConnections.aircraftId, aircraftId), pullKinds, staleSince(maxAgeMs)));
    await Promise.all(due.map((c) => syncConnection(c)));
  } catch (e) {
    await reportError(e, { where: "calendar-sync", tags: { aircraft: aircraftId } });
  }
}

/** Scheduled job: linked calendars not read for `maxAgeMs`, oldest first. Returns how many. */
export async function syncDueCalendars(maxAgeMs = 10 * 60_000, limit = 50): Promise<number> {
  const due = await getDb()
    .select({
      id: calendarConnections.id,
      inbound: calendarConnections.inbound,
      feedUrl: calendarConnections.feedUrl,
    })
    .from(calendarConnections)
    .where(and(pullKinds, staleSince(maxAgeMs)))
    .orderBy(sql`${calendarConnections.lastSyncAt} asc nulls first`)
    .limit(limit);
  // A few at a time: feeds can be slow, and the database pool is small.
  for (let i = 0; i < due.length; i += 5) {
    await Promise.all(due.slice(i, i + 5).map((c) => syncConnection(c)));
  }
  return due.length;
}
