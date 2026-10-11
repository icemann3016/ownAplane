import "server-only";

import { z } from "zod";

import { creditStatus } from "@/lib/billing/credits";
import { getMyPlan, planUsage } from "@/lib/billing/plan";
import { type PaidPlan, PLANS } from "@/lib/billing/plans";
import { getSubscription } from "@/lib/billing/subscriptions";
import { errors, ok, output, ref, signedIn } from "./openapi-helpers";

// The user's plan and AI credits for apps (SUB-4). Buying and changing plans happens on the
// website (app stores have their own rules for in-app purchases).

const day = z.iso.datetime().nullable();

export const planResponse = z.object({
  plan: z.enum(["free", "pilot", "owner", "fleet"]),
  source: z
    .enum(["free", "subscription", "admin", "founding", "beta"])
    .describe("Where the plan comes from"),
  until: day.describe("When that source ends, if known"),
  limits: z.object({
    currencyTracker: z.boolean(),
    logbookExtras: z.boolean().describe("EASA print and pilot statistics"),
    savedSearches: z.number().int(),
    bookingsCalendar: z.boolean(),
    aircraft: z.number().int(),
    featured: z.number().int(),
    instantBooking: z.boolean(),
    usageMonths: z.number().int().nullable().describe("Months of usage history; null = all"),
    statistics: z.boolean(),
    calendarLink: z.boolean(),
    aiCreditsPerMonth: z.number().int(),
  }),
  usage: z.object({ listedAircraft: z.number().int(), featuredAircraft: z.number().int() }),
  subscription: z
    .object({
      plan: z.enum(["pilot", "owner", "fleet"]),
      interval: z.enum(["month", "year"]),
      status: z.enum(["active", "past_due", "ended"]),
      currentPeriodEnd: z.iso.datetime(),
      cancelAtPeriodEnd: z.boolean(),
      scheduledPlan: z.enum(["pilot", "owner", "fleet"]).nullable(),
      graceUntil: day,
      test: z.boolean().describe("A test-mode subscription: no money moves"),
    })
    .nullable(),
  aiCredits: z.object({
    available: z.number().int(),
    balance: z.number().int().describe("Credits that never expire"),
    allowanceLeft: z.number().int().describe("Included reads left this UTC month"),
    allowancePerMonth: z.number().int(),
  }),
});

export async function planDto(userId: string): Promise<z.infer<typeof planResponse>> {
  const [current, sub, credits] = await Promise.all([
    getMyPlan(userId),
    getSubscription(userId),
    creditStatus(userId),
  ]);
  const usage = await planUsage(userId, current.plan);
  return {
    plan: current.plan,
    source: current.source,
    until: current.until?.toISOString() ?? null,
    limits: PLANS[current.plan],
    usage: { listedAircraft: usage.listed, featuredAircraft: usage.featured },
    subscription: sub
      ? {
          plan: sub.plan as PaidPlan,
          interval: sub.interval,
          status: sub.status,
          currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          scheduledPlan: sub.scheduledPlan === "free" ? null : sub.scheduledPlan,
          graceUntil: sub.graceUntil?.toISOString() ?? null,
          test: sub.provider === "test",
        }
      : null,
    aiCredits: {
      available: credits.available,
      balance: credits.balance,
      allowanceLeft: credits.allowance.left,
      allowancePerMonth: credits.allowance.perMonth,
    },
  };
}

export const billingSchemas = () => ({ Plan: output(planResponse) });

export const billingPaths = () => ({
  "/api/v1/me/plan": {
    get: {
      tags: ["account"],
      summary:
        "Your plan (SUB-4): where it comes from, its limits, what you use, the subscription and AI reading credits. Buying and changing plans is on the website.",
      security: signedIn,
      responses: { ...ok(ref("Plan")), ...errors(401) },
    },
  },
});
