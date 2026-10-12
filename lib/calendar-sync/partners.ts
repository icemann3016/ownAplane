import "server-only";

import type { Aircraft } from "@/lib/db/schema";
import type { ExternalEvent } from "./events";
import { sameRegistration } from "./events";
import { FeedError, fetchFeed } from "./feeds";
import { type Partner, PARTNER_INFO, PARTNERS } from "./partner-list";
import { readRafAviation } from "./rafaviation";

// Reading a partner's own API (SYN-7) with ownAplane's key for it, a server secret (Vercel
// environment variable, never stored in the database or sent to a browser).

const READERS: Record<
  Partner,
  (apiKey: string, now: Date, fetcher: typeof fetchFeed) => Promise<ExternalEvent[]>
> = {
  rafaviation: readRafAviation,
};

const KEY_VARIABLES: Record<Partner, string> = {
  rafaviation: "RAFAVIATION_API_KEY",
};

const partnerKey = (partner: Partner) => process.env[KEY_VARIABLES[partner]]?.trim() || null;

/**
 * The partners an aircraft can be connected to: set up here (their key is set) and sharing this
 * aircraft's bookings. Not for drafts: only registrations of non-draft aircraft are unique.
 */
export function partnersFor(plane: Pick<Aircraft, "registration" | "status">): Partner[] {
  if (plane.status === "draft") return [];
  return PARTNERS.filter(
    (p) =>
      partnerKey(p) !== null &&
      PARTNER_INFO[p].registrations.some((r) => sameRegistration(r, plane.registration)),
  );
}

export async function readPartner(
  partner: Partner,
  fetcher: typeof fetchFeed = fetchFeed,
): Promise<ExternalEvent[]> {
  const key = partnerKey(partner);
  if (!key) throw new FeedError("partner_unavailable", KEY_VARIABLES[partner]);
  return READERS[partner](key, new Date(), fetcher);
}
