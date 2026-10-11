import "server-only";

import { and, count, desc, eq, gte, isNull, sql, sum } from "drizzle-orm";

import { addCredits, creditStatus } from "@/lib/billing/credits";
import { planOf } from "@/lib/billing/plan";
import type { PaidPlan } from "@/lib/billing/plans";
import { getDb } from "@/lib/db";
import {
  adminActions,
  billingPayments,
  billingSettings,
  planGrants,
  profiles,
  subscriptions,
} from "@/lib/db/schema";

// Plans for admins (SUB-7, SUB-9): give a plan or AI credits to a member, the beta switch and
// the founding-owner cut-off. Trusted admin code after requireAdmin(); every change is logged.

export type BillingAdminResult = { ok: true } | { ok: false; error: "notFound" | "invalid" };

const log = (
  adminId: string,
  action: string,
  targetType: string,
  targetId: string,
  reason: string | null,
) => getDb().insert(adminActions).values({ adminId, action, targetType, targetId, reason });

/** Give a member a plan, until a day or with no end. */
export async function grantPlan(
  adminId: string,
  userId: string,
  plan: PaidPlan,
  endsOn: string | null,
  note: string | null,
): Promise<BillingAdminResult> {
  const [member] = await getDb()
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.id, userId));
  if (!member) return { ok: false, error: "notFound" };
  const endsAt = endsOn ? new Date(`${endsOn}T23:59:59Z`) : null;
  if (endsAt && endsAt <= new Date()) return { ok: false, error: "invalid" };
  await getDb()
    .insert(planGrants)
    .values({ userId, plan, reason: "admin", endsAt, grantedBy: adminId, note });
  await log(
    adminId,
    "grant_plan",
    "user",
    userId,
    [plan, endsOn ?? "no end", note].filter(Boolean).join(" · "),
  );
  return { ok: true };
}

export async function revokeGrant(adminId: string, grantId: string): Promise<BillingAdminResult> {
  const [grant] = await getDb()
    .update(planGrants)
    .set({ revokedAt: new Date() })
    .where(and(eq(planGrants.id, grantId), isNull(planGrants.revokedAt)))
    .returning({ userId: planGrants.userId, plan: planGrants.plan, reason: planGrants.reason });
  if (!grant) return { ok: false, error: "notFound" };
  await log(adminId, "revoke_plan", "user", grant.userId, `${grant.plan} (${grant.reason})`);
  return { ok: true };
}

export async function giveCredits(
  adminId: string,
  userId: string,
  credits: number,
  note: string | null,
): Promise<BillingAdminResult> {
  if (!Number.isInteger(credits) || credits < 1 || credits > 10_000)
    return { ok: false, error: "invalid" };
  const [member] = await getDb()
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.id, userId));
  if (!member) return { ok: false, error: "notFound" };
  await addCredits(getDb(), { userId, credits, reason: "admin", adminId, note });
  await log(
    adminId,
    "give_credits",
    "user",
    userId,
    [String(credits), note].filter(Boolean).join(" · "),
  );
  return { ok: true };
}

/**
 * The beta switch: on (Owner for everyone, founding grants without an end), or ending in 7
 * days (SUB-6's warning), when founding owners' 12 months start counting.
 */
export async function setBeta(adminId: string, on: boolean): Promise<BillingAdminResult> {
  await getDb().transaction(async (tx) => {
    if (on) {
      await tx.update(billingSettings).set({ beta: true, betaEndsAt: null, updatedAt: new Date() });
      await tx
        .update(planGrants)
        .set({ endsAt: null })
        .where(and(eq(planGrants.reason, "founding"), isNull(planGrants.revokedAt)));
    } else {
      const ends = new Date(Date.now() + 7 * 86_400_000);
      await tx.update(billingSettings).set({ beta: true, betaEndsAt: ends, updatedAt: new Date() });
      await tx
        .update(planGrants)
        .set({ endsAt: sql`${ends.toISOString()}::timestamptz + interval '12 months'` })
        .where(
          and(
            eq(planGrants.reason, "founding"),
            isNull(planGrants.endsAt),
            isNull(planGrants.revokedAt),
          ),
        );
    }
  });
  await log(adminId, on ? "beta_on" : "beta_end", "billing", "settings", null);
  return { ok: true };
}

export async function setFoundingCutoff(
  adminId: string,
  day: string | null,
): Promise<BillingAdminResult> {
  await getDb().update(billingSettings).set({ foundingCutoff: day, updatedAt: new Date() });
  await log(adminId, "founding_cutoff", "billing", "settings", day ?? "none");
  return { ok: true };
}

/** A member's plan, its sources and AI credits, for Admin → Members. */
export async function memberBilling(userId: string) {
  const [plan, grants, [sub], credits] = await Promise.all([
    planOf(userId),
    getDb()
      .select()
      .from(planGrants)
      .where(and(eq(planGrants.userId, userId), isNull(planGrants.revokedAt)))
      .orderBy(desc(planGrants.createdAt)),
    getDb().select().from(subscriptions).where(eq(subscriptions.userId, userId)),
    creditStatus(userId),
  ]);
  const now = new Date();
  return {
    plan,
    grants: grants.filter((g) => !g.endsAt || g.endsAt > now),
    subscription: sub ?? null,
    credits,
  };
}

/** Numbers for Admin → Billing: subscriptions by plan, grants, payments in the last 30 days. */
export async function billingOverview() {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const db = getDb();
  const [subs, grants, paid] = await Promise.all([
    db
      .select({
        plan: subscriptions.plan,
        interval: subscriptions.interval,
        status: subscriptions.status,
        n: count(),
      })
      .from(subscriptions)
      .groupBy(subscriptions.plan, subscriptions.interval, subscriptions.status),
    db
      .select({ reason: planGrants.reason, n: count() })
      .from(planGrants)
      .where(isNull(planGrants.revokedAt))
      .groupBy(planGrants.reason),
    db
      .select({
        kind: billingPayments.kind,
        n: count(),
        cents: sum(billingPayments.amountCents).mapWith(Number),
      })
      .from(billingPayments)
      .where(and(eq(billingPayments.status, "paid"), gte(billingPayments.createdAt, since)))
      .groupBy(billingPayments.kind),
  ]);
  return { subs, grants, paid };
}
