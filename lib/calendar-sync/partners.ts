import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { type Aircraft, aircraft, calendarConnections } from "@/lib/db/schema";
import type { ExternalEvent } from "./events";
import type { FeedErrorCode } from "./feed-errors";
import { FeedError, fetchFeed } from "./feeds";
import { listPartnerCredentials, partnerKeyOf, recordPartnerUse } from "./partner-credentials";
import { type Partner, PARTNER_INFO } from "./partner-list";
import { readRafAviation } from "./rafaviation";

// Reading a partner's own API (SYN-7) with the aircraft owner's key for it (Account → Connected
// services), asking for the connected aircraft's registration. Trusted code.

const READERS: Record<
  Partner,
  (
    apiKey: string,
    registration: string,
    now: Date,
    fetcher: typeof fetchFeed,
  ) => Promise<ExternalEvent[]>
> = {
  rafaviation: readRafAviation,
};

/** The partners an aircraft can be connected to: those its owner added a key for; not drafts. */
export async function partnersFor(plane: Pick<Aircraft, "ownerId" | "status">): Promise<Partner[]> {
  if (plane.status === "draft") return [];
  return (await listPartnerCredentials(plane.ownerId)).map((c) => c.partner);
}

/** Check a key the owner entered with one read, before it is kept. */
export async function checkPartnerKey(
  partner: Partner,
  apiKey: string,
  fetcher: typeof fetchFeed = fetchFeed,
): Promise<{ ok: true } | { ok: false; error: FeedErrorCode | "failed" }> {
  try {
    await READERS[partner](
      apiKey,
      PARTNER_INFO[partner].registrations[0] ?? "",
      new Date(),
      fetcher,
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof FeedError ? e.code : "failed" };
  }
}

/** A partner connection's busy times, read with its aircraft owner's key. */
export async function readPartner(
  connectionId: string,
  partner: Partner,
  fetcher: typeof fetchFeed = fetchFeed,
): Promise<ExternalEvent[]> {
  const [conn] = await getDb()
    .select({ ownerId: aircraft.ownerId, registration: aircraft.registration })
    .from(calendarConnections)
    .innerJoin(aircraft, eq(aircraft.id, calendarConnections.aircraftId))
    .where(eq(calendarConnections.id, connectionId));
  const key = conn ? await partnerKeyOf(conn.ownerId, partner) : null;
  if (!conn || !key) throw new FeedError("partner_unavailable");
  try {
    const events = await READERS[partner](key, conn.registration, new Date(), fetcher);
    await recordPartnerUse(conn.ownerId, partner, null);
    return events;
  } catch (e) {
    if (e instanceof FeedError && e.code === "key_rejected") {
      await recordPartnerUse(conn.ownerId, partner, e.code);
    }
    throw e;
  }
}
