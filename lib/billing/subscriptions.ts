import "server-only";

import { randomUUID } from "node:crypto";

import { desc, eq, ne, and } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { billingEvents, billingPayments, subscriptions, type Subscription } from "@/lib/db/schema";
import type { Interval, PaidPlan } from "./plans";

// The app's copy of the user's subscription (SUB-8): written only from the payment provider's
// events (in test mode, from lib/billing/test-provider.ts), each event stored once.

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type SubscriptionSnapshot = Omit<
  typeof subscriptions.$inferInsert,
  "createdAt" | "updatedAt" | "testFailNext"
> & { plan: PaidPlan; interval: Interval };

/** The user's current subscription (not ended), if any. */
export async function getSubscription(userId: string): Promise<Subscription | null> {
  const [row] = await getDb()
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), ne(subscriptions.status, "ended")));
  return row ?? null;
}

/** Store a provider event once; false when it was seen before (nothing to do). */
export async function recordEvent(
  tx: Tx | Db,
  event: { provider: string; id?: string; type: string; userId: string | null; payload: unknown },
): Promise<boolean> {
  const rows = await tx
    .insert(billingEvents)
    .values({
      provider: event.provider,
      eventId: event.id ?? randomUUID(),
      type: event.type,
      userId: event.userId,
      payload: event.payload as object,
    })
    .onConflictDoNothing()
    .returning({ id: billingEvents.id });
  return rows.length > 0;
}

/** Apply what the provider says the subscription now is. */
export async function saveSubscription(
  snapshot: SubscriptionSnapshot,
  event: { id?: string; type: string },
  tx?: Tx,
): Promise<void> {
  const run = async (t: Tx) => {
    const fresh = await recordEvent(t, {
      provider: snapshot.provider,
      id: event.id,
      type: event.type,
      userId: snapshot.userId,
      payload: snapshot,
    });
    if (!fresh) return;
    const values = { ...snapshot, updatedAt: new Date() };
    await t
      .insert(subscriptions)
      .values(values)
      .onConflictDoUpdate({ target: subscriptions.userId, set: values });
  };
  if (tx) await run(tx);
  else await getDb().transaction(run);
}

export type PaymentDetails = {
  key: "subscribe" | "upgrade" | "renewal" | "retry" | "credits";
  plan?: PaidPlan;
  interval?: Interval;
  credits?: number;
};

/** A payment (or failed attempt) for the user's history. */
export async function recordPayment(
  tx: Tx | Db,
  payment: {
    userId: string;
    provider: string;
    kind: "plan" | "credits";
    details: PaymentDetails;
    amountCents: number;
    status: "paid" | "failed";
  },
): Promise<string> {
  const [row] = await tx
    .insert(billingPayments)
    .values({ ...payment, providerPaymentId: `pay_${randomUUID()}` })
    .returning({ id: billingPayments.id });
  return row!.id;
}

export async function paymentHistory(userId: string, limit = 24) {
  return getDb()
    .select()
    .from(billingPayments)
    .where(eq(billingPayments.userId, userId))
    .orderBy(desc(billingPayments.createdAt))
    .limit(limit);
}
