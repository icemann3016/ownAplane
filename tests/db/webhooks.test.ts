import { and, eq, isNull } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";

import { describeDb, prepareDatabase } from "./setup";

let db: typeof import("@/lib/db");
let rls: typeof import("@/lib/db/rls");
let s: typeof import("@/lib/db/schema");
let hooks: typeof import("@/lib/calendar-sync/webhooks");
let signature: typeof import("@/lib/calendar-sync/signature");

const OWNER = "b1b1b1b1-1111-4111-8111-111111111111";
const OTHER = "c2c2c2c2-2222-4222-8222-222222222222";
const SECRET = "d".repeat(64);
let aircraftId: string;
let withHook: string;
let withoutHook: string;

type Call = { url: string; body: string; headers: Record<string, string> };

async function code(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (e) {
    const err = e as { cause?: { code?: string } };
    return err.cause?.code;
  }
}

const range = (day: number, from: number, to: number) =>
  `[2027-03-${String(day).padStart(2, "0")}T${String(from).padStart(2, "0")}:00:00Z,2027-03-${String(day).padStart(2, "0")}T${String(to).padStart(2, "0")}:00:00Z)`;

describeDb("webhooks to connected systems (SYN-6)", () => {
  beforeAll(async () => {
    await prepareDatabase();
    db = await import("@/lib/db");
    rls = await import("@/lib/db/rls");
    s = await import("@/lib/db/schema");
    hooks = await import("@/lib/calendar-sync/webhooks");
    signature = await import("@/lib/calendar-sync/signature");
    const owner = db.getDb();
    await owner.insert(s.users).values([
      { id: OWNER, name: "Owner", email: "hook-owner@example.com" },
      { id: OTHER, name: "Other", email: "hook-other@example.com" },
    ]);
    const [plane] = await owner
      .insert(s.aircraft)
      .values({
        ownerId: OWNER,
        registration: "LZ-HOK",
        manufacturer: "Cessna",
        model: "172S",
        typeDesignator: "C172",
        seats: 4,
        fuelType: "avgas_100ll",
      })
      .returning();
    aircraftId = plane!.id;
    const [a, b] = await owner
      .insert(s.calendarConnections)
      .values([
        {
          aircraftId,
          name: "Club",
          inbound: "push",
          apiKeyHash: "1".repeat(64),
          webhookUrl: "https://club.example/hooks",
          webhookSecret: SECRET,
          exportFields: ["type"],
        },
        { aircraftId, name: "Calendar", inbound: "push", apiKeyHash: "2".repeat(64) },
      ])
      .returning();
    withHook = a!.id;
    withoutHook = b!.id;
  }, 60_000);

  const pending = () =>
    db
      .getDb()
      .select()
      .from(s.webhookEvents)
      .where(and(eq(s.webhookEvents.connectionId, withHook), isNull(s.webhookEvents.deliveredAt)));

  const recorder = (answer: { ok: true } | { ok: false; error: string } = { ok: true }) => {
    const calls: Call[] = [];
    const poster: import("@/lib/calendar-sync/webhooks").Poster = async (url, body, headers) => {
      calls.push({ url, body, headers });
      return answer;
    };
    return { calls, poster };
  };

  it("lets only the owner set a webhook, https only, and hides the queue", async () => {
    const set = (user: string, webhookUrl: string) =>
      rls.asUser(user, (tx) =>
        tx
          .update(s.calendarConnections)
          .set({ webhookUrl, webhookSecret: SECRET })
          .where(eq(s.calendarConnections.id, withoutHook))
          .returning(),
      );
    expect(await set(OTHER, "https://x.example/h")).toEqual([]);
    expect(await code(set(OWNER, "http://plain.example/h"))).toBe("23514");
    expect(await code(rls.asUser(OWNER, (tx) => tx.select().from(s.webhookEvents)))).toBe("42501");
  });

  it("queues a change for systems with a webhook, never echoing their own busy times", async () => {
    const [block] = await rls.asUser(OWNER, (tx) =>
      tx
        .insert(s.calendarEntries)
        .values({ aircraftId, kind: "maintenance", period: range(2, 8, 12) })
        .returning(),
    );
    expect((await pending()).map((e) => e.entryId)).toEqual([block!.id]);

    // Busy times pushed by the club itself aren't sent back to it; another system's are.
    const apply = await import("@/lib/calendar-sync/apply");
    const at = (h: number) => new Date(Date.UTC(2027, 2, 3, h));
    await apply.applyEvents(withHook, [{ id: "own", from: at(8), to: at(9) }], "upsert");
    await apply.applyEvents(withoutHook, [{ id: "theirs", from: at(10), to: at(11) }], "upsert");
    expect(await pending()).toHaveLength(2);
  });

  it("sends each change signed, as its current state, once", async () => {
    const { calls, poster } = recorder();
    expect(await hooks.deliverWebhooks(100, poster)).toBe(2);
    expect(calls.map((c) => c.url)).toEqual([
      "https://club.example/hooks",
      "https://club.example/hooks",
    ]);
    const events = calls.map((c) => JSON.parse(c.body));
    expect(events[0]).toMatchObject({
      type: "busy.updated",
      aircraft: { id: aircraftId, registration: "LZ-HOK" },
      busy: { kind: "blocked", type: "maintenance", from: "2027-03-02T08:00:00.000Z" },
    });
    expect(events[1]).toMatchObject({ busy: { kind: "blocked", type: "unavailable" } });
    for (const c of calls) {
      expect(c.headers["ownaplane-event"]).toBe("busy.updated");
      expect(signature.verifyWebhook(SECRET, c.body, c.headers["ownaplane-signature"]!)).toBe(true);
    }
    expect(await pending()).toEqual([]);
    expect(await hooks.deliverWebhooks(100, poster)).toBe(0);
  });

  it("sends a deletion when a busy time goes, and retries failures later", async () => {
    await rls.asUser(OWNER, (tx) =>
      tx.delete(s.calendarEntries).where(eq(s.calendarEntries.kind, "maintenance")),
    );
    const failing = recorder({ ok: false, error: "http_500" });
    expect(await hooks.deliverWebhooks(100, failing.poster)).toBe(0);
    const [event] = await pending();
    expect(event).toMatchObject({ attempts: 1, lastError: "http_500" });
    expect(event!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    const [conn] = await db
      .getDb()
      .select()
      .from(s.calendarConnections)
      .where(eq(s.calendarConnections.id, withHook));
    expect(conn!.webhookLastError).toBe("http_500");

    // Due again: it goes as a deletion with only the id.
    await db.getDb().update(s.webhookEvents).set({ nextAttemptAt: new Date() });
    const { calls, poster } = recorder();
    expect(await hooks.deliverWebhooks(100, poster)).toBe(1);
    expect(JSON.parse(calls[0]!.body)).toMatchObject({
      type: "busy.deleted",
      busy: { id: event!.entryId },
    });
  });

  it("sends a ping on request and survives the aircraft being deleted", async () => {
    const { calls, poster } = recorder();
    expect(await hooks.sendTestWebhook(withHook, poster)).toEqual({ ok: true });
    expect(JSON.parse(calls[0]!.body)).toMatchObject({ type: "ping" });
    await rls.asUser(OWNER, (tx) =>
      tx
        .insert(s.calendarEntries)
        .values({ aircraftId, kind: "owner_use", period: range(9, 8, 12) }),
    );
    await db.getDb().delete(s.aircraft).where(eq(s.aircraft.id, aircraftId));
    expect(await db.getDb().select().from(s.webhookEvents)).toEqual([]);
  });
});
