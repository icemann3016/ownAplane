import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { subscriptions, type Subscription } from "@/lib/db/schema";
import {
  changeKind,
  type Interval,
  type PaidPlan,
  periodEnd,
  PRICES,
  proratedCharge,
} from "./plans";
import { saveSubscription } from "./subscriptions";
import { charge, locked, snapshot } from "./test-shared";

// Test mode: what a payment provider does with a subscription. Upgrades start now with a
// prorated payment; downgrades and yearly → monthly start at the next renewal; cancelling keeps
// the plan to the end of the period. Each period end renews (the daily job), and a failed payment
// keeps the plan for 7 days (SUB-6). Every change is saved like a provider's event.

type Target = { plan: PaidPlan; interval: Interval };

export type ChangeResult =
  | "upgraded"
  | "scheduled"
  | "canceled"
  | "kept"
  | "payment_failed"
  | "no_subscription"
  | "past_due";

/** What an upgrade costs now (cents). */
export function upgradeCharge(sub: Subscription, to: Target, now = new Date()): number {
  return proratedCharge(
    {
      priceCents: sub.priceCents,
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
    },
    PRICES[to.plan][to.interval],
    now,
  );
}

/** Change to another paid plan or interval, or to Free (= cancel at the period's end). */
export async function changePlan(
  userId: string,
  to: Target | "free",
): Promise<{ result: ChangeResult; amountCents?: number }> {
  return getDb().transaction(async (tx) => {
    const sub = await locked(tx, userId);
    if (!sub) return { result: "no_subscription" };
    if (sub.status === "past_due") return { result: "past_due" };
    const base = { ...snapshot(sub), scheduledPlan: null, scheduledInterval: null };
    if (to === "free") {
      await saveSubscription(
        { ...base, cancelAtPeriodEnd: true },
        { type: "subscription.canceled" },
        tx,
      );
      return { result: "canceled" };
    }
    const kind = changeKind({ plan: sub.plan as PaidPlan, interval: sub.interval }, to);
    if (kind === "same") {
      await saveSubscription(
        { ...base, cancelAtPeriodEnd: false },
        { type: "subscription.updated" },
        tx,
      );
      return { result: "kept" };
    }
    if (kind === "downgrade") {
      await saveSubscription(
        {
          ...base,
          cancelAtPeriodEnd: false,
          scheduledPlan: to.plan,
          scheduledInterval: to.interval,
        },
        { type: "subscription.updated" },
        tx,
      );
      return { result: "scheduled" };
    }
    const now = new Date();
    const amountCents = upgradeCharge(sub, to, now);
    if (!(await charge(tx, sub, amountCents, { key: "upgrade", ...to }))) {
      return { result: "payment_failed", amountCents };
    }
    await saveSubscription(
      {
        ...base,
        ...to,
        priceCents: PRICES[to.plan][to.interval],
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd(now, to.interval),
        cancelAtPeriodEnd: false,
      },
      { type: "subscription.updated" },
      tx,
    );
    return { result: "upgraded", amountCents };
  });
}

export async function resumeSubscription(userId: string): Promise<ChangeResult> {
  return getDb().transaction(async (tx) => {
    const sub = await locked(tx, userId);
    if (!sub) return "no_subscription";
    await saveSubscription(
      { ...snapshot(sub), cancelAtPeriodEnd: false },
      { type: "subscription.updated" },
      tx,
    );
    return "kept";
  });
}

export async function setTestFailNext(userId: string, on: boolean): Promise<void> {
  await getDb()
    .update(subscriptions)
    .set({ testFailNext: on })
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.provider, "test")));
}
