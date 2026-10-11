import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { aiCreditEntries } from "@/lib/db/schema";
import { planOf } from "./plan";
import { PLANS, WELCOME_CREDITS } from "./plans";

// AI reading credits: one credit reads one document or one logbook spread. Reads use the
// plan's monthly allowance first (UTC month, not during the beta), then credits (welcome,
// bought, given by admins; never expire). A read that fails gets its credit back.

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type CreditStatus = {
  /** Credits that never expire (welcome, bought, given). */
  balance: number;
  allowance: { perMonth: number; used: number; left: number };
  /** What can be read now. */
  available: number;
};

const monthStart = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/** Every user gets the welcome credits once, the first time credits are looked at. */
async function ensureWelcome(tx: Tx | Db, userId: string) {
  await tx
    .insert(aiCreditEntries)
    .values({ userId, pool: "credits", reason: "welcome", delta: WELCOME_CREDITS })
    .onConflictDoNothing();
}

async function status(tx: Tx | Db, userId: string): Promise<CreditStatus> {
  const { plan } = await planOf(userId, { withBeta: false });
  const perMonth = PLANS[plan].aiCreditsPerMonth;
  const [row] = await tx
    .select({
      balance: sql<number>`coalesce(sum(${aiCreditEntries.delta})
        filter (where ${aiCreditEntries.pool} = 'credits'), 0)`.mapWith(Number),
      used: sql<number>`coalesce(-sum(${aiCreditEntries.delta})
        filter (where ${aiCreditEntries.pool} = 'allowance'
          and ${aiCreditEntries.createdAt} >= ${monthStart().toISOString()}::timestamptz), 0)`.mapWith(
        Number,
      ),
    })
    .from(aiCreditEntries)
    .where(eq(aiCreditEntries.userId, userId));
  const balance = Math.max(0, row?.balance ?? 0);
  const used = Math.max(0, row?.used ?? 0);
  const left = Math.max(0, perMonth - used);
  return { balance, allowance: { perMonth, used, left }, available: balance + left };
}

export async function creditStatus(userId: string): Promise<CreditStatus> {
  const db = getDb();
  await ensureWelcome(db, userId);
  return status(db, userId);
}

/** Take one credit for a read (allowance first); refused with `no_credits`. */
export async function spendCredit(
  userId: string,
): Promise<{ ok: true; entryId: string } | { ok: false; error: "no_credits" }> {
  return getDb().transaction(async (tx) => {
    // One spender per user at a time, so two reads can't take the last credit twice.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 7))`);
    await ensureWelcome(tx, userId);
    const now = await status(tx, userId);
    const pool = now.allowance.left > 0 ? "allowance" : now.balance > 0 ? "credits" : null;
    if (!pool) return { ok: false, error: "no_credits" } as const;
    const [row] = await tx
      .insert(aiCreditEntries)
      .values({ userId, pool, reason: "read", delta: -1 })
      .returning({ id: aiCreditEntries.id });
    return { ok: true, entryId: row!.id } as const;
  });
}

/** Give back the credit of a read that didn't work (once). */
export async function refundCredit(entryId: string): Promise<void> {
  const db = getDb();
  const [spent] = await db
    .select()
    .from(aiCreditEntries)
    .where(and(eq(aiCreditEntries.id, entryId), eq(aiCreditEntries.reason, "read")));
  if (!spent) return;
  // The month's allowance was used this month only; a refund goes back to the same pool.
  const pool =
    spent.pool === "allowance" && spent.createdAt >= monthStart() ? "allowance" : "credits";
  await db
    .insert(aiCreditEntries)
    .values({ userId: spent.userId, pool, reason: "refund", delta: 1, refundOf: entryId })
    .onConflictDoNothing();
}

/** Credits bought or given by an admin. */
export async function addCredits(
  tx: Tx | Db,
  entry: {
    userId: string;
    credits: number;
    reason: "purchase" | "admin";
    paymentId?: string;
    adminId?: string;
    note?: string | null;
  },
): Promise<void> {
  await ensureWelcome(tx, entry.userId);
  await tx.insert(aiCreditEntries).values({
    userId: entry.userId,
    pool: "credits",
    reason: entry.reason,
    delta: entry.credits,
    paymentId: entry.paymentId ?? null,
    adminId: entry.adminId ?? null,
    note: entry.note ?? null,
  });
}

/** Reads used this month, for admins. */
export async function readsThisMonth(): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(aiCreditEntries)
    .where(and(eq(aiCreditEntries.reason, "read"), gte(aiCreditEntries.createdAt, monthStart())));
  return row?.n ?? 0;
}
