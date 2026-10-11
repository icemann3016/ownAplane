import "server-only";

import { z } from "zod";

import { getMyPlan } from "@/lib/billing/plan";
import { PLANS, type PlanFeatures } from "@/lib/billing/plans";
import { ApiError } from "./http";
import { errors, ok, output, ref, signedIn } from "./openapi-helpers";

// Pilot Plus in the API: the currency tracker and flying statistics from the logbook (402
// payment_required, reason plan_required, without the plan). Same lib/ code as the website.

export async function requirePlanFeature(userId: string, feature: keyof PlanFeatures) {
  if (!PLANS[(await getMyPlan(userId)).plan][feature]) {
    throw new ApiError("payment_required", "This needs Pilot Plus or an owner plan.", undefined, {
      reason: "plan_required",
      feature,
    });
  }
}

const date = z.iso.date();
const recency = z.object({
  current: z.boolean(),
  until: date.nullable().describe("Last day it holds"),
  count: z.number().int().describe("Landings in the last 90 days"),
});
const requirement = z.object({
  key: z.enum(["hours", "pic", "landings", "refresher"]),
  done: z.number().int().describe("Minutes for times, a count for landings, 0/1 for refresher"),
  need: z.number().int(),
  met: z.boolean(),
});
const experience = z.object({
  from: date,
  to: date,
  met: z.boolean(),
  requirements: z.array(requirement),
});

export const currencyResponse = z.object({
  today: date,
  drafts: z.number().int().describe("Drafts not counted until certified"),
  certified: z.number().int(),
  passengers: z.object({ day: recency, night: recency }).describe("FCL.060, SEP class"),
  hasIr: z.boolean(),
  sep: experience.extend({ expired: z.boolean() }).describe("FCL.740.A revalidation"),
  sepExpiry: date.nullable(),
  lapl: experience.nullable().describe("FCL.140.A, for LAPL(A)-only pilots"),
});

export const statsResponse = z.object({
  months: z.array(
    z.object({ month: z.string(), minutes: z.number().int(), landings: z.number().int() }),
  ),
  types: z.array(z.object({ aircraftType: z.string(), minutes: z.number().int() })),
  functions: z.object({
    pic: z.number().int(),
    dual: z.number().int(),
    instructor: z.number().int(),
    copilot: z.number().int(),
  }),
  rentals: z.array(
    z.object({
      currency: z.string(),
      count: z.number().int(),
      minutes: z.number().int(),
      due: z.number().describe("Amounts due in confirmed flight logs (paid outside the app)"),
    }),
  ),
});

export const pilotPlusSchemas = () => ({
  Currency: output(currencyResponse),
  FlyingStats: output(statsResponse),
});

export const pilotPlusPaths = () => ({
  "/api/v1/me/logbook/currency": {
    get: {
      tags: ["logbook"],
      summary:
        "Currency from certified entries (Pilot Plus): passenger and night recency, SEP revalidation, LAPL recency. 402 plan_required without the plan",
      security: signedIn,
      responses: { ...ok(ref("Currency")), ...errors(401, 402) },
    },
  },
  "/api/v1/me/logbook/stats": {
    get: {
      tags: ["logbook"],
      summary:
        "Flying statistics (Pilot Plus): the last 12 months, aircraft types, functions, rentals. 402 plan_required without the plan",
      security: signedIn,
      responses: { ...ok(ref("FlyingStats")), ...errors(401, 402) },
    },
  },
});
