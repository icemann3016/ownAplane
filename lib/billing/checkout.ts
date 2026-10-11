import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { billingCheckouts, type CheckoutItem } from "@/lib/db/schema";
import { addCredits } from "./credits";
import { CREDIT_PACKS, CURRENCY, type CreditPack, periodEnd, PRICES } from "./plans";
import { billingProvider } from "./provider";
import { getSubscription, recordPayment, saveSubscription } from "./subscriptions";

// Buying a plan or a credit pack (SUB-4). The checkout is the provider's page; in test mode it is
// our own /billing/checkout/[id], where the user chooses what the "payment" does and no money
// moves. Either way the result arrives as the same events (lib/billing/subscriptions.ts).

export type CheckoutError = "not_available" | "already_subscribed" | "unknown_item";

export function itemPrice(item: CheckoutItem): number | null {
  if (item.type === "plan") return PRICES[item.plan]?.[item.interval] ?? null;
  return CREDIT_PACKS[item.pack as CreditPack]?.priceCents ?? null;
}

export async function startCheckout(
  userId: string,
  item: CheckoutItem,
): Promise<{ ok: true; url: string } | { ok: false; error: CheckoutError }> {
  if (billingProvider() !== "test") return { ok: false, error: "not_available" };
  const amountCents = itemPrice(item);
  if (amountCents === null) return { ok: false, error: "unknown_item" };
  if (item.type === "plan" && (await getSubscription(userId))) {
    return { ok: false, error: "already_subscribed" };
  }
  const [row] = await getDb()
    .insert(billingCheckouts)
    .values({ userId, provider: "test", item, amountCents, currency: CURRENCY })
    .returning({ id: billingCheckouts.id });
  return { ok: true, url: `/billing/checkout/${row!.id}` };
}

export async function getCheckout(userId: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(billingCheckouts)
    .where(and(eq(billingCheckouts.id, id), eq(billingCheckouts.userId, userId)));
  return row ?? null;
}

export type CheckoutOutcome = "paid" | "failed" | "canceled";

/**
 * Test mode: what the "payment" did. Paid plans start a subscription now; packs add credits.
 * Returns the checkout's final status, or null when it isn't the user's open checkout.
 */
export async function completeTestCheckout(
  userId: string,
  id: string,
  outcome: CheckoutOutcome,
): Promise<CheckoutOutcome | "already_subscribed" | null> {
  return getDb().transaction(async (tx) => {
    const [checkout] = await tx
      .select()
      .from(billingCheckouts)
      .where(
        and(
          eq(billingCheckouts.id, id),
          eq(billingCheckouts.userId, userId),
          eq(billingCheckouts.provider, "test"),
          eq(billingCheckouts.status, "open"),
        ),
      )
      .for("update");
    if (!checkout) return null;
    const item = checkout.item;
    const finish = (status: CheckoutOutcome) =>
      tx
        .update(billingCheckouts)
        .set({ status, completedAt: new Date() })
        .where(eq(billingCheckouts.id, id));
    if (outcome === "canceled") {
      await finish("canceled");
      return "canceled";
    }
    if (item.type === "plan" && (await getSubscription(userId))) {
      await finish("canceled");
      return "already_subscribed";
    }
    const details =
      item.type === "plan"
        ? ({ key: "subscribe", plan: item.plan, interval: item.interval } as const)
        : ({ key: "credits", credits: CREDIT_PACKS[item.pack as CreditPack].credits } as const);
    const paymentId = await recordPayment(tx, {
      userId,
      provider: "test",
      kind: item.type,
      details,
      amountCents: checkout.amountCents,
      status: outcome === "paid" ? "paid" : "failed",
    });
    await finish(outcome);
    if (outcome === "failed") return "failed";
    if (item.type === "plan") {
      const start = new Date();
      await saveSubscription(
        {
          userId,
          provider: "test",
          providerSubscriptionId: `sub_${checkout.id}`,
          plan: item.plan,
          interval: item.interval,
          status: "active",
          priceCents: checkout.amountCents,
          currency: checkout.currency,
          currentPeriodStart: start,
          currentPeriodEnd: periodEnd(start, item.interval),
          cancelAtPeriodEnd: false,
          scheduledPlan: null,
          scheduledInterval: null,
          graceUntil: null,
          endedAt: null,
        },
        { type: "subscription.created" },
        tx,
      );
    } else {
      await addCredits(tx, { userId, credits: details.credits!, reason: "purchase", paymentId });
    }
    return "paid";
  });
}
