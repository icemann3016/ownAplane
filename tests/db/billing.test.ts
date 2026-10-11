import { eq, sql } from "drizzle-orm";
import { beforeAll, beforeEach, expect, it } from "vitest";

import { PLAN_NAMES, PLANS, planRank } from "@/lib/billing/plans";
import { describeDb, forceListed, prepareDatabase } from "./setup";

// Plans (SUB-1…9): where a user's plan comes from, the limits the database keeps, founding
// owners, and who may read billing rows.

let db: typeof import("@/lib/db");
let rls: typeof import("@/lib/db/rls");
let s: typeof import("@/lib/db/schema");

const OWN = "b1b1b1b1-1111-4111-8111-b1b1b1b1b1b1";
const OTH = "b2b2b2b2-2222-4222-8222-b2b2b2b2b2b2";
const DAY = 86_400_000;

async function code(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (e) {
    const cause = (e as { cause?: { message?: string; code?: string } }).cause;
    return cause?.message ?? cause?.code;
  }
}

async function planOf(uid: string, at = new Date()) {
  const [row] = (await db
    .getDb()
    .execute(
      sql`select plan, source from public.plan_of(${uid}::uuid, ${at.toISOString()}::timestamptz)`,
    )) as unknown as { plan: string; source: string }[];
  return `${row!.plan}:${row!.source}`;
}

const settings = (values: Partial<typeof s.billingSettings.$inferInsert>) =>
  db.getDb().update(s.billingSettings).set(values).where(eq(s.billingSettings.id, true));

async function plane(registration: string) {
  const [row] = await db
    .getDb()
    .insert(s.aircraft)
    .values({
      ownerId: OWN,
      registration,
      manufacturer: "Cessna",
      model: "172",
      typeDesignator: "C172",
      seats: 4,
      fuelType: "avgas_100ll",
    })
    .returning();
  return row!.id;
}

