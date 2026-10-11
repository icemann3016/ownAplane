import "server-only";

import { and, count, eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { asUser } from "@/lib/db/rls";
import { aircraft, billingSettings } from "@/lib/db/schema";
import { type Plan, PLANS } from "./plans";

// The plan a user has (public.plan_of(): subscription, grants, beta) and what they use of it.

export type PlanSource = "free" | "subscription" | "admin" | "founding" | "beta";
export type CurrentPlan = { plan: Plan; source: PlanSource; until: Date | null };

type Row = { plan: Plan; source: PlanSource; until: string | Date | null };
const toPlan = (r: Row | undefined): CurrentPlan => ({
  plan: r?.plan ?? "free",
  source: r?.source ?? "free",
  until: r?.until ? new Date(r.until) : null,
});

/** The signed-in user's own plan (through RLS). */
export async function getMyPlan(userId: string): Promise<CurrentPlan> {
  const rows = (await asUser(userId, (tx) =>
    tx.execute(sql`select plan, source, until from public.my_plan()`),
  )) as unknown as Row[];
  return toPlan(rows[0]);
}

/**
 * Any user's plan, at a moment (default now), for trusted code (admins, jobs, credits);
 * `withBeta: false` leaves the beta out (the monthly AI allowance isn't part of it).
 */
export async function planOf(
  userId: string,
  options: { at?: Date; withBeta?: boolean } = {},
): Promise<CurrentPlan> {
  const at = (options.at ?? new Date()).toISOString();
  const rows = (await getDb().execute(
    sql`select plan, source, until
        from public.plan_of(${userId}::uuid, ${at}::timestamptz, ${options.withBeta ?? true})`,
  )) as unknown as Row[];
  return toPlan(rows[0]);
}

/** Listed and featured aircraft of an owner, against the plan's limits. */
export async function planUsage(userId: string, plan: Plan) {
  const [row] = await getDb()
    .select({
      listed: count(),
      featured: sql<number>`count(*) filter (where ${aircraft.featured})`.mapWith(Number),
    })
    .from(aircraft)
    .where(and(eq(aircraft.ownerId, userId), eq(aircraft.status, "listed")));
  return {
    listed: row?.listed ?? 0,
    featured: row?.featured ?? 0,
    aircraftLimit: PLANS[plan].aircraft,
    featuredLimit: PLANS[plan].featured,
  };
}

export type BillingSettings = typeof billingSettings.$inferSelect;

export async function getBillingSettings(): Promise<BillingSettings> {
  const [row] = await getDb().select().from(billingSettings).where(eq(billingSettings.id, true));
  return (
    row ?? { id: true, beta: false, betaEndsAt: null, foundingCutoff: null, updatedAt: new Date() }
  );
}

/** Whether the beta (Owner features for everyone) is on right now. */
export const betaActive = (s: BillingSettings, now = new Date()) =>
  s.beta && (!s.betaEndsAt || now < s.betaEndsAt);
