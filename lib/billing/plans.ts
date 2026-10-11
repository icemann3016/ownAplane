// Plans, prices and credit packs in one place (SUB-1). The database mirrors the limits in
// public.plan_limit() (db/migrations/0071_billing_security.sql; a test keeps them equal).
// Prices are in euro cents incl. VAT; with a payment provider they also live there.

/** In order: each plan includes what the ones before it give (Owner and Fleet include Pilot Plus). */
export const PLAN_NAMES = ["free", "pilot", "owner", "fleet"] as const;
export type Plan = (typeof PLAN_NAMES)[number];
export type PaidPlan = Exclude<Plan, "free">;
export const INTERVALS = ["month", "year"] as const;
export type Interval = (typeof INTERVALS)[number];

export type PlanFeatures = {
  // For pilots
  /** Passenger and night recency, class rating revalidation and LAPL recency from the logbook. */
  currencyTracker: boolean;
  /** EASA print of the logbook and pilot statistics. */
  logbookExtras: boolean;
  /** Saved searches with alerts. */
  savedSearches: number;
  /** A private calendar link of the user's own bookings. */
  bookingsCalendar: boolean;
  // For owners
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

const PILOT_FREE = {
  currencyTracker: false,
  logbookExtras: false,
  savedSearches: 2,
  bookingsCalendar: false,
};
const PILOT_PLUS = {
  currencyTracker: true,
  logbookExtras: true,
  savedSearches: 20,
  bookingsCalendar: true,
};
const OWNER_FREE = {
  aircraft: 1,
  featured: 0,
  instantBooking: false,
  usageMonths: 3,
  statistics: false,
  calendarLink: false,
};

export const PLANS: Record<Plan, PlanFeatures> = {
  free: { ...PILOT_FREE, ...OWNER_FREE, aiCreditsPerMonth: 0 },
  pilot: { ...PILOT_PLUS, ...OWNER_FREE, aiCreditsPerMonth: 20 },
  owner: {
    ...PILOT_PLUS,
    aircraft: 2,
    featured: 1,
    instantBooking: true,
    usageMonths: null,
    statistics: true,
    calendarLink: true,
    aiCreditsPerMonth: 20,
  },
  fleet: {
    ...PILOT_PLUS,
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
  pilot: { month: 400, year: 4000 },
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

const RANK: Record<Plan, number> = { free: 0, pilot: 1, owner: 2, fleet: 3 };

export const planRank = (plan: Plan) => RANK[plan];

export const isPaidPlan = (plan: string): plan is PaidPlan =>
  plan === "pilot" || plan === "owner" || plan === "fleet";

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

/** Where a plan's usage history starts (null = all of it): the same day N months ago. */
export function usageSince(plan: Plan, now = new Date()): Date | null {
  const months = PLANS[plan].usageMonths;
  if (months === null) return null;
  const since = new Date(now);
  since.setUTCMonth(since.getUTCMonth() - months);
  return since;
}
