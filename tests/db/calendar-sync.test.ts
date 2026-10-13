import { and, eq, sql } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";

import { describeDb, prepareDatabase } from "./setup";

let db: typeof import("@/lib/db");
let rls: typeof import("@/lib/db/rls");
let s: typeof import("@/lib/db/schema");

const OWNER = "5e5e5e5e-1111-4111-8111-111111111111";
const OTHER = "6f6f6f6f-2222-4222-8222-222222222222";
let aircraftId: string;

const range = (from: string, to: string) => `[${from},${to})`;

async function pgCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string } };
    return err.cause?.code ?? err.code;
  }
}

describeDb("calendar sync (SYN-1…5)", () => {
  beforeAll(async () => {
    await prepareDatabase();
    db = await import("@/lib/db");
    rls = await import("@/lib/db/rls");
    s = await import("@/lib/db/schema");
    const owner = db.getDb();
    await owner.insert(s.users).values([
      { id: OWNER, name: "Owner", email: "sync-owner@example.com" },
      { id: OTHER, name: "Other", email: "sync-other@example.com" },
    ]);
    const [plane] = await owner
      .insert(s.aircraft)
      .values({
        ownerId: OWNER,
        registration: "LZ-SYN",
        manufacturer: "Cessna",
        model: "172S",
        typeDesignator: "C172",
        seats: 4,
        fuelType: "avgas_100ll",
      })
      .returning();
    aircraftId = plane!.id;
  }, 60_000);

  const connect = (userId: string, values: Partial<typeof s.calendarConnections.$inferInsert>) =>
    rls.asUser(userId, (tx) =>
      tx
        .insert(s.calendarConnections)
        .values({ aircraftId, name: "Club system", inbound: "none", ...values })
        .returning(),
    );

  it("lets only the owner connect, see and change an aircraft's connections", async () => {
    const [mine] = await connect(OWNER, {
      inbound: "json",
      feedUrl: "https://club.example/busy.json",
    });
    expect(mine).toMatchObject({ createdBy: OWNER, lastSyncAt: null });
    expect(mine!.exportToken).toMatch(/^[0-9a-f]{64}$/);

    expect(await pgCode(connect(OTHER, { name: "Mine now" }))).toBe("42501");
    expect(await rls.asUser(OTHER, (tx) => tx.select().from(s.calendarConnections))).toEqual([]);
    expect(await rls.asAnon((tx) => tx.select().from(s.calendarConnections))).toEqual([]);
    const renamed = await rls.asUser(OTHER, (tx) =>
      tx.update(s.calendarConnections).set({ name: "x" }).returning(),
    );
    expect(renamed).toEqual([]);

    // The owner renames it, but can't fake its sync status or change how it works.
    await rls.asUser(OWNER, (tx) =>
      tx
        .update(s.calendarConnections)
        .set({ name: "Aeroclub" })
        .where(eq(s.calendarConnections.id, mine!.id)),
    );
    expect(
      await pgCode(
        rls.asUser(OWNER, (tx) => tx.update(s.calendarConnections).set({ lastSyncCount: 5 })),
      ),
    ).toBe("42501");
    expect(
      await pgCode(
        rls.asUser(OWNER, (tx) => tx.update(s.calendarConnections).set({ inbound: "push" })),
      ),
    ).toBe("42501");
    expect(await pgCode(connect(OWNER, { lastSyncCount: 3 }))).toBe("42501");
  });

  it("checks how each kind of connection is set up", async () => {
    // A link for iCal/JSON (https only), a key hash for push, nothing for export-only.
    expect(await pgCode(connect(OWNER, { inbound: "ical" }))).toBe("23514");
    expect(
      await pgCode(connect(OWNER, { inbound: "ical", feedUrl: "http://plain.example/x.ics" })),
    ).toBe("23514");
    expect(await pgCode(connect(OWNER, { inbound: "push" }))).toBe("23514");
    const [push] = await connect(OWNER, { inbound: "push", apiKeyHash: "a".repeat(64) });
    expect(push!.inbound).toBe("push");
  });

  it("lets the owner choose the data exchanged, from the known fields only", async () => {
    const [conn] = await connect(OWNER, { name: "Fields" });
    const choose = (userId: string, exportFields: string[], importFields: string[]) =>
      rls.asUser(userId, (tx) =>
        tx
          .update(s.calendarConnections)
          .set({ exportFields, importFields })
          .where(eq(s.calendarConnections.id, conn!.id))
          .returning(),
      );
    expect(conn).toMatchObject({ exportFields: [], importFields: [] });
    const [saved] = await choose(OWNER, ["route", "pilot"], ["title"]);
    expect(saved).toMatchObject({ exportFields: ["route", "pilot"], importFields: ["title"] });
    expect(await choose(OTHER, ["note"], [])).toEqual([]);
    // Contact details are never offered to other systems.
    expect(await pgCode(choose(OWNER, ["email"], []))).toBe("23514");
    expect(await pgCode(choose(OWNER, [], ["pilot"]))).toBe("23514");
  });

  it("keeps external busy times for the sync code", async () => {
    const [conn] = await rls.asUser(OWNER, (tx) => tx.select().from(s.calendarConnections));
    expect(
      await pgCode(
        rls.asUser(OWNER, (tx) =>
          tx.insert(s.calendarEntries).values({
            aircraftId,
            kind: "unavailable",
            connectionId: conn!.id,
            externalId: "fake",
            period: range("2026-12-01T08:00:00Z", "2026-12-01T10:00:00Z"),
          }),
        ),
      ),
    ).toBe("42501");
  });

  it("activates a held-back external busy time once what was in the way is released", async () => {
    const owner = db.getDb();
    const [conn] = await owner
      .insert(s.calendarConnections)
      .values({ aircraftId, name: "Held back", inbound: "none" })
      .returning();
    const [block] = await rls.asUser(OWNER, (tx) =>
      tx
        .insert(s.calendarEntries)
        .values({
          aircraftId,
          kind: "owner_use",
          period: range("2026-12-10T08:00:00Z", "2026-12-10T12:00:00Z"),
        })
        .returning(),
    );
    const external = (externalId: string, from: string, to: string) =>
      owner
        .insert(s.calendarEntries)
        .values({
          aircraftId,
          kind: "unavailable",
          connectionId: conn!.id,
          externalId,
          period: range(from, to),
          active: false,
        })
        .returning();
    const [held] = await external("E1", "2026-12-10T10:00:00Z", "2026-12-10T14:00:00Z");
    const [later] = await external("E2", "2026-12-10T11:00:00Z", "2026-12-10T13:00:00Z");

    // Removing the owner's block frees the time: the first one becomes active, the second
    // still overlaps it and stays held back (no booking in the way, so not a conflict).
    await rls.asUser(OWNER, (tx) =>
      tx.delete(s.calendarEntries).where(eq(s.calendarEntries.id, block!.id)),
    );
    const rows = await owner
      .select()
      .from(s.calendarEntries)
      .where(and(eq(s.calendarEntries.connectionId, conn!.id)));
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(held!.id)).toMatchObject({ active: true, conflict: false });
    expect(byId.get(later!.id)).toMatchObject({ active: false, conflict: false });
  });

  it("allows at most ten connections per aircraft", async () => {
    const count = (await rls.asUser(OWNER, (tx) => tx.select().from(s.calendarConnections))).length;
    for (let i = count; i < 10; i++) await connect(OWNER, { name: `Extra ${i}` });
    expect(await pgCode(connect(OWNER, { name: "One too many" }))).toBe("P0001");
  });
});

