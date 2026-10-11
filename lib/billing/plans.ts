// Plans, prices and credit packs in one place (SUB-1). The database mirrors the limits in
// public.plan_limit() (db/migrations/0071_billing_security.sql; a test keeps them equal).
// Prices are in euro cents incl. VAT; with a payment provider they also live there.

export const PLAN_NAMES = ["free", "owner", "fleet"] as const;
export type Plan = (typeof PLAN_NAMES)[number];
export type PaidPlan = Exclude<Plan, "free">;
export const INTERVALS = ["month", "year"] as const;
export type Interval = (typeof INTERVALS)[number];

export type PlanFeatures = {
  /** Listed aircraft at a time. */
  aircraft: number;
  /** Aircraft shown first in search, labelled "Featured". */
  featured: number;
  instantBooking: boolean;
  /** Months of usage history and CSV exports; null = all. */
  usageMonths: number | null;
  statistics: boolean;
  /** Calendar links to export bookings to Google/Outlook (export-only connections). */
  calendarLink: boolean;
  /** AI reads included per UTC month (not during the beta). */
  aiCreditsPerMonth: number;
};

export const PLANS: Record<Plan, PlanFeatures> = {
  free: {
    aircraft: 1,
    featured: 0,
    instantBooking: false,
    usageMonths: 3,
    statistics: false,
    calendarLink: false,
    aiCreditsPerMonth: 0,
  },
  owner: {
    aircraft: 2,
    featured: 1,
    instantBooking: true,
    usageMonths: null,
    statistics: true,
    calendarLink: true,
    aiCreditsPerMonth: 10,
  },
  fleet: {
    aircraft: 10,
    featured: 3,
    instantBooking: true,
    usageMonths: null,
    statistics: true,
    calendarLink: true,
    aiCreditsPerMonth: 50,
  },
};

/** Price per period in euro cents incl. VAT. */
export const PRICES: Record<PaidPlan, Record<Interval, number>> = {
  owner: { month: 900, year: 9000 },
  fleet: { month: 3900, year: 39000 },
};

export const CURRENCY = "EUR";

/** AI reading credits: free to try, then packs that never expire. */
export const WELCOME_CREDITS = 5;
export const CREDIT_PACKS = {
  small: { credits: 50, priceCents: 500 },
  large: { credits: 200, priceCents: 1500 },
} as const;
export type CreditPack = keyof typeof CREDIT_PACKS;

const RANK: Record<Plan, number> = { free: 0, owner: 1, fleet: 2 };

export const planRank = (plan: Plan) => RANK[plan];

export const isPaidPlan = (plan: string): plan is PaidPlan => plan === "owner" || plan === "fleet";

/**
 * What changing from one paid plan to another does: upgrades (a higher plan, or monthly →
 * yearly on the same plan) start now with a prorated payment; downgrades (a lower plan, or
 * yearly → monthly) start at the next renewal; "same" changes nothing.
 */
export function changeKind(
  from: { plan: PaidPlan; interval: Interval },
  to: { plan: PaidPlan; interval: Interval },
): "upgrade" | "downgrade" | "same" {
  if (from.plan === to.plan && from.interval === to.interval) return "same";
  if (RANK[to.plan] > RANK[from.plan]) return "upgrade";
  if (RANK[to.plan] < RANK[from.plan]) return "downgrade";
  return to.interval === "year" ? "upgrade" : "downgrade";
}

/**
 * An upgrade now: the new price less what is left of the current period (in cents, ≥ 0). Pure.
 */
export function proratedCharge(
  current: { priceCents: number; periodStart: Date; periodEnd: Date },
  newPriceCents: number,
  now: Date,
): number {
  const total = current.periodEnd.getTime() - current.periodStart.getTime();
  const left = Math.max(0, current.periodEnd.getTime() - now.getTime());
  const unused = total > 0 ? Math.round((current.priceCents * left) / total) : 0;
  return Math.max(0, newPriceCents - unused);
}

/** The end of a period that starts at `start` (calendar months; the 31st becomes month end). */
export function periodEnd(start: Date, interval: Interval): Date {
  const months = interval === "year" ? 12 : 1;
  const end = new Date(start);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + months);
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, last));
  return end;
}
