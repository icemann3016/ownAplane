import "server-only";

import { and, eq, inArray, ne } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { aircraft, calendarConnections } from "@/lib/db/schema";
import { reportError } from "@/lib/monitoring";
import { applyEvents } from "./apply";
import { type ExternalEvent, normalizeEvents, sameRegistration } from "./events";
import type { FeedErrorCode } from "./feed-errors";
import { FeedError, fetchFeed } from "./feeds";
import {
  markPartnerSync,
  partnerKeyOf,
  partnerKeysDue,
  recordPartnerUse,
} from "./partner-credentials";
import { type Partner, PARTNER_INFO } from "./partner-list";
import { readRafAviation } from "./rafaviation";

// Partners' own APIs (SYN-7), read with the owner's key (Account → Connected services). One read
// per key covers all the owner's aircraft: each booking's registration picks the aircraft, whose
// partner connection is made automatically the first time it has bookings. Trusted code.

const READERS: Record<
  Partner,
  (apiKey: string, now: Date, fetcher: typeof fetchFeed) => Promise<ExternalEvent[]>
> = {
  rafaviation: readRafAviation,
};

type Failure = { ok: false; error: FeedErrorCode | "failed" };

const pgMessage = (e: unknown) => (e as { cause?: { message?: string } }).cause?.message;

const failure = (e: unknown): Failure => ({
  ok: false,
  error: e instanceof FeedError ? e.code : "failed",
});

/** Check a key the owner entered with one read, before it is kept. */
export async function checkPartnerKey(
  partner: Partner,
  apiKey: string,
  fetcher: typeof fetchFeed = fetchFeed,
): Promise<{ ok: true } | Failure> {
  try {
    await READERS[partner](apiKey, new Date(), fetcher);
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

export type PartnerSyncResult =
  | {
      ok: true;
      /** The owner's aircraft the partner had bookings for, with how many. */
      aircraft: { registration: string; count: number }[];
      /** Registrations in the answer that none of the owner's aircraft (not drafts) has. */
      unmatched: string[];
    }
  | Failure;

/** The owner's partner connection for an aircraft, made the first time it has bookings. */
async function connectionFor(aircraftId: string, ownerId: string, partner: Partner) {
  const db = getDb();
  const [created] = await db
    .insert(calendarConnections)
    .values({
      aircraftId,
      name: PARTNER_INFO[partner].name,
      inbound: "partner",
      partner,
      createdBy: ownerId,
    })
    .onConflictDoNothing()
    .returning({ id: calendarConnections.id });
  if (created) return created.id;
  const [row] = await db
    .select({ id: calendarConnections.id })
    .from(calendarConnections)
    .where(
      and(eq(calendarConnections.aircraftId, aircraftId), eq(calendarConnections.partner, partner)),
    );
  return row?.id ?? null;
}

/**
 * Read a partner with the owner's key and put each booking on the owner's aircraft with that
 * registration (drafts excluded). Partner connections of aircraft without bookings are emptied.
 * The outcome is saved on the key and on each connection; never throws.
 */
export async function syncPartnerAccount(
  ownerId: string,
  partner: Partner,
  fetcher: typeof fetchFeed = fetchFeed,
): Promise<PartnerSyncResult> {
  try {
    await markPartnerSync(ownerId, partner);
    const db = getDb();
    const planes = await db
      .select({ id: aircraft.id, registration: aircraft.registration })
      .from(aircraft)
      .where(and(eq(aircraft.ownerId, ownerId), ne(aircraft.status, "draft")));
    const existing = planes.length
      ? await db
          .select({ id: calendarConnections.id, aircraftId: calendarConnections.aircraftId })
          .from(calendarConnections)
          .where(
            and(
              inArray(
                calendarConnections.aircraftId,
                planes.map((p) => p.id),
              ),
              eq(calendarConnections.partner, partner),
            ),
          )
      : [];
    const save = (id: string, set: Partial<typeof calendarConnections.$inferInsert>) =>
      db
        .update(calendarConnections)
        .set({ lastSyncAt: new Date(), ...set })
        .where(eq(calendarConnections.id, id));

    let events: ExternalEvent[];
    try {
      const key = await partnerKeyOf(ownerId, partner);
      if (!key) throw new FeedError("partner_unavailable");
      events = normalizeEvents(await READERS[partner](key, new Date(), fetcher)).events;
    } catch (e) {
      const result = failure(e);
      if (!(e instanceof FeedError)) {
        await reportError(e, { where: "calendar-sync", tags: { partner } });
      }
      await recordPartnerUse(ownerId, partner, result.error);
      for (const c of existing) await save(c.id, { lastSyncError: result.error });
      return result;
    }
    await recordPartnerUse(ownerId, partner, null);

    const matched: { registration: string; count: number }[] = [];
    for (const plane of planes) {
      const own = events.filter(
        (e) => e.registration && sameRegistration(e.registration, plane.registration),
      );
      let id = existing.find((c) => c.aircraftId === plane.id)?.id ?? null;
      try {
        if (!id && own.length) id = await connectionFor(plane.id, ownerId, partner);
        if (!id) continue;
        await applyEvents(id, own, "replace");
        await save(id, { lastSyncError: null, lastSyncCount: own.length });
        if (own.length) matched.push({ registration: plane.registration, count: own.length });
      } catch (e) {
        // The aircraft already has 10 connected systems: its partner bookings can't be added.
        if (!id && pgMessage(e) === "too_many_connections") continue;
        await reportError(e, { where: "calendar-sync", tags: { aircraft: plane.id } });
        if (id) await save(id, { lastSyncError: "failed" });
      }
    }
    const unmatched = new Set<string>();
    for (const { registration: r } of events) {
      if (r && !planes.some((p) => sameRegistration(p.registration, r))) unmatched.add(r);
    }
    return { ok: true, aircraft: matched, unmatched: [...unmatched] };
  } catch (e) {
    await reportError(e, { where: "calendar-sync", tags: { partner } });
    return { ok: false, error: "failed" };
  }
}

/** Scheduled job: owners' keys not read for `maxAgeMs`. Returns how many were read. */
export async function syncDuePartners(maxAgeMs = 10 * 60_000, limit = 50): Promise<number> {
  const due = await partnerKeysDue(maxAgeMs, limit);
  // A few at a time: partners limit requests, and the database pool is small.
  for (let i = 0; i < due.length; i += 5) {
    await Promise.all(due.slice(i, i + 5).map((k) => syncPartnerAccount(k.userId, k.partner)));
  }
  return due.length;
}

/** Remove an owner's partner connections (and so their busy times), when the key is removed. */
export async function removePartnerConnections(ownerId: string, partner: Partner) {
  await getDb()
    .delete(calendarConnections)
    .where(
      and(
        eq(calendarConnections.partner, partner),
        inArray(
          calendarConnections.aircraftId,
          getDb().select({ id: aircraft.id }).from(aircraft).where(eq(aircraft.ownerId, ownerId)),
        ),
      ),
    );
}
