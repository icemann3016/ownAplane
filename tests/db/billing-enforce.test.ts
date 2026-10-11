import { eq, sql } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";

import { describeDb, forceListed, prepareDatabase } from "./setup";

// A smaller plan (SUB-6): a week's warning, then aircraft beyond the limit are unlisted (newest
// listings first) and extra featured labels come off; nothing is deleted.

let db: typeof import("@/lib/db");
let s: typeof import("@/lib/db/schema");
let enforce: typeof import("@/lib/billing/enforce");

const OWN = "d1d1d1d1-1111-4111-8111-d1d1d1d1d1d1";
const DAY = 86_400_000;

async function plane(registration: string, listedDaysAgo: number, featured = false) {
  const [row] = await db
    .getDb()
    .insert(s.aircraft)
    .values({
      ownerId: OWN,
      registration,
      manufacturer: "Piper",
      model: "PA-28",
      typeDesignator: "P28A",
      seats: 4,
      fuelType: "avgas_100ll",
    })
    .returning();
  await forceListed(row!.id);
  await db
    .getDb()
    .update(s.aircraft)
    .set({ listedAt: new Date(Date.now() - listedDaysAgo * DAY), featured })
    .where(eq(s.aircraft.id, row!.id));
  return row!.id;
}

const types = async () =>
  (await db.getDb().select().from(s.notifications).where(eq(s.notifications.userId, OWN))).map(
    (n) => n.type,
  );

describeDb("plan limits after a downgrade (SUB-6)", () => {
  beforeAll(async () => {
    await prepareDatabase();
    db = await import("@/lib/db");
    s = await import("@/lib/db/schema");
    enforce = await import("@/lib/billing/enforce");
    await db.getDb().insert(s.users).values({ id: OWN, name: "Own", email: "own-d@example.com" });
  }, 60_000);

  it("warns a week ahead, once, then unlists the newest listings beyond the limit", async () => {
    // Owner during the beta: one featured spot.
    const oldest = await plane("LZ-EN1", 30, true);
    await plane("LZ-EN2", 20);
    await plane("LZ-EN3", 10);
    // Fleet until a cancelled subscription ends in 3 days; no beta, no founding plan.
    await db.getDb().update(s.billingSettings).set({ beta: false });
    await db.getDb().update(s.planGrants).set({ revokedAt: new Date() });
    await db
      .getDb()
      .insert(s.subscriptions)
      .values({
        userId: OWN,
        provider: "test",
        providerSubscriptionId: "sub_enforce",
        plan: "fleet",
        interval: "month",
        status: "active",
        priceCents: 3900,
        currentPeriodStart: new Date(Date.now() - 27 * DAY),
        currentPeriodEnd: new Date(Date.now() + 3 * DAY),
        cancelAtPeriodEnd: true,
      });
    expect(await enforce.enforcePlanLimits()).toBe(0);
    expect(await enforce.warnPlanChanges()).toBe(1);
    expect(await enforce.warnPlanChanges()).toBe(0);
    expect(await types()).toEqual(["plan_ending"]);

    // The period is over, but the warning isn't a week old yet: nothing happens.
    expect(await enforce.enforcePlanLimits(new Date(Date.now() + 4 * DAY))).toBe(0);
    // A week after the warning: Free lists one aircraft and has no featured spots.
    expect(await enforce.enforcePlanLimits(new Date(Date.now() + 8 * DAY))).toBe(2);
    const rows = await db
      .getDb()
      .select({
        id: s.aircraft.id,
        status: s.aircraft.status,
        reason: s.aircraft.unlistedReason,
        featured: s.aircraft.featured,
      })
      .from(s.aircraft)
      .where(eq(s.aircraft.ownerId, OWN));
    const kept = rows.filter((r) => r.status === "listed");
    expect(kept.map((r) => r.id)).toEqual([oldest]);
    expect(rows.filter((r) => r.status === "unlisted").map((r) => r.reason)).toEqual([
      "plan_limit",
      "plan_limit",
    ]);
    expect(kept[0]!.featured).toBe(false);
    expect((await types()).sort()).toEqual(["plan_ending", "plan_unlisted"]);
    const [count] = (await db
      .getDb()
      .execute(
        sql`select count(*)::int as n from public.aircraft where owner_id = ${OWN}`,
      )) as unknown as {
      n: number;
    }[];
    expect(count!.n).toBe(3);
  });
});