describeDb("calendar sync engine", () => {
  let apply: typeof import("@/lib/calendar-sync/apply");
  let sync: typeof import("@/lib/calendar-sync/sync");
  let plane: string;
  let connectionId: string;
  let bookingId: string;
  const PILOT = "7a7a7a7a-3333-4333-8333-333333333333";
  const at = (day: number, hour: number) => new Date(Date.UTC(2027, 0, day, hour)).toISOString();
  const event = (id: string, day: number, from: number, to: number) => ({
    id,
    from: new Date(at(day, from)),
    to: new Date(at(day, to)),
  });

  beforeAll(async () => {
    await prepareDatabase();
    db = await import("@/lib/db");
    rls = await import("@/lib/db/rls");
    s = await import("@/lib/db/schema");
    apply = await import("@/lib/calendar-sync/apply");
    sync = await import("@/lib/calendar-sync/sync");
    const owner = db.getDb();
    await owner
      .insert(s.users)
      .values({ id: PILOT, name: "Pilot", email: "sync-pilot@example.com" });
    await owner.insert(s.airports).values({
      ident: "LBSF",
      type: "large_airport",
      name: "Sofia",
      icaoCode: "LBSF",
      country: "BG",
      latitude: 42.6952,
      longitude: 23.4062,
      timezone: "Europe/Sofia",
    });
    const [p] = await owner
      .insert(s.aircraft)
      .values({
        ownerId: OWNER,
        registration: "LZ-SYE",
        manufacturer: "Piper",
        model: "PA-28",
        typeDesignator: "P28A",
        seats: 4,
        fuelType: "avgas_100ll",
      })
      .returning();
    plane = p!.id;
    const [c] = await owner
      .insert(s.calendarConnections)
      .values({
        aircraftId: plane,
        name: "Club",
        inbound: "json",
        feedUrl: "https://club.example/b.json",
      })
      .returning();
    connectionId = c!.id;
    // An accepted ownAplane booking on 5 January, 10:00-14:00 UTC.
    const [b] = await owner
      .insert(s.bookings)
      .values({
        aircraftId: plane,
        pilotId: PILOT,
        ownerId: OWNER,
        status: "accepted",
        period: range(at(5, 10), at(5, 14)),
        departureIdent: "LBSF",
        arrivalIdent: "LBSF",
        purpose: "local",
        plannedHours: 2,
        pricePerHour: 150,
        currency: "EUR",
        priceBasis: "wet",
        timeBasis: "hobbs",
        estimate: 300,
        expiresAt: new Date(at(4, 0)),
      })
      .returning();
    bookingId = b!.id;
    await owner.insert(s.calendarEntries).values({
      aircraftId: plane,
      kind: "booking",
      bookingId,
      period: range(at(5, 10), at(5, 14)),
    });
  }, 60_000);

  const entries = () =>
    db
      .getDb()
      .select()
      .from(s.calendarEntries)
      .where(eq(s.calendarEntries.connectionId, connectionId));

  it("blocks free time and keeps clashes with bookings as conflicts, telling the owner", async () => {
    const result = await apply.applyEvents(
      connectionId,
      [event("free", 6, 8, 10), event("clash", 5, 12, 16)],
      "replace",
    );
    expect(Object.fromEntries(result.statuses)).toEqual({ free: "active", clash: "conflict" });
    const rows = await entries();
    expect(rows.find((r) => r.externalId === "clash")).toMatchObject({
      active: false,
      conflict: true,
    });
    const alerts = await db
      .getDb()
      .select()
      .from(s.notifications)
      .where(eq(s.notifications.userId, OWNER));
    expect(alerts).toMatchObject([{ type: "calendar_conflict", bookingId }]);

    // The same feed again: nothing changes and the owner isn't told twice.
    await apply.applyEvents(
      connectionId,
      [event("free", 6, 8, 10), event("clash", 5, 12, 16)],
      "replace",
    );
    const again = await db
      .getDb()
      .select()
      .from(s.notifications)
      .where(eq(s.notifications.userId, OWNER));
    expect(again).toHaveLength(1);
  });

  it("moves changed times, removes what's gone from the feed and accepts pushes", async () => {
    const result = await apply.applyEvents(connectionId, [event("free", 7, 8, 9)], "replace");
    expect(result.removed).toBe(1); // "clash" is no longer in the feed
    const pushed = await apply.applyEvents(connectionId, [event("pushed", 8, 8, 9)], "upsert");
    expect(pushed.statuses.get("pushed")).toBe("active");
    const rows = await entries();
    expect(rows.map((r) => r.externalId).sort()).toEqual(["free", "pushed"]);
    expect(await apply.removeEvent(connectionId, "pushed")).toBe(true);
    expect(await apply.removeEvent(connectionId, "pushed")).toBe(false);
  });

  it("activates a conflict once the booking in the way is cancelled", async () => {
    await apply.applyEvents(connectionId, [event("clash", 5, 12, 16)], "upsert");
    // Booking functions release the hold by deactivating the booking's entry.
    await db
      .getDb()
      .update(s.calendarEntries)
      .set({ active: false })
      .where(eq(s.calendarEntries.bookingId, bookingId));
    const clash = (await entries()).find((r) => r.externalId === "clash");
    expect(clash).toMatchObject({ active: true, conflict: false });
  });

  it("records why a linked calendar couldn't be read", async () => {
    const conn = {
      id: connectionId,
      inbound: "json" as const,
      feedUrl: "https://club.example/b.json",
      partner: null,
    };
    const ok = await sync.syncConnection(conn, async () => ({
      text: JSON.stringify({ busy: [{ id: "f1", start: at(9, 8), end: at(9, 9) }] }),
      contentType: "application/json",
    }));
    expect(ok).toEqual({ ok: true, count: 1, conflicts: 0 });
    const bad = await sync.syncConnection(conn, async () => ({
      text: "<html>",
      contentType: "text/html",
    }));
    expect(bad).toEqual({ ok: false, error: "json_invalid" });
    const [row] = await db
      .getDb()
      .select()
      .from(s.calendarConnections)
      .where(eq(s.calendarConnections.id, connectionId));
    expect(row).toMatchObject({ lastSyncError: "json_invalid", lastSyncCount: 1 });
    // A failed read leaves the last known busy times in place.
    expect((await entries()).map((r) => r.externalId)).toEqual(["f1"]);
    // The scheduled job reads links not read recently (the never-read one from the first tests,
    // whose made-up address can't be reached), but not this one, read a moment ago.
    expect(await sync.syncDueCalendars(10 * 60_000, 50)).toBeGreaterThanOrEqual(1);
    const [same] = await db
      .getDb()
      .select()
      .from(s.calendarConnections)
      .where(eq(s.calendarConnections.id, connectionId));
    expect(same!.lastSyncError).toBe("json_invalid");
  });

  it("keeps only what the owner chose to take from the other system", async () => {
    const owner = db.getDb();
    const [c] = await owner
      .insert(s.calendarConnections)
      .values({
        aircraftId: plane,
        name: "Choosy",
        inbound: "push",
        apiKeyHash: "c".repeat(64),
        importFields: ["title", "type", "status", "registration"],
      })
      .returning();
    const id = c!.id;
    const stored = async () =>
      (await owner.select().from(s.calendarEntries).where(eq(s.calendarEntries.connectionId, id)))
        .map((r) => [r.externalId, r.kind, r.note])
        .sort();
    const lesson = { ...event("lesson", 12, 8, 10), title: "Lesson LZ-SYE" };
    const check = { ...event("check", 13, 8, 12), type: "maintenance" as const };

    const result = await apply.applyEvents(
      id,
      [
        lesson,
        { ...check, registration: "lz sye" },
        { ...event("maybe", 14, 8, 10), tentative: true },
        { ...event("other", 15, 8, 10), registration: "LZ-ABC" },
      ],
      "upsert",
    );
    expect(Object.fromEntries(result.statuses)).toEqual({
      lesson: "active",
      check: "active",
      maybe: "ignored",
      other: "wrong_aircraft",
    });
    expect(await stored()).toEqual([
      ["check", "maintenance", null],
      ["lesson", "unavailable", "Lesson LZ-SYE"],
    ]);

    // A booking that turns tentative is released.
    await apply.applyEvents(id, [{ ...lesson, tentative: true }], "upsert");
    expect(await stored()).toEqual([["check", "maintenance", null]]);

    // Without the choices, every busy time blocks the aircraft, without title or type.
    await owner
      .update(s.calendarConnections)
      .set({ importFields: [] })
      .where(eq(s.calendarConnections.id, id));
    await apply.applyEvents(
      id,
      [lesson, check, { ...event("other", 15, 8, 10), registration: "LZ-ABC", tentative: true }],
      "replace",
    );
    expect(await stored()).toEqual([
      ["check", "unavailable", null],
      ["lesson", "unavailable", null],
      ["other", "unavailable", null],
    ]);
  });

  it("reads a partner with the owner's encrypted key for all their aircraft, by registration (SYN-7)", async () => {
    const partners = await import("@/lib/calendar-sync/partners");
    const keys = await import("@/lib/calendar-sync/partner-credentials");
    const { FeedError } = await import("@/lib/calendar-sync/feeds");
    process.env.BETTER_AUTH_SECRET ??= "test-secret-for-partner-keys-0123456789";
    const owner = db.getDb();
    const base = { aircraftId: plane, name: "RAF Aviation" };
    // A partner connection names a known partner, and only partner connections do.
    for (const values of [
      { inbound: "partner" as const },
      { inbound: "partner" as const, partner: "somebody" },
      { inbound: "json" as const, feedUrl: "https://a.example/b.json", partner: "rafaviation" },
    ]) {
      expect(await pgCode(owner.insert(s.calendarConnections).values({ ...base, ...values }))).toBe(
        "23514",
      );
    }
    // LZ-SYE is out of draft; LZ-DRF is still a draft, so it never gets partner bookings.
    await owner.update(s.aircraft).set({ status: "paused" }).where(eq(s.aircraft.id, plane));
    await owner.insert(s.aircraft).values({
      ownerId: OWNER,
      registration: "LZ-DRF",
      manufacturer: "Piper",
      model: "PA-28",
      typeDesignator: "P28A",
      seats: 4,
      fuelType: "avgas_100ll",
    });

    const calls: { url: string; auth?: string }[] = [];
    // RAF Aviation answers in Sofia local time (UTC+2 in January), next January.
    const year = new Date().getUTCFullYear() + 1;
    const booking = (day: number, from: string, to: string, registration?: string) => ({
      date: `${year}-01-${day}`,
      from,
      to,
      status: day === 21 ? "pending" : "approved",
      registration,
    });
    const raf =
      (data: unknown[]) => async (url: string, options?: { headers?: Record<string, string> }) => {
        calls.push({ url, auth: options?.headers?.authorization });
        return { contentType: "application/json", text: JSON.stringify({ data }) };
      };
    const answer = raf([
      booking(20, "10:00", "12:00", "LZSYE"),
      booking(21, "22:00", "01:00", "lz-sye"),
      booking(22, "10:00", "11:00", "LZ-DRF"),
      booking(23, "10:00", "11:00"), // no registration: EC-IDR's
    ]);
    const partnerConnections = () =>
      owner
        .select()
        .from(s.calendarConnections)
        .where(eq(s.calendarConnections.partner, "rafaviation"));
    const stored = () =>
      owner
        .select({ id: s.calendarEntries.externalId, kind: s.calendarEntries.kind })
        .from(s.calendarEntries)
        .innerJoin(
          s.calendarConnections,
          eq(s.calendarConnections.id, s.calendarEntries.connectionId),
        )
        .where(eq(s.calendarConnections.partner, "rafaviation"))
        .orderBy(s.calendarEntries.externalId);

    // Without a key nothing is read.
    expect(await partners.syncPartnerAccount(OWNER, "rafaviation", answer)).toEqual({
      ok: false,
      error: "partner_unavailable",
    });
    expect(calls).toEqual([]);

    // Stored encrypted; nobody reads it through the app, not even its owner.
    await keys.storePartnerKey(OWNER, "rafaviation", "raf-owner-key-1234");
    const [credential] = await owner.select().from(s.partnerCredentials);
    expect(credential).toMatchObject({ userId: OWNER, partner: "rafaviation", hint: "1234" });
    expect(credential!.secret).not.toContain("raf-owner-key");
    expect(await pgCode(rls.asUser(OWNER, (tx) => tx.select().from(s.partnerCredentials)))).toBe(
      "42501",
    );

    // One read covers the account; LZ-SYE's bookings land on it, in UTC, as external bookings.
    const result = await partners.syncPartnerAccount(OWNER, "rafaviation", answer);
    expect(result).toMatchObject({ ok: true, aircraft: [{ registration: "LZ-SYE", count: 2 }] });
    expect(result.ok && result.unmatched.sort()).toEqual(["EC-IDR", "LZ-DRF"]);
    expect(calls[0]!.auth).toBe("Bearer raf-owner-key-1234");
    expect(new URL(calls[0]!.url).searchParams.has("registration")).toBe(false);
    const [conn] = await partnerConnections();
    expect(conn).toMatchObject({
      aircraftId: plane,
      name: "RAF Aviation",
      inbound: "partner",
      createdBy: OWNER,
      lastSyncCount: 2,
      lastSyncError: null,
    });
    expect(await stored()).toEqual([
      { id: `LZSYE:${year}-01-20T10:00/12:00`, kind: "unavailable" },
      { id: `LZSYE:${year}-01-21T22:00/01:00`, kind: "unavailable" },
    ]);
    const [late] = (await owner.execute(sql`
      select lower(period) as "from", upper(period) as "to" from public.calendar_entries
      where connection_id = ${conn!.id} and external_id = ${`LZSYE:${year}-01-21T22:00/01:00`}`)) as unknown as {
      from: Date;
      to: Date;
    }[];
    expect([new Date(late!.from).toISOString(), new Date(late!.to).toISOString()]).toEqual([
      `${year}-01-21T20:00:00.000Z`,
      `${year}-01-21T23:00:00.000Z`,
    ]);
    const [used] = await keys.listPartnerCredentials(OWNER);
    expect(used!.lastUsedAt).not.toBeNull();
    expect(used!.lastSyncAt).not.toBeNull();

    // Read again (the card's "Sync now" reads the account): still one connection.
    const pull = {
      id: conn!.id,
      inbound: "partner" as const,
      feedUrl: null,
      partner: "rafaviation",
    };
    expect(await sync.syncConnection(pull, answer)).toEqual({ ok: true, count: 2, conflicts: 0 });
    expect(await partnerConnections()).toHaveLength(1);

    // Due for the scheduled job only once it's stale.
    expect(await keys.ownerPartnersDue(OWNER, 60_000)).toEqual([]);
    expect((await keys.partnerKeysDue(0)).map((k) => k.userId)).toContain(OWNER);

    // Bookings gone at RAF: the time is free again; the connection stays.
    expect(await partners.syncPartnerAccount(OWNER, "rafaviation", raf([]))).toEqual({
      ok: true,
      aircraft: [],
      unmatched: [],
    });
    expect(await stored()).toEqual([]);
    expect(await partnerConnections()).toMatchObject([{ lastSyncCount: 0 }]);

    // A refused key is noted on the credential and the connection.
    const refused = async () => {
      throw new FeedError("key_rejected", "401");
    };
    expect(await partners.syncPartnerAccount(OWNER, "rafaviation", refused)).toEqual({
      ok: false,
      error: "key_rejected",
    });
    expect((await keys.listPartnerCredentials(OWNER))[0]!.lastError).toBe("key_rejected");
    expect(await partnerConnections()).toMatchObject([{ lastSyncError: "key_rejected" }]);

    // Removing the key removes the partner's connections and busy times, nothing else.
    await partners.syncPartnerAccount(OWNER, "rafaviation", answer);
    await keys.deletePartnerKey(OWNER, "rafaviation");
    await partners.removePartnerConnections(OWNER, "rafaviation");
    expect(await partnerConnections()).toEqual([]);
    expect(await stored()).toEqual([]);
    expect(await entries()).not.toHaveLength(0);
  });
});
