import { eq, sql } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";

import { describeDb, prepareDatabase } from "./setup";

let db: typeof import("@/lib/db");
let rls: typeof import("@/lib/db/rls");
let s: typeof import("@/lib/db/schema");
let ops: typeof import("@/lib/airport-requests/ops");
let queries: typeof import("@/lib/airport-requests/queries");

const PILOT = "a1a1a1a1-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const OTHER_PILOT = "a2a2a2a2-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const MANAGER = "b1b1b1b1-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const STAFF = "b2b2b2b2-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const STRANGER = "c1c1c1c1-cccc-4ccc-8ccc-ccccccccccc1";
const PPR = "LBPR"; // asks for PPR
const OPEN = "LBOK"; // doesn't
const FROM = "LBSF";

const inDays = (days: number, hour = 9) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
};

const request = (services: { serviceId: string; quantity: number }[] = []) => ({
  bookingId: null,
  registration: "LZ-ABC",
  aircraftType: "C172",
  mtomKg: 1157,
  arrivalAt: inDays(3, 9),
  fromIdent: FROM,
  departureAt: inDays(4, 14),
  toIdent: FROM,
  pob: 2,
  purpose: "private" as const,
  other: "Taxi to town, please",
  services,
});

let landing = "";
let fuel = "";
let foreign = "";

