import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { subscriptions, type Subscription } from "@/lib/db/schema";
import type { PaidPlan } from "./plans";
import { type PaymentDetails, recordPayment } from "./subscriptions";

// Shared by the test provider's plan changes and renewals (test-subscription.ts, test-renewals.ts).

export const GRACE_MS = 7 * 86_400_000;

type Db = ReturnType<typeof getDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export const snapshot = (sub: Subscription) => {
  const { createdAt: _c, updatedAt: _u, testFailNext: _t, ...rest } = sub;
  return rest as typeof rest & { plan: PaidPlan };
};

export async function locked(tx: Tx, userId: string): Promise<Subscription | undefined> {
  const [sub] = await tx
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.provider, "test")))
    .for("update");
  return sub && sub.status !== "ended" ? sub : undefined;
}

/** A test payment: it fails once when the user asked for that. */
export async function charge(
  tx: Tx,
  sub: Subscription,
  amountCents: number,
  details: PaymentDetails,
) {
  const ok = !sub.testFailNext;
  await recordPayment(tx, {
    userId: sub.userId,
    provider: "test",
    kind: "plan",
    details,
    amountCents,
    status: ok ? "paid" : "failed",
  });
  if (!ok) {
    await tx
      .update(subscriptions)
      .set({ testFailNext: false })
      .where(eq(subscriptions.userId, sub.userId));
  }
  return ok;
}
