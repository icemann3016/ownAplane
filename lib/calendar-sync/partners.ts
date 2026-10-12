import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { calendarPartnerKeys } from "@/lib/db/schema";
import type { ExternalEvent } from "./events";
import { FeedError, fetchFeed } from "./feeds";
import type { Partner } from "./partner-list";
import { readRafAviation } from "./rafaviation";

// Reading a partner's own API (SYN-7) with the key the owner gave us. Trusted code: callers
// check that the user owns the connection first; keys are never read back to anyone.

const READERS: Record<
  Partner,
  (apiKey: string, now: Date, fetcher: typeof fetchFeed) => Promise<ExternalEvent[]>
> = {
  rafaviation: readRafAviation,
};

/** The last characters of a key, so the owner recognises it. */
export const keyHint = (apiKey: string) => apiKey.slice(-4);

export async function savePartnerKey(connectionId: string, apiKey: string) {
  await getDb()
    .insert(calendarPartnerKeys)
    .values({ connectionId, apiKey })
    .onConflictDoUpdate({
      target: calendarPartnerKeys.connectionId,
      set: { apiKey, updatedAt: new Date() },
    });
}

export async function readPartner(
  connectionId: string,
  partner: Partner,
  fetcher: typeof fetchFeed = fetchFeed,
): Promise<ExternalEvent[]> {
  const [row] = await getDb()
    .select({ apiKey: calendarPartnerKeys.apiKey })
    .from(calendarPartnerKeys)
    .where(eq(calendarPartnerKeys.connectionId, connectionId));
  if (!row) throw new FeedError("key_rejected", "no key");
  return READERS[partner](row.apiKey, new Date(), fetcher);
}
