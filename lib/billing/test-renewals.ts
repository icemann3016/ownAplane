import "server-only";

import { and, eq, lte, or } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { notifications, subscriptions, type Subscription } from "@/lib/db/schema";
import { type PaidPlan, periodEnd, PRICES } from "./plans";
import { saveSubscription } from "./subscriptions";
import { charge, GRACE_MS, locked, snapshot, type Tx } from "./test-shared";
import type { ChangeResult } from "./test-subscription";

// Test mode: the end of each period renews the subscription (into a scheduled downgrade) or ends
// it when cancelled; a failed payment keeps the plan for 7 days, then it ends (SUB-6). The daily
// job runs it; the Plan & billing page can act as if the period ended now.

/** The end of a period: renew (into the scheduled plan) or end; a failed payment: grace. */
async function renew(tx: Tx, sub: Subscription, start: Date) {
  const base = snapshot(sub);
  if (sub.cancelAtPeriodEnd) {
    await saveSubscription(
      { ...base, status: "ended", endedAt: start },
      { type: "subscription.ended" },
      tx,
    );
    return "ended" as const;
  }
  const plan = (sub.scheduledPlan ?? sub.plan) as PaidPlan;
  const interval = sub.scheduledInterval ?? sub.interval;
  const price = PRICES[plan][interval];
  if (!(await charge(tx, sub, price, { key: "renewal", plan, interval }))) {
    await tx.insert(notifications).values({ userId: sub.userId, type: "payment_failed" });
    await saveSubscription(
      { ...base, status: "past_due", graceUntil: new Date(Date.now() + GRACE_MS) },
      { type: "payment.failed" },
      tx,
    );
    return "past_due" as const;
  }
  await saveSubscription(
    {
      ...base,
      plan,
      interval,
      priceCents: price,
      status: "active",
      currentPeriodStart: start,
      currentPeriodEnd: periodEnd(start, interval),
      scheduledPlan: null,
      scheduledInterval: null,
      graceUntil: null,
    },
    { type: "subscription.renewed" },
    tx,
  );
  return "renewed" as const;
}

/** Test mode: act as if the period ended now. */
export async function renewNow(userId: string) {
  return getDb().transaction(async (tx) => {
    const sub = await locked(tx, userId);
    return sub?.status === "active" ? renew(tx, sub, new Date()) : null;
  });
}

/** Past due: pay now; the plan continues with a new period from today. */
export async function retryPayment(userId: string): Promise<ChangeResult> {
  return getDb().transaction(async (tx) => {
    const sub = await locked(tx, userId);
    if (!sub || sub.status !== "past_due") return "no_subscription";
    if (
      !(await charge(tx, sub, sub.priceCents, {
        key: "retry",
        plan: sub.plan as PaidPlan,
        interval: sub.interval,
      }))
    ) {
      return "payment_failed";
    }
    const now = new Date();
    await saveSubscription(
      {
        ...snapshot(sub),
        status: "active",
        graceUntil: null,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd(now, sub.interval),
      },
      { type: "payment.succeeded" },
      tx,
    );
    return "kept";
  });
}

/** Daily job (test mode): renew or end subscriptions whose period is over or grace ran out. */
export async function renewDueSubscriptions(now = new Date()): Promise<number> {
  const due = await getDb()
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.provider, "test"),
        or(
          and(eq(subscriptions.status, "active"), lte(subscriptions.currentPeriodEnd, now)),
          and(eq(subscriptions.status, "past_due"), lte(subscriptions.graceUntil, now)),
        ),
      ),
    );
  for (const { userId } of due) {
    await getDb().transaction(async (tx) => {
      // Several periods may have passed (the job didn't run): renew until the period is current.
      for (let i = 0; i < 24; i++) {
        const sub = await locked(tx, userId);
        if (!sub) return;
        if (sub.status === "past_due") {
          if (sub.graceUntil && sub.graceUntil <= now) {
            await saveSubscription(
              { ...snapshot(sub), status: "ended", endedAt: now },
              { type: "subscription.ended" },
              tx,
            );
          }
          return;
        }
        if (
          sub.currentPeriodEnd > now ||
          (await renew(tx, sub, sub.currentPeriodEnd)) !== "renewed"
        ) {
          return;
        }
      }
    });
  }
  return due.length;
}
