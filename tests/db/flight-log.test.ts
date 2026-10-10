import { eq, sql } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";

import { describeDb, forceListed, prepareDatabase } from "./setup";

let db: typeof import("@/lib/db");
let rls: typeof import("@/lib/db/rls");
let s: typeof import("@/lib/db/schema");

const OWN = "44dd44dd-4444-4444-8444-dddddddddddd"; // owner
const PIL = "55ee55ee-5555-4555-8555-eeeeeeeeeeee"; // pilot
const OTH = "66ff66ff-6666-4666-8666-ffffffffffff"; // someone else
let bookingId: string;
let logId: string;

async function call<T>(user: string, query: ReturnType<typeof sql>) {
  try {
    const rows = (await rls.asUser(user, (tx) => tx.execute(query))) as unknown as T[];
    return rows[0];
  } catch (e) {
    const err = e as { cause?: { code?: string; message?: string } };
    return { error: err.cause?.code === "P0001" ? err.cause.message : err.cause?.code };
  }
}

const at = (minutes: number) => new Date(Date.now() + minutes * 60_000);

describeDb("flight log", () => {
  beforeAll(async () => {
    await prepareDatabase();
    db = await import("@/lib/db");
    rls = await import("@/lib/db/rls");
    s = await import("@/lib/db/schema");
    const owner = db.getDb();
    await owner.insert(s.users).values([
      { id: OWN, name: "Own", email: "own@example.com" },
      { id: PIL, name: "Pil", email: "pil@example.com" },
      { id: OTH, name: "Oth", email: "oth@example.com" },
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
        registration: "LZ-LOG",
        manufacturer: "Cessna",
        model: "172",
        typeDesignator: "C172",
        seats: 4,
        fuelType: "avgas_100ll",
        homeAirportIdent: "LBSF",
        pricePerHour: 180,
        nightVfr: true, // the test runs at any time of day
      })
      .returning();
    await forceListed(plane!.id);
    await owner.insert(s.pilotLicences).values({
      userId: PIL,
      type: "ppl_a",
      issuingState: "BG",
      number: "1",
      status: "verified",
    });
    await owner.insert(s.medicals).values({
      userId: PIL,
      class: "class2",
      issuingState: "BG",
      validUntil: "2099-01-01",
      status: "verified",
    });
    await owner.insert(s.pilotRatings).values([
      { userId: PIL, kind: "class", code: "SEP_LAND", status: "verified" },
      { userId: PIL, kind: "privilege", code: "NIGHT", status: "verified" },
    ]);
    const period = `[${at(60).toISOString()},${at(240).toISOString()})`;
    const [row] = (await rls.asUser(PIL, (tx) =>
      tx.execute(sql`select public.request_booking(${plane!.id}::uuid, ${period}::tstzrange,
        'LBSF', 'LBSF', '{}'::text[], 'local', 0, 1.5, null, 270) as id`),
    )) as unknown as { id: string }[];
    bookingId = row!.id;
  }, 60_000);

  it("starts at check-out, only for the pilot of an accepted booking", async () => {
    expect(await call(PIL, sql`select public.start_flight_log(${bookingId}::uuid) as id`)).toEqual({
      error: "not_accepted",
    });
    await rls.asUser(OWN, (tx) =>
      tx.execute(sql`select public.respond_to_booking(${bookingId}::uuid, 'accept')`),
    );
    expect(await call(OTH, sql`select public.start_flight_log(${bookingId}::uuid) as id`)).toEqual({
      error: "not_found",
    });
    const started = await call<{ id: string }>(
      PIL,
      sql`select public.start_flight_log(${bookingId}::uuid) as id`,
    );
    logId = (started as { id: string }).id;
    const [booking] = await db
      .getDb()
      .select()
      .from(s.bookings)
      .where(eq(s.bookings.id, bookingId));
    expect(booking!.status).toBe("in_progress");
  });

  it("lets only the pilot fill it in, and hides it from others", async () => {
    const updated = await rls.asUser(PIL, (tx) =>
      tx
        .update(s.flightLogs)
        .set({ hobbsStart: 1234.5, fuelStartL: 120 })
        .where(eq(s.flightLogs.id, logId))
        .returning(),
    );
    expect(updated).toHaveLength(1);
    const byOwner = await rls.asUser(OWN, (tx) =>
      tx.update(s.flightLogs).set({ hobbsStart: 1 }).where(eq(s.flightLogs.id, logId)).returning(),
    );
    expect(byOwner).toEqual([]);
    expect(await rls.asUser(OWN, (tx) => tx.select().from(s.flightLogs))).toHaveLength(1);
    expect(await rls.asUser(OTH, (tx) => tx.select().from(s.flightLogs))).toEqual([]);
  });

  const leg = (overrides: Partial<typeof s.flightLegs.$inferInsert> = {}) => ({
    flightLogId: logId,
    seq: 1,
    fromIdent: "LBSF",
    toIdent: "LBSF",
    engineStart: at(70),
    blockOff: at(75),
    takeoffAt: at(80),
    landingAt: at(135),
    blockOn: at(140),
    engineStop: at(145),
    hobbsStart: 1234.5,
    hobbsEnd: 1235.6,
    ...overrides,
  });

  it("refuses times out of order, meters not moving on, fuel going up during a leg", async () => {
    const code = (p: Promise<unknown>) =>
      p.then(
        () => undefined,
        (e: { cause?: { code?: string } }) => e.cause?.code,
      );
    const refused = async (overrides: Parameters<typeof leg>[0]) =>
      expect(
        await code(rls.asUser(PIL, (tx) => tx.insert(s.flightLegs).values(leg(overrides)))),
      ).toBe("23514");
    await refused({ engineStart: at(76) }); // after block off
    await refused({ takeoffAt: at(75) }); // take-off = block off
    await refused({ landingAt: at(80) }); // landing = take-off
    await refused({ blockOn: at(135) }); // block on = landing
    await refused({ engineStop: at(139) }); // before block on
    await refused({ engineStop: at(70 + 12 * 60 + 1) }); // longer than 12 h
    await refused({ hobbsEnd: 1200 });
    await refused({ hobbsEnd: 1234.5 }); // the meter must move on
    await refused({ fuelBeforeL: 100, fuelAfterL: 100 });
    await refused({ oilBeforeL: 6, oilAfterL: 6.5 });
    expect(await code(rls.asUser(OWN, (tx) => tx.insert(s.flightLegs).values(leg())))).toBe(
      "42501",
    );
  });

  it("lets the pilot record fuel and oil with their own receipts, visible to the owner", async () => {
    const owner = db.getDb();
    const doc = (userId: string, name: string) =>
      owner
        .insert(s.documents)
        .values({
          ownerId: userId,
          storageKey: `documents/${userId}/${name}`,
          filename: name,
          contentType: "image/jpeg",
          sizeBytes: 10,
        })
        .returning()
        .then((r) => r[0]!.id);
    const receipt = await doc(PIL, "receipt.jpg");
    const photo = await doc(PIL, "meters.jpg");
    const privateDoc = await doc(PIL, "licence.jpg");
    const ownersDoc = await doc(OWN, "owner.jpg");
    const uplift = (overrides: Partial<typeof s.flightUplifts.$inferInsert> = {}) => ({
      flightLogId: logId,
      kind: "fuel" as const,
      airportIdent: "LBSF",
      quantityL: 60,
      fuelType: "avgas_100ll" as const,
      price: 150,
      paidBy: "pilot" as const,
      ...overrides,
    });
    const code = (p: Promise<unknown>) =>
      p.then(
        () => undefined,
        (e: { cause?: { code?: string } }) => e.cause?.code,
      );

    await rls.asUser(PIL, (tx) =>
      tx.update(s.flightLogs).set({ checkoutPhotoId: photo }).where(eq(s.flightLogs.id, logId)),
    );
    await rls.asUser(PIL, (tx) =>
      tx.insert(s.flightUplifts).values(uplift({ receiptId: receipt })),
    );
    // Someone else's document can't be attached; the owner can't add entries.
    expect(
      await code(
        rls.asUser(PIL, (tx) =>
          tx.insert(s.flightUplifts).values(uplift({ receiptId: ownersDoc })),
        ),
      ),
    ).toBe("42501");
    expect(await code(rls.asUser(OWN, (tx) => tx.insert(s.flightUplifts).values(uplift())))).toBe(
      "42501",
    );
    // Oil can't have a fuel type.
    expect(
      await code(
        rls.asUser(PIL, (tx) => tx.insert(s.flightUplifts).values(uplift({ kind: "oil" }))),
      ),
    ).toBe("23514");

    expect(await rls.asUser(OWN, (tx) => tx.select().from(s.flightUplifts))).toHaveLength(1);
    expect(await rls.asUser(OTH, (tx) => tx.select().from(s.flightUplifts))).toEqual([]);
    const visible = (user: string) =>
      rls
        .asUser(user, (tx) => tx.select({ id: s.documents.id }).from(s.documents))
        .then((rows) => rows.map((r) => r.id).sort());
    // The owner sees the pilot's receipt and meter photo, never their other documents.
    expect(await visible(OWN)).toEqual([receipt, photo, ownersDoc].sort());
    expect(await visible(OTH)).toEqual([]);
    expect(await visible(PIL)).toContain(privateDoc);
  });

  it("goes from draft to submitted to correction and back, then confirmed", async () => {
    expect(await call(PIL, sql`select public.submit_flight_log(${logId}::uuid)`)).toEqual({
      error: "no_legs",
    });
    await rls.asUser(PIL, (tx) => tx.insert(s.flightLegs).values(leg()));
    await call(PIL, sql`select public.submit_flight_log(${logId}::uuid)`);
    // Submitted: the pilot can't change it any more.
    const changed = await rls.asUser(PIL, (tx) =>
      tx
        .update(s.flightLegs)
        .set({ landings: 3 })
        .where(eq(s.flightLegs.flightLogId, logId))
        .returning(),
    );
    expect(changed).toEqual([]);
    expect(
      await rls
        .asUser(PIL, (tx) =>
          tx.insert(s.flightUplifts).values({
            flightLogId: logId,
            kind: "oil",
            airportIdent: "LBSF",
            quantityL: 1,
            paidBy: "pilot",
          }),
        )
        .then(
          () => "inserted",
          (e: { cause?: { code?: string } }) => e.cause?.code,
        ),
    ).toBe("42501");

    expect(
      await call(PIL, sql`select public.request_log_correction(${logId}::uuid, 'Hobbs end?')`),
    ).toEqual({ error: "not_found" });
    await call(OWN, sql`select public.request_log_correction(${logId}::uuid, 'Hobbs end?')`);
    const fixed = await rls.asUser(PIL, (tx) =>
      tx
        .update(s.flightLegs)
        .set({ hobbsEnd: 1235.8 })
        .where(eq(s.flightLegs.flightLogId, logId))
        .returning(),
    );
    expect(fixed).toHaveLength(1);
    await call(PIL, sql`select public.submit_flight_log(${logId}::uuid)`);

    await call(OWN, sql`select public.confirm_flight_log(${logId}::uuid, 78, 234, 0)`);
    const [log] = await db.getDb().select().from(s.flightLogs).where(eq(s.flightLogs.id, logId));
    expect(log).toMatchObject({ status: "confirmed", flownMinutes: 78, amountDue: 234 });
    const [booking] = await db
      .getDb()
      .select()
      .from(s.bookings)
      .where(eq(s.bookings.id, bookingId));
    expect(booking!.status).toBe("completed");
    const events = await rls.asUser(PIL, (tx) =>
      tx.select().from(s.bookingEvents).where(eq(s.bookingEvents.bookingId, bookingId)),
    );
    expect(events.map((e) => e.type)).toEqual([
      "requested",
      "accepted",
      "checked_out",
      "log_submitted",
      "log_correction",
      "log_submitted",
      "log_confirmed",
    ]);
  });

  it("lets only the owner record meter readings and explain a gap before a rental", async () => {
    const [b] = await db.getDb().select().from(s.bookings).where(eq(s.bookings.id, bookingId));
    const aircraftId = b!.aircraftId;
    const code = (p: Promise<unknown>) =>
      p.then(
        () => undefined,
        (e: { cause?: { code?: string; message?: string } }) =>
          e.cause?.code === "P0001" ? e.cause.message : e.cause?.code,
      );
    const record = (user: string, values: Partial<typeof s.meterReadings.$inferInsert>) =>
      rls.asUser(user, (tx) =>
        tx
          .insert(s.meterReadings)
          .values({ aircraftId, hobbs: 1236, ...values })
          .returning(),
      );
    const [mine] = await record(OWN, { note: "Club flight" });
    expect(mine).toMatchObject({ createdBy: OWN, hobbs: 1236 });
    expect(await code(record(PIL, {}))).toBe("42501");
    expect(await code(record(OTH, {}))).toBe("42501");
    expect(await code(record(OWN, { readAt: at(60) }))).toBe("reading_in_future");
    expect(await code(record(OWN, { hobbs: null, tach: null }))).toBe("23514");
    for (const user of [PIL, OTH]) {
      expect(await rls.asUser(user, (tx) => tx.select().from(s.meterReadings))).toEqual([]);
    }
    expect(await rls.asAnon((tx) => tx.select().from(s.meterReadings))).toEqual([]);

    // Only the booking's owner explains a gap.
    expect(
      await call(PIL, sql`select public.explain_meter_gap(${logId}::uuid, 'outside')`),
    ).toEqual({ error: "not_found" });
    await call(OWN, sql`select public.explain_meter_gap(${logId}::uuid, 'outside')`);
    const [log] = await db.getDb().select().from(s.flightLogs).where(eq(s.flightLogs.id, logId));
    expect(log!.meterGapReason).toBe("outside");
  });

  it("compares a rental's start readings with the previous rental's end", async () => {
    const { getMeterCheck } = await import("@/lib/bookings/meter-gap");
    const owner = db.getDb();
    const [b] = await owner.select().from(s.bookings).where(eq(s.bookings.id, bookingId));
    // A later rental of the same aircraft, checked out after the first one's check-in.
    const [next] = await owner
      .insert(s.bookings)
      .values({
        ...b!,
        id: undefined,
        status: "in_progress",
        period: `[${at(600).toISOString()},${at(700).toISOString()})`,
      })
      .returning();
    const [nextLog] = await owner
      .insert(s.flightLogs)
      .values({ bookingId: next!.id, hobbsStart: 1236.4, checkedOutAt: at(590) })
      .returning();

    // The first rental ended at 1235.8 h: +0.6 h in between, shown to the owner only.
    const forOwner = await getMeterCheck(nextLog!, b!.aircraftId, "owner");
    expect(forOwner.findings).toMatchObject([{ meter: "hobbs", type: "gap", diff: 0.6 }]);
    expect(forOwner.between).toEqual([]);
    expect((await getMeterCheck(nextLog!, b!.aircraftId, "pilot")).findings).toEqual([]);

    // A start below the last reading is a typo the pilot sees too.
    const below = { ...nextLog!, hobbsStart: 1230 };
    expect((await getMeterCheck(below, b!.aircraftId, "pilot")).findings).toMatchObject([
      { type: "below", known: 1235.8 },
    ]);
  });

  it("asks the pilot to confirm the 90-day rule at check-out when carrying passengers", async () => {
    const owner = db.getDb();
    const [plane] = await owner
      .insert(s.aircraft)
      .values({
        ownerId: OWN,
        registration: "LZ-PAX",
        manufacturer: "Piper",
        model: "PA-28",
        typeDesignator: "P28A",
        seats: 4,
        fuelType: "avgas_100ll",
      })
      .returning();
    const [b] = await owner
      .insert(s.bookings)
      .values({
        aircraftId: plane!.id,
        pilotId: PIL,
        ownerId: OWN,
        status: "accepted",
        period: `[${at(30).toISOString()},${at(90).toISOString()})`,
        departureIdent: "LBSF",
        arrivalIdent: "LBSF",
        purpose: "local",
        passengers: 2,
        plannedHours: 1,
        pricePerHour: 150,
        currency: "EUR",
        priceBasis: "wet",
        timeBasis: "hobbs",
        estimate: 150,
        expiresAt: at(20),
      })
      .returning();
    expect(await call(PIL, sql`select public.start_flight_log(${b!.id}::uuid) as id`)).toEqual({
      error: "passenger_recency",
    });
    const started = (await call<{ id: string }>(
      PIL,
      sql`select public.start_flight_log(${b!.id}::uuid, true) as id`,
    )) as { id: string };
    const [log] = await owner.select().from(s.flightLogs).where(eq(s.flightLogs.id, started.id));
    expect(log!.recencyConfirmedAt).toBeInstanceOf(Date);
  });
});
