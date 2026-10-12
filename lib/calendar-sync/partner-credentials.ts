import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { partnerCredentials } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/secrets";
import { isPartner, type Partner } from "./partner-list";

// Owners' API keys for partners (SYN-7, Account → Connected services). Trusted code: callers
// make sure it's the signed-in owner's own key (or it's the sync code). Keys are encrypted at
// rest and never returned: only their last 4 characters and status are.

const context = (userId: string, partner: Partner) => `${userId}:${partner}`;

export type PartnerCredentialView = {
  partner: Partner;
  hint: string;
  updatedAt: Date;
  lastUsedAt: Date | null;
  lastError: string | null;
};

export async function listPartnerCredentials(userId: string): Promise<PartnerCredentialView[]> {
  const rows = await getDb()
    .select({
      partner: partnerCredentials.partner,
      hint: partnerCredentials.hint,
      updatedAt: partnerCredentials.updatedAt,
      lastUsedAt: partnerCredentials.lastUsedAt,
      lastError: partnerCredentials.lastError,
    })
    .from(partnerCredentials)
    .where(eq(partnerCredentials.userId, userId));
  return rows.flatMap((r) => (isPartner(r.partner) ? [{ ...r, partner: r.partner }] : []));
}

export async function storePartnerKey(userId: string, partner: Partner, apiKey: string) {
  const values = {
    secret: encryptSecret(apiKey, context(userId, partner)),
    hint: apiKey.slice(-4),
    updatedAt: new Date(),
    lastError: null,
  };
  await getDb()
    .insert(partnerCredentials)
    .values({ userId, partner, ...values })
    .onConflictDoUpdate({
      target: [partnerCredentials.userId, partnerCredentials.partner],
      set: values,
    });
}

export async function deletePartnerKey(userId: string, partner: Partner): Promise<void> {
  await getDb()
    .delete(partnerCredentials)
    .where(and(eq(partnerCredentials.userId, userId), eq(partnerCredentials.partner, partner)));
}

/** The key in clear, only for the call to the partner; null if missing or unreadable. */
export async function partnerKeyOf(userId: string, partner: Partner): Promise<string | null> {
  const [row] = await getDb()
    .select({ secret: partnerCredentials.secret })
    .from(partnerCredentials)
    .where(and(eq(partnerCredentials.userId, userId), eq(partnerCredentials.partner, partner)));
  return row ? decryptSecret(row.secret, context(userId, partner)) : null;
}

/** After a call: when the key last worked, or why it didn't. */
export async function recordPartnerUse(userId: string, partner: Partner, error: string | null) {
  await getDb()
    .update(partnerCredentials)
    .set(error ? { lastError: error.slice(0, 100) } : { lastUsedAt: new Date(), lastError: null })
    .where(and(eq(partnerCredentials.userId, userId), eq(partnerCredentials.partner, partner)));
}