describeDb("requests to airfields (APT-2…4)", () => {
  beforeAll(async () => {
    await prepareDatabase();
    db = await import("@/lib/db");
    rls = await import("@/lib/db/rls");
    s = await import("@/lib/db/schema");
    ops = await import("@/lib/airport-requests/ops");
    queries = await import("@/lib/airport-requests/queries");
    const owner = db.getDb();
    await owner.insert(s.users).values([
      { id: PILOT, name: "Pia Pilot", email: "pia@example.com" },
      { id: OTHER_PILOT, name: "Olli Other", email: "olli@example.com" },
      { id: MANAGER, name: "Mona Manager", email: "mona@field.example" },
      { id: STAFF, name: "Sven Staff", email: "sven@field.example" },
      { id: STRANGER, name: "Stan Stranger", email: "stan@example.com" },
    ]);
    await owner.insert(s.userRoles).values([
      { userId: PILOT, role: "pilot" },
      { userId: OTHER_PILOT, role: "pilot" },
    ]);
    await owner.insert(s.airports).values(
      [PPR, OPEN, FROM].map((ident) => ({
        ident,
        type: "small_airport",
        name: ident,
        icaoCode: ident,
        country: "BG",
        latitude: 42.7,
        longitude: 23.4,
        timezone: "Europe/Sofia",
      })),
    );
    await owner.insert(s.airportOperators).values([
      { airportIdent: PPR, pprRequired: true, pprNoticeHours: 24 },
      { airportIdent: OPEN, pprRequired: false },
    ]);
    await owner.insert(s.airportMembers).values([
      { airportIdent: PPR, userId: MANAGER, role: "manager" },
      { airportIdent: PPR, userId: STAFF, role: "staff" },
    ]);
    const rows = await owner
      .insert(s.airportServices)
      .values([
        { airportIdent: PPR, category: "landing", maxMtomKg: 2000, price: 15, unit: "landing" },
        {
          airportIdent: PPR,
          category: "fuel",
          fuelType: "avgas_100ll",
          price: 2.859,
          unit: "litre",
        },
        { airportIdent: OPEN, category: "customs", unit: "once" },
      ])
      .returning({ id: s.airportServices.id });
    [landing, fuel, foreign] = rows.map((r) => r.id) as [string, string, string];
  }, 60_000);

  it("lets pilots send requests; the airfield decides whether they wait for an answer", async () => {
    expect(await ops.sendAirportRequest(STRANGER, PPR, request())).toEqual({
      ok: false,
      error: "not_pilot",
    });
    const sent = await ops.sendAirportRequest(
      PILOT,
      PPR,
      request([
        { serviceId: landing, quantity: 1 },
        { serviceId: fuel, quantity: 80 },
      ]),
    );
    expect(sent).toMatchObject({ ok: true, status: "pending" });
    const open = await ops.sendAirportRequest(PILOT, OPEN, request());
    expect(open).toMatchObject({ ok: true, status: "approved" });
    const [auto] = await db
      .getDb()
      .select()
      .from(s.airportRequests)
      .where(eq(s.airportRequests.id, open.ok ? open.id : ""));
    expect(auto?.autoConfirmed).toBe(true);

    // Prices come from the airfield's list, never the pilot.
    const view = await queries.getAirportRequest(PILOT, sent.ok ? sent.id : "");
    expect(view?.items).toMatchObject([
      { category: "landing", price: 15, quantity: 1 },
      { category: "fuel", fuelType: "avgas_100ll", price: 2.859, quantity: 80 },
    ]);
    expect(view?.request.currency).toBe("EUR");
    expect(view?.role).toBeNull();
  });

  it("refuses made-up statuses, other airfields' services, past trips and others' bookings", async () => {
    // A status sent by the pilot is ignored.
    const [row] = await rls.asUser(PILOT, (tx) =>
      tx
        .insert(s.airportRequests)
        .values({
          airportIdent: PPR,
          pilotId: PILOT,
          registration: "LZ-ABC",
          arrivalAt: inDays(5),
          pob: 1,
          status: "approved",
          pprNumber: "SELF-1",
        })
        .returning(),
    );
    expect(row).toMatchObject({ status: "pending", pprNumber: null });
    expect(
      await ops.sendAirportRequest(PILOT, PPR, request([{ serviceId: foreign, quantity: 1 }])),
    ).toEqual({ ok: false, error: "unknown_service" });
    expect(
      await ops.sendAirportRequest(PILOT, PPR, { ...request(), arrivalAt: inDays(-2) }),
    ).toEqual({ ok: false, error: "in_the_past" });
    const [booking] = (await db
      .getDb()
      .execute(sql`select gen_random_uuid() as id`)) as unknown as {
      id: string;
    }[];
    expect(
      await ops.sendAirportRequest(PILOT, PPR, { ...request(), bookingId: booking!.id }),
    ).toEqual({ ok: false, error: "booking_not_yours" });
  });

  it("shows a request to its pilot and the airfield's team only", async () => {
    const [first] = await queries.myAirportRequests(PILOT);
    expect(first).toBeDefined();
    const id = first!.id;
    expect(await queries.getAirportRequest(STAFF, id)).not.toBeNull();
    expect(await queries.getAirportRequest(OTHER_PILOT, id)).toBeNull();
    expect(await queries.getAirportRequest(STRANGER, id)).toBeNull();
    expect(await rls.asAnon((tx) => tx.select().from(s.airportRequests))).toEqual([]);
    expect(await rls.asAnon((tx) => tx.select().from(s.airportRequestItems))).toEqual([]);
    const board = await queries.airportMovements(MANAGER, PPR, inDays(0, 0), inDays(10, 0));
    expect(board.length).toBeGreaterThan(0);
    expect(await queries.airportMovements(STRANGER, PPR, inDays(0, 0), inDays(10, 0))).toEqual([]);
  });

  it("lets the team answer and the pilot cancel, and tells the other side", async () => {
    const sent = await ops.sendAirportRequest(PILOT, PPR, request());
    const id = sent.ok ? sent.id : "";
    const approve = {
      decision: "approve" as const,
      pprNumber: "PPR-042",
      conditions: "Arrive after 10:00 UTC",
      note: null,
    };
    expect(await ops.answerAirportRequest(PILOT, id, approve)).toEqual({
      ok: false,
      error: "not_allowed",
    });
    expect(await ops.answerAirportRequest(STRANGER, id, approve)).toEqual({
      ok: false,
      error: "not_allowed",
    });
    expect(await ops.answerAirportRequest(STAFF, id, approve)).toEqual({ ok: true });
    const view = await queries.getAirportRequest(PILOT, id);
    expect(view?.request).toMatchObject({ status: "approved", pprNumber: "PPR-042" });
    expect(view?.answeredBy).toBe("Sven Staff");

    expect(await ops.cancelAirportRequest(STAFF, id)).toEqual({ ok: false, error: "not_allowed" });
    expect(await ops.cancelAirportRequest(PILOT, id)).toEqual({ ok: true });
    expect(await ops.answerAirportRequest(MANAGER, id, approve)).toEqual({
      ok: false,
      error: "request_closed",
    });

    const notes = await db
      .getDb()
      .select({ user: s.notifications.userId, type: s.notifications.type })
      .from(s.notifications)
      .where(eq(s.notifications.airportRequestId, id));
    expect(notes).toEqual(
      expect.arrayContaining([
        { user: MANAGER, type: "apt_requested" },
        { user: STAFF, type: "apt_requested" },
        { user: PILOT, type: "apt_approved" },
        { user: MANAGER, type: "apt_cancelled" },
        { user: STAFF, type: "apt_cancelled" },
      ]),
    );
    // Nobody hears of their own action.
    expect(notes).not.toContainEqual({ user: PILOT, type: "apt_requested" });
    expect(notes).not.toContainEqual({ user: STAFF, type: "apt_approved" });
  });

  it("counts today's movements for the team", async () => {
    const today = await queries.airfieldToday(MANAGER, [PPR], inDays(3, 0));
    expect(today.get(PPR)?.arrivals).toBeGreaterThan(0);
  });
});
