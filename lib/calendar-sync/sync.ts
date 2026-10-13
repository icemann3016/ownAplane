import "server-only";

import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { aircraft, calendarConnections, type CalendarConnection } from "@/lib/db/schema";
import { reportError } from "@/lib/monitoring";
import { applyEvents } from "./apply";
import { normalizeEvents } from "./events";
import { FeedError, fetchFeed, parseFeed } from "./feeds";
import { ownerPartnersDue } from "./partner-credentials";
import { isPartner } from "./partner-list";
import { syncDuePartners, syncPartnerAccount } from "./partners";

// Pulling linked calendars (SYN-1, SYN-2) and partners' APIs (SYN-7, lib/calendar-sync/partners.ts).
// Trusted code: run by the owner's "Sync now", right before a booking is requested or accepted,
// and by the scheduled jobs.

type Pull = Pick<CalendarConnection, "id" | "inbound" | "feedUrl" | "partner">;

export type SyncOutcome =
  { ok: true; count: number; conflicts: number } | { ok: false; error: string };

/** A partner connection is read with the whole account: its owner's key covers all aircraft. */
async function syncPartnerConnection(conn: Pull, fetcher: typeof fetchFeed): Promise<SyncOutcome> {
  const [row] = await getDb()
    .select({ ownerId: aircraft.ownerId })
    .from(calendarConnections)
    .innerJoin(aircraft, eq(aircraft.id, calendarConnections.aircraftId))
    .where(eq(calendarConnections.id, conn.id));
  if (!row || !isPartner(conn.partner)) return { ok: false, error: "not_a_feed" };
  const result = await syncPartnerAccount(row.ownerId, conn.partner, fetcher);
  if (!result.ok) return result;
  const [after] = await getDb()
    .select({ count: calendarConnections.lastSyncCount, error: calendarConnections.lastSyncError })
    .from(calendarConnections)
    .where(eq(calendarConnections.id, conn.id));
  return after?.error
    ? { ok: false, error: after.error }
    : { ok: true, count: after?.count ?? 0, conflicts: 0 };
}

/** Read one link or partner connection and store its busy times; the result is saved on the row. */
export async function syncConnection(
  conn: Pull,
  fetcher: typeof fetchFeed = fetchFeed,
): Promise<SyncOutcome> {
  if (conn.inbound === "partner") return syncPartnerConnection(conn, fetcher);
  if ((conn.inbound !== "ical" && conn.inbound !== "json") || !conn.feedUrl) {
    return { ok: false, error: "not_a_feed" };
  }
  const [kind, link] = [conn.inbound, conn.feedUrl];
  let outcome: SyncOutcome;
  try {
    const { events } = normalizeEvents(parseFeed(kind, (await fetcher(link)).text));
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
const pullColumns = {
  id: calendarConnections.id,
  inbound: calendarConnections.inbound,
  feedUrl: calendarConnections.feedUrl,
  partner: calendarConnections.partner,
};
const staleSince = (ms: number) =>
  or(
    isNull(calendarConnections.lastSyncAt),
    lt(calendarConnections.lastSyncAt, new Date(Date.now() - ms)),
  );

/**
 * Refresh an aircraft's linked calendars and its owner's partners that weren't read in the last
 * `maxAgeMs` (SYN-2: right before a booking is requested or accepted). Runs them in parallel;
 * never throws.
 */
export async function syncAircraftCalendars(aircraftId: string, maxAgeMs = 60_000) {
  try {
    const [due, [plane]] = await Promise.all([
      getDb()
        .select(pullColumns)
        .from(calendarConnections)
        .where(
          and(eq(calendarConnections.aircraftId, aircraftId), pullKinds, staleSince(maxAgeMs)),
        ),
      getDb()
        .select({ ownerId: aircraft.ownerId })
        .from(aircraft)
        .where(eq(aircraft.id, aircraftId)),
    ]);
    const ownerId = plane?.ownerId;
    const partners = ownerId ? await ownerPartnersDue(ownerId, maxAgeMs) : [];
    await Promise.all([
      ...due.map((c) => syncConnection(c)),
      ...partners.map((p) => syncPartnerAccount(ownerId as string, p)),
    ]);
  } catch (e) {
    await reportError(e, { where: "calendar-sync", tags: { aircraft: aircraftId } });
  }
}

/**
 * Scheduled job: linked calendars and owners' partner keys not read for `maxAgeMs`, oldest
 * first. Returns how many were read.
 */
export async function syncDueCalendars(maxAgeMs = 10 * 60_000, limit = 50): Promise<number> {
  const due = await getDb()
    .select(pullColumns)
    .from(calendarConnections)
    .where(and(pullKinds, staleSince(maxAgeMs)))
    .orderBy(sql`${calendarConnections.lastSyncAt} asc nulls first`)
    .limit(limit);
  // A few at a time: feeds can be slow, and the database pool is small.
  for (let i = 0; i < due.length; i += 5) {
    await Promise.all(due.slice(i, i + 5).map((c) => syncConnection(c)));
  }
  return due.length + (await syncDuePartners(maxAgeMs, limit));
}
