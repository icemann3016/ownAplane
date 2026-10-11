import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";

import { describeDb, prepareDatabase } from "./setup";

// Test-mode payments (SUB-4, SUB-6, SUB-8): subscribing, changing plans, renewals, a failed
// payment's grace, cancelling; AI credits (welcome, allowance, packs, refunds).

let db: typeof import("@/lib/db");
let s: typeof import("@/lib/db/schema");
let checkout: typeof import("@/lib/billing/checkout");
let changes: typeof import("@/lib/billing/test-subscription");
let renewals: typeof import("@/lib/billing/test-renewals");
let credits: typeof import("@/lib/billing/credits");
let plan: typeof import("@/lib/billing/plan");

const USR = "c1c1c1c1-1111-4111-8111-c1c1c1c1c1c1";
const PIL = "c2c2c2c2-2222-4222-8222-c2c2c2c2c2c2";

const sub = async () =>
  (await db.getDb().select().from(s.subscriptions).where(eq(s.subscriptions.userId, USR)))[0]!;
const payments = async () =>
  (await db.getDb().select().from(s.billingPayments).where(eq(s.billingPayments.userId, USR)))
    .map((p) => `${p.details.key}:${p.status}`)
    .sort();

async function buy(userId: string, item: Parameters<typeof checkout.startCheckout>[1]) {
  const started = await checkout.startCheckout(userId, item);
  if (!started.ok) throw new Error(started.error);
  const id = started.url.split("/").pop()!;
  return checkout.completeTestCheckout(userId, id, "paid");
}

describeDb("test-mode payments", () => {
  beforeAll(async () => {
    await prepareDatabase();
    db = await import("@/lib/db");
    s = await import("@/lib/db/schema");
    checkout = await import("@/lib/billing/checkout");
    changes = await import("@/lib/billing/test-subscription");
    renewals = await import("@/lib/billing/test-renewals");
    credits = await import("@/lib/billing/credits");
    plan = await import("@/lib/billing/plan");
    await db
      .getDb()
      .insert(s.users)
      .values([
        { id: USR, name: "Usr", email: "usr-c@example.com" },
        { id: PIL, name: "Pil", email: "pil-c@example.com" },
      ]);
    await db.getDb().update(s.billingSettings).set({ beta: false });
  }, 60_000);

  it("subscribes, upgrades now and downgrades at the renewal", async () => {
    expect((await plan.planOf(USR)).plan).toBe("free");
    expect(await buy(USR, { type: "plan", plan: "owner", interval: "month" })).toBe("paid");
    expect((await plan.planOf(USR)).plan).toBe("owner");
    expect(
      await checkout.startCheckout(USR, { type: "plan", plan: "fleet", interval: "month" }),
    ).toEqual({ ok: false, error: "already_subscribed" });

    const up = await changes.changePlan(USR, { plan: "fleet", interval: "month" });
    expect(up.result).toBe("upgraded");
    // Almost a whole month of Owner unused: Fleet less about €9.
    expect(up.amountCents).toBeGreaterThan(3900 - 901);
    expect((await sub()).plan).toBe("fleet");

    expect((await changes.changePlan(USR, { plan: "owner", interval: "year" })).result).toBe(
      "scheduled",
    );
    expect((await plan.planOf(USR)).plan).toBe("fleet");
    expect(await renewals.renewNow(USR)).toBe("renewed");
    const renewed = await sub();
    expect([renewed.plan, renewed.interval, renewed.priceCents]).toEqual(["owner", "year", 9000]);
  });

  it("keeps the plan for 7 days after a failed payment, then ends it", async () => {
    await changes.setTestFailNext(USR, true);
    expect(await renewals.renewNow(USR)).toBe("past_due");
    const late = await sub();
    expect(late.status).toBe("past_due");
    expect((await plan.planOf(USR)).plan).toBe("owner");
    expect((await changes.changePlan(USR, "free")).result).toBe("past_due");
    expect(await renewals.retryPayment(USR)).toBe("kept");
    expect((await sub()).status).toBe("active");

    await changes.setTestFailNext(USR, true);
    await renewals.renewNow(USR);
    await renewals.renewDueSubscriptions(new Date(Date.now() + 8 * 86_400_000));
    expect((await sub()).status).toBe("ended");
    expect((await plan.planOf(USR)).plan).toBe("free");
    expect(await payments()).toEqual([
      "renewal:failed",
      "renewal:failed",
      "renewal:paid",
      "retry:paid",
      "subscribe:paid",
      "upgrade:paid",
    ]);
  });

  it("cancels at the end of the period, and can be resumed before", async () => {
    expect(await buy(USR, { type: "plan", plan: "owner", interval: "month" })).toBe("paid");
    expect((await changes.changePlan(USR, "free")).result).toBe("canceled");
    expect((await plan.planOf(USR)).plan).toBe("owner");
    expect(await changes.resumeSubscription(USR)).toBe("kept");
    expect((await sub()).cancelAtPeriodEnd).toBe(false);
    await changes.changePlan(USR, "free");
    const end = (await sub()).currentPeriodEnd;
    await renewals.renewDueSubscriptions(new Date(end.getTime() + 1000));
    expect((await sub()).status).toBe("ended");
  });

  it("spends the allowance first, then credits, and gives failed reads back", async () => {
    expect(await credits.creditStatus(PIL)).toEqual({
      balance: 5,
      allowance: { perMonth: 0, used: 0, left: 0 },
      available: 5,
    });
    const spent: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await credits.spendCredit(PIL);
      if (r.ok) spent.push(r.entryId);
    }
    expect(spent).toHaveLength(5);
    expect(await credits.spendCredit(PIL)).toEqual({ ok: false, error: "no_credits" });
    await credits.refundCredit(spent[0]!);
    await credits.refundCredit(spent[0]!);
    expect((await credits.creditStatus(PIL)).balance).toBe(1);

    expect(await buy(PIL, { type: "credits", pack: "small" })).toBe("paid");
    expect((await credits.creditStatus(PIL)).balance).toBe(51);
    // An admin-given Owner plan brings 10 reads a month, used before the credits.
    await db.getDb().insert(s.planGrants).values({ userId: PIL, plan: "owner", reason: "admin" });
    await credits.spendCredit(PIL);
    expect(await credits.creditStatus(PIL)).toMatchObject({
      balance: 51,
      allowance: { perMonth: 10, used: 1, left: 9 },
      available: 60,
    });
  });

  it("doesn't count the beta for the monthly allowance", async () => {
    await db.getDb().delete(s.planGrants);
    await db.getDb().update(s.billingSettings).set({ beta: true });
    expect((await plan.planOf(PIL)).plan).toBe("owner");
    expect((await credits.creditStatus(PIL)).allowance.perMonth).toBe(0);
  });
});
