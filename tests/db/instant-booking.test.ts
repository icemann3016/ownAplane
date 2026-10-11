import { eq, sql } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";

import { describeDb, forceListed, prepareDatabase } from "./setup";

let db: typeof import("@/lib/db");
let rls: typeof import("@/lib/db/rls");
let s: typeof import("@/lib/db/schema");

const OWN = "e1e1e1e1-1111-4111-8111-e1e1e1e1e1e1"; // owner
const PIL = "e2e2e2e2-2222-4222-8222-e2e2e2e2e2e2"; // pilot with an accepted booking
const NXT = "e3e3e3e3-3333-4333-8333-e3e3e3e3e3e3"; // pilot with a pending request
const OTH = "e4e4e4e4-4444-4444-8444-e4e4e4e4e4e4"; // someone else
let planeId: string;

const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

async function verifiedPilot(userId: string) {
  const owner = db.getDb();
  await owner.insert(s.pilotLicences).values({
    userId,
    type: "ppl_a",
    issuingState: "BG",
    number: userId.slice(0, 4),
    status: "verified",
  });
  await owner.insert(s.medicals).values({
    userId,
    class: "class2",
    issuingState: "BG",
    validUntil: "2099-01-01",
    status: "verified",
  });
  await owner.insert(s.pilotRatings).values([
    { userId, kind: "class", code: "SEP_LAND", status: "verified" },
    { userId, kind: "privilege", code: "NIGHT", status: "verified" },
  ]);
}

async function request(userId: string, from: number, to: number) {
  const [row] = (await rls.asUser(userId, (tx) =>
    tx.execute(sql`select public.request_booking(${planeId}::uuid,
      tstzrange(${at(from)}::timestamptz, ${at(to)}::timestamptz), 'LBSF', 'LBSF', '{}'::text[],
      'local', 0, 1.5, null, 270) as id`),
  )) as unknown as { id: string }[];
  return row!.id;
}

const statusOf = (id: string) =>
  db
    .getDb()
    .select({ status: s.bookings.status })
    .from(s.bookings)
    .where(eq(s.bookings.id, id))
    .then((r) => r[0]!.status);
const eventsOf = (id: string) =>
  db
    .getDb()
    .select({ type: s.bookingEvents.type })
    .from(s.bookingEvents)
    .where(eq(s.bookingEvents.bookingId, id))
    .then((r) => r.map((e) => e.type));

describeDb("instant booking", () => {
  beforeAll(async () => {
    await prepareDatabase();
    db = await import("@/lib/db");
    rls = await import("@/lib/db/rls");
    s = await import("@/lib/db/schema");
    const owner = db.getDb();
    await owner.insert(s.users).values([
      { id: OWN, name: "Own", email: "own-i@example.com" },
      { id: PIL, name: "Pil", email: "pil-i@example.com" },
      { id: NXT, name: "Nxt", email: "nxt-i@example.com" },
      { id: OTH, name: "Oth", email: "oth-i@example.com" },
    ]);
    await owner.insert(s.airports).values({
      ident: "LBSF",
      type: "large_airport",
      name: "Sofia",
      country: "BG",
      latitude: 42.6952,
      longitude: 23.4062,
      timezone: "Europe/Sofia",
    });
    const [plane] = await owner
      .insert(s.aircraft)
      .values({
        ownerId: OWN,
        registration: "LZ-INS",
        manufacturer: "Cessna",
        model: "172",
        typeDesignator: "C172",
        seats: 4,
        fuelType: "avgas_100ll",
        homeAirportIdent: "LBSF",
        pricePerHour: 180,
        nightVfr: true,
      })
      .returning();
    planeId = plane!.id;
    await forceListed(planeId);
    await owner.insert(s.rentalRequirements).values({ aircraftId: planeId, instantBooking: true });
    await verifiedPilot(PIL);
    await verifiedPilot(NXT);
    // PIL has flown it before (a completed rental).
    const earlier = await request(PIL, 60 * 24, 60 * 24 + 120);
    await owner.update(s.bookings).set({ status: "completed" }).where(eq(s.bookings.id, earlier));
  }, 60_000);

  it("accepts at once for a pilot who has flown the aircraft before", async () => {
    const id = await request(PIL, 60 * 48, 60 * 48 + 120);
    expect(await statusOf(id)).toBe("accepted");
    expect(await eventsOf(id)).toEqual(["instant_booked"]);
    const owners = await rls.asUser(OWN, (tx) =>
      tx.select().from(s.notifications).where(eq(s.notifications.bookingId, id)),
    );
    expect(owners.map((n) => n.type)).toEqual(["instant_booked"]);
  });

  it("sends an ordinary request for pilots new to the aircraft", async () => {
    const id = await request(NXT, 60 * 72, 60 * 72 + 120);
    expect(await statusOf(id)).toBe("requested");
    expect(await eventsOf(id)).toEqual(["requested"]);
  });

  it("isn't instant while something is left to check, or when switched off", async () => {
    await db
      .getDb()
      .update(s.rentalRequirements)
      .set({ checkoutFirstRental: true })
      .where(eq(s.rentalRequirements.aircraftId, planeId));
    expect(await statusOf(await request(PIL, 60 * 96, 60 * 96 + 120))).toBe("requested");
    await db
      .getDb()
      .update(s.rentalRequirements)
      .set({ checkoutFirstRental: false, instantBooking: false })
      .where(eq(s.rentalRequirements.aircraftId, planeId));
    expect(await statusOf(await request(PIL, 60 * 120, 60 * 120 + 120))).toBe("requested");
  });

  it("needs the owner to have a paid plan (SUB-10)", async () => {
    await db
      .getDb()
      .update(s.rentalRequirements)
      .set({ instantBooking: true })
      .where(eq(s.rentalRequirements.aircraftId, planeId));
    // Listing made the owner a founding owner during the beta: take both away.
    await db.getDb().update(s.billingSettings).set({ beta: false });
    await db.getDb().update(s.planGrants).set({ revokedAt: new Date() });
    expect(await statusOf(await request(PIL, 60 * 144, 60 * 144 + 120))).toBe("requested");
    // Pilot Plus is not an owner plan.
    await db.getDb().insert(s.planGrants).values({ userId: OWN, plan: "pilot", reason: "admin" });
    expect(await statusOf(await request(PIL, 60 * 150, 60 * 150 + 120))).toBe("requested");
    await db.getDb().update(s.planGrants).set({ revokedAt: null });
    expect(await statusOf(await request(PIL, 60 * 168, 60 * 168 + 120))).toBe("accepted");
  });
});
