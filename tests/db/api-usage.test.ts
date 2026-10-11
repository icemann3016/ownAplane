import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";

import { describeDb, prepareDatabase } from "./setup";

// API request limits and usage for admins (API-6).

let db: typeof import("@/lib/db");
let rls: typeof import("@/lib/db/rls");
let s: typeof import("@/lib/db/schema");
let limits: typeof import("@/lib/api/rate-limit");
let usage: typeof import("@/lib/admin/api-usage");

const USER = "a6a6a6a6-1111-4111-8111-111111111111";
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
let connectionId: string;
let aircraftId: string;

async function code(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (e) {
    return (e as { cause?: { code?: string } }).cause?.code;
  }
}

describeDb("API limits and usage (API-6)", () => {
  beforeAll(async () => {
    await prepareDatabase();
    db = await import("@/lib/db");
    rls = await import("@/lib/db/rls");
    s = await import("@/lib/db/schema");
    limits = await import("@/lib/api/rate-limit");
    usage = await import("@/lib/admin/api-usage");
    const owner = db.getDb();
    await owner.insert(s.users).values({ id: USER, name: "App User", email: "app@example.com" });
    await owner.insert(s.sessions).values({
      userId: USER,
      token: "session-token-1",
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const [plane] = await owner
      .insert(s.aircraft)
      .values({
        ownerId: USER,
        registration: "LZ-API",
        manufacturer: "Cessna",
        model: "172S",
        typeDesignator: "C172",
        seats: 4,
        fuelType: "avgas_100ll",
      })
      .returning();
    aircraftId = plane!.id;
    const [connection] = await owner
      .insert(s.calendarConnections)
      .values({ aircraftId, name: "Club", inbound: "push", apiKeyHash: hash("oap_club") })
      .returning();
    connectionId = connection!.id;
  }, 60_000);

  it("counts requests per caller and minute, and refused tokens per address", async () => {
    const caller = { key: "tok:test", badKey: "bad:5.5.5.5" };
    expect(await limits.takeRequest(caller)).toMatchObject({ count: 1, badTokens: 0 });
    await limits.countBadToken(caller.badKey);
    await limits.countBadToken(caller.badKey);
    const second = await limits.takeRequest(caller);
    expect(second).toMatchObject({ count: 2, badTokens: 2 });
    expect(second.resetIn).toBeGreaterThanOrEqual(1);
    expect(second.resetIn).toBeLessThanOrEqual(60);
    expect((await limits.takeRequest({ key: "tok:other", badKey: "bad:x" })).count).toBe(1);
  });

  it("keeps the counts away from users", async () => {
    expect(await code(rls.asUser(USER, (tx) => tx.select().from(s.apiRateBuckets)))).toBe("42501");
    expect(await code(rls.asUser(USER, (tx) => tx.select().from(s.apiUsageDaily)))).toBe("42501");
    expect(
      await code(
        rls.asUser(USER, (tx) =>
          tx.insert(s.apiRateBuckets).values({ key: "ip:x", minute: new Date(), count: 0 }),
        ),
      ),
    ).toBe("42501");
  });

  it("shows admins the busiest users and connections of the last 7 days", async () => {
    await limits.recordUsage("user", USER);
    await limits.recordUsage("user", USER);
    await limits.recordUsage("connection", connectionId);
    await db.getDb().execute(sql`
      insert into public.api_usage_daily (day, subject_type, subject_id, requests) values
        ((now() at time zone 'utc')::date - 3, 'user', ${USER}::uuid, 5),
        ((now() at time zone 'utc')::date - 8, 'user', ${USER}::uuid, 100)`);
    const rows = await usage.apiUsage();
    expect(rows).toEqual([
      {
        type: "user",
        id: USER,
        name: "App User",
        detail: "app@example.com",
        aircraftId: null,
        today: 2,
        week: 7,
      },
      {
        type: "connection",
        id: connectionId,
        name: "Club",
        detail: "LZ-API",
        aircraftId,
        today: 1,
        week: 1,
      },
    ]);
  });

  it("lists callers over their limit in the last hour, with the user or connection", async () => {
    const minute = sql`date_trunc('minute', now()) - interval '5 minutes'`;
    const tok = `tok:${hash("session-token-1").slice(0, 32)}`;
    const key = `key:${hash("oap_club").slice(0, 32)}`;
    await db.getDb().execute(sql`
      insert into public.api_rate_buckets (key, minute, count) values
        (${tok}, ${minute}, ${limits.LIMITS.user + 1}),
        (${key}, ${minute}, ${limits.LIMITS.partner}),
        (${key}, ${minute} - interval '1 minute', ${limits.LIMITS.partner + 9}),
        ('ip:7.7.7.7', ${minute}, ${limits.LIMITS.anonymous + 1}),
        ('bad:6.6.6.6', ${minute}, ${limits.LIMITS.badTokens}),
        ('ip:old', now() - interval '2 hours', 999)`);
    const rows = await usage.limitedCallers();
    const byKind = Object.fromEntries(rows.map((r) => [r.kind, r]));
    expect(rows).toHaveLength(4);
    expect(byKind.token).toMatchObject({ userId: USER, name: "App User", minutes: 1 });
    expect(byKind.partner).toMatchObject({ aircraftId, name: "Club", minutes: 1 });
    expect(byKind.partner!.peak).toBe(limits.LIMITS.partner + 9);
    expect(byKind.address).toMatchObject({ address: "7.7.7.7", userId: null });
    expect(byKind.badTokens).toMatchObject({ address: "6.6.6.6" });
    expect(byKind.token!.last).toBeInstanceOf(Date);
  });

  it("forgets minute counts after an hour and daily usage after 90 days", async () => {
    await db.getDb().execute(sql`
      insert into public.api_usage_daily (day, subject_type, subject_id, requests)
      values (current_date - 91, 'user', ${USER}::uuid, 1)`);
    await limits.pruneApiUsage();
    const [left] = (await db.getDb().execute(sql`
      select (select count(*) from public.api_rate_buckets where key = 'ip:old')::int as old,
        (select count(*) from public.api_usage_daily where day < current_date - 90)::int as daily,
        (select count(*) from public.api_rate_buckets)::int as recent`)) as unknown as {
      old: number;
      daily: number;
      recent: number;
    }[];
    expect(left).toMatchObject({ old: 0, daily: 0 });
    expect(left!.recent).toBeGreaterThan(0);
  });
});