describeDb("plans and billing (SUB)", () => {
  beforeAll(async () => {
    await prepareDatabase();
    db = await import("@/lib/db");
    rls = await import("@/lib/db/rls");
    s = await import("@/lib/db/schema");
    await db
      .getDb()
      .insert(s.users)
      .values([
        { id: OWN, name: "Own", email: "own-b@example.com" },
        { id: OTH, name: "Oth", email: "oth-b@example.com" },
      ]);
  }, 60_000);

  beforeEach(async () => {
    await settings({ beta: false, betaEndsAt: null, foundingCutoff: null });
    await db.getDb().delete(s.subscriptions);
    await db.getDb().delete(s.planGrants);
    await db.getDb().delete(s.bookingFeeds);
  });

  it("keeps the same limits as the code", async () => {
    for (const plan of PLAN_NAMES) {
      const [row] = (await db.getDb().execute(sql`select
          public.plan_limit(${plan}::public.plan_name, 'aircraft') as aircraft,
          public.plan_limit(${plan}::public.plan_name, 'featured') as featured,
          public.plan_limit(${plan}::public.plan_name, 'saved_searches') as "savedSearches",
          public.plan_rank(${plan}::public.plan_name) as rank`)) as unknown as {
        aircraft: number;
        featured: number;
        savedSearches: number;
        rank: number;
      }[];
      expect(row).toEqual({
        aircraft: PLANS[plan].aircraft,
        featured: PLANS[plan].featured,
        savedSearches: PLANS[plan].savedSearches,
        rank: planRank(plan),
      });
    }
  });

  it("allows saved searches by plan (Free 2, Pilot Plus 20)", async () => {
    const save = (name: string) =>
      rls.asUser(OTH, (tx) =>
        tx.insert(s.savedSearches).values({ userId: OTH, name, query: "", alerts: true }),
      );
    await save("one");
    await save("two");
    expect(await code(save("three"))).toBe("too_many_searches");
    await db.getDb().insert(s.planGrants).values({ userId: OTH, plan: "pilot", reason: "admin" });
    expect(await code(save("three"))).toBeUndefined();
    expect(await planOf(OTH)).toBe("pilot:admin");
  });

  it("picks the highest plan from subscriptions, grants and the beta", async () => {
    expect(await planOf(OWN)).toBe("free:free");
    await settings({ beta: true });
    expect(await planOf(OWN)).toBe("owner:beta");
    const now = Date.now();
    await db
      .getDb()
      .insert(s.subscriptions)
      .values({
        userId: OWN,
        provider: "test",
        providerSubscriptionId: "sub_1",
        plan: "fleet",
        interval: "month",
        status: "active",
        priceCents: 3900,
        currentPeriodStart: new Date(now - DAY),
        currentPeriodEnd: new Date(now + 10 * DAY),
        scheduledPlan: "owner",
      });
    expect(await planOf(OWN)).toBe("fleet:subscription");
    // After the period it renews into the scheduled plan; cancelled, it ends.
    expect(await planOf(OWN, new Date(now + 20 * DAY))).toBe("owner:subscription");
    await db.getDb().update(s.subscriptions).set({ cancelAtPeriodEnd: true });
    await settings({ beta: false });
    expect(await planOf(OWN, new Date(now + 20 * DAY))).toBe("free:free");
    // A failed payment keeps the plan until the grace ends.
    await db
      .getDb()
      .update(s.subscriptions)
      .set({ status: "past_due", graceUntil: new Date(now + 7 * DAY) });
    expect(await planOf(OWN)).toBe("fleet:subscription");
    expect(await planOf(OWN, new Date(now + 8 * DAY))).toBe("free:free");
    await db
      .getDb()
      .insert(s.planGrants)
      .values({
        userId: OWN,
        plan: "owner",
        reason: "admin",
        endsAt: new Date(now + 30 * DAY),
      });
    expect(await planOf(OWN, new Date(now + 8 * DAY))).toBe("owner:admin");
    expect(await planOf(OWN, new Date(now + 31 * DAY))).toBe("free:free");
  });

  it("refuses listing or featuring beyond the plan", async () => {
    const first = await plane("LZ-PL1");
    const second = await plane("LZ-PL2");
    await forceListed(first);
    const check = (id: string, what: string) =>
      rls.asUser(OWN, (tx) =>
        tx.execute(sql`select public.check_plan_limit(${OWN}::uuid, ${id}::uuid, ${what})`),
      );
    // Listing the first aircraft made OWN a founding owner (Owner: 2 aircraft) — revoke it.
    await db.getDb().update(s.planGrants).set({ revokedAt: new Date() });
    expect(await code(check(second, "aircraft"))).toBe("plan_limit");
    expect(await code(check(first, "aircraft"))).toBeUndefined();
    expect(
      await code(
        rls.asUser(OWN, (tx) =>
          tx.update(s.aircraft).set({ featured: true }).where(eq(s.aircraft.id, first)),
        ),
      ),
    ).toBe("plan_limit");
    await settings({ beta: true });
    expect(await code(check(second, "aircraft"))).toBeUndefined();
    await rls.asUser(OWN, (tx) =>
      tx.update(s.aircraft).set({ featured: true }).where(eq(s.aircraft.id, first)),
    );
    // Nobody asks about someone else's limits.
    expect(
      await code(
        rls.asUser(OTH, (tx) =>
          tx.execute(
            sql`select public.check_plan_limit(${OWN}::uuid, ${second}::uuid, 'aircraft')`,
          ),
        ),
      ),
    ).toBe("not_found");
  });

  it("makes owners who list during the beta founding owners, once", async () => {
    await settings({ beta: true });
    await forceListed(await plane("LZ-FO1"));
    await forceListed(await plane("LZ-FO2"));
    const grants = await db.getDb().select().from(s.planGrants);
    expect(grants.map((g) => [g.reason, g.plan, g.endsAt])).toEqual([["founding", "owner", null]]);
  });

  it("lets users read only their own billing rows, and change none", async () => {
    await db.getDb().insert(s.planGrants).values({ userId: OWN, plan: "fleet", reason: "admin" });
    await db
      .getDb()
      .insert(s.aiCreditEntries)
      .values({ userId: OWN, pool: "credits", reason: "welcome", delta: 5 });
    const mine = await rls.asUser(OWN, (tx) => tx.select().from(s.planGrants));
    const theirs = await rls.asUser(OTH, (tx) => tx.select().from(s.planGrants));
    expect([mine.length, theirs.length]).toEqual([1, 0]);
    expect(await rls.asUser(OTH, (tx) => tx.select().from(s.aiCreditEntries))).toEqual([]);
    const [plan] = (await rls.asUser(OWN, (tx) =>
      tx.execute(sql`select plan from public.my_plan()`),
    )) as unknown as { plan: string }[];
    expect(plan!.plan).toBe("fleet");
    expect(
      await code(
        rls.asUser(OWN, (tx) =>
          tx.insert(s.aiCreditEntries).values({
            userId: OWN,
            pool: "credits",
            reason: "purchase",
            delta: 1000,
          }),
        ),
      ),
    ).toBe("permission denied for table ai_credit_entries");
    expect(
      await code(rls.asUser(OWN, (tx) => tx.update(s.planGrants).set({ plan: "fleet" }))),
    ).toBe("permission denied for table plan_grants");
    expect(await code(rls.asUser(OWN, (tx) => tx.select().from(s.billingEvents)))).toBe(
      "permission denied for table billing_events",
    );
    // Calendar link tokens of one's bookings (SUB-15) are secrets: only trusted code reads them.
    await db
      .getDb()
      .insert(s.bookingFeeds)
      .values({ userId: OWN, token: "f".repeat(48) });
    expect(await code(rls.asUser(OWN, (tx) => tx.select().from(s.bookingFeeds)))).toBe(
      "permission denied for table booking_feeds",
    );
    expect(
      await code(
        rls.asUser(OWN, (tx) => tx.execute(sql`select * from public.plan_of(${OTH}::uuid)`)),
      ),
    ).toBe("permission denied for function plan_of");
  });
});
