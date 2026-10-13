import "server-only";

import { and, eq, isNull, lt, or, sql } from "drizzle-orm";

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
  lastSyncAt: Date | null;
};

export async function listPartnerCredentials(userId: string): Promise<PartnerCredentialView[]> {
  const rows = await getDb()
    .select({
      partner: partnerCredentials.partner,
      hint: partnerCredentials.hint,
      updatedAt: partnerCredentials.updatedAt,
      lastUsedAt: partnerCredentials.lastUsedAt,
      lastError: partnerCredentials.lastError,
      lastSyncAt: partnerCredentials.lastSyncAt,
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

/** Keys whose partner wasn't read for `maxAgeMs` (the scheduled sync), oldest first. */
export async function partnerKeysDue(maxAgeMs: number, limit = 50, userId?: string) {
  const rows = await getDb()
    .select({ userId: partnerCredentials.userId, partner: partnerCredentials.partner })
    .from(partnerCredentials)
    .where(
      and(
        userId ? eq(partnerCredentials.userId, userId) : undefined,
        or(
          isNull(partnerCredentials.lastSyncAt),
          lt(partnerCredentials.lastSyncAt, new Date(Date.now() - maxAgeMs)),
        ),
      ),
    )
    .orderBy(sql`${partnerCredentials.lastSyncAt} asc nulls first`)
    .limit(limit);
  return rows.flatMap((r) => (isPartner(r.partner) ? [{ ...r, partner: r.partner }] : []));
}

/** An owner's keys not read for `maxAgeMs` (right before a booking of one of their aircraft). */
export async function ownerPartnersDue(userId: string, maxAgeMs: number): Promise<Partner[]> {
  return (await partnerKeysDue(maxAgeMs, 10, userId)).map((k) => k.partner);
}

export async function markPartnerSync(userId: string, partner: Partner) {
  await getDb()
    .update(partnerCredentials)
    .set({ lastSyncAt: new Date() })
    .where(and(eq(partnerCredentials.userId, userId), eq(partnerCredentials.partner, partner)));
}

/** After a call: when the key last worked, or why it didn't. */
export async function recordPartnerUse(userId: string, partner: Partner, error: string | null) {
  await getDb()
    .update(partnerCredentials)
    .set(error ? { lastError: error.slice(0, 100) } : { lastUsedAt: new Date(), lastError: null })
    .where(and(eq(partnerCredentials.userId, userId), eq(partnerCredentials.partner, partner)));
}
