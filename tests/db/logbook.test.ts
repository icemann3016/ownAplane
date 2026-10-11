import { eq, sql } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";

import { describeDb, prepareDatabase } from "./setup";

// The pilot's EASA logbook (LOG-1…4): private to the pilot, drafts change freely, certified
// entries never change; corrections supersede; rentals arrive as drafts.

let db: typeof import("@/lib/db");
let rls: typeof import("@/lib/db/rls");
let s: typeof import("@/lib/db/schema");
let ops: typeof import("@/lib/logbook/ops");
let entries: typeof import("@/lib/logbook/entries");

const PILOT = "a1a1a1a1-1111-4111-8111-1111111111aa";
const OTHER = "b2b2b2b2-2222-4222-8222-2222222222bb";
const ADMIN = "c3c3c3c3-3333-4333-8333-3333333333cc";
const OWNER = "d4d4d4d4-4444-4444-8444-4444444444dd";

const flight = {
  kind: "flight" as const,
  date: "2026-05-01",
  departurePlace: "LBSF",
  departureTime: "08:00",
  arrivalPlace: "LBPD",
  arrivalTime: "09:10",
  aircraftType: "C172S",
  registration: "LZ-ABC",
  seMinutes: 70,
  meMinutes: null,
  mpMinutes: null,
  totalMinutes: 70,
  picName: "SELF",
  landingsDay: 1,
  landingsNight: 0,
  nightMinutes: null,
  ifrMinutes: null,
  picMinutes: 70,
  copilotMinutes: null,
  dualMinutes: null,
  instructorMinutes: null,
  fstdType: null,
  fstdMinutes: null,
  remarks: null,
};

async function code(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (e) {
    const err = e as { cause?: { code?: string; message?: string } };
    return err.cause?.code === "P0001" ? err.cause.message : err.cause?.code;
  }
}

describeDb("pilot logbook (LOG-1…4)", () => {
  beforeAll(async () => {
    await prepareDatabase();
    db = await import("@/lib/db");
    rls = await import("@/lib/db/rls");
    s = await import("@/lib/db/schema");
    ops = await import("@/lib/logbook/ops");
    entries = await import("@/lib/logbook/entries");
    await db
      .getDb()
      .insert(s.users)
      .values([
        { id: PILOT, name: "Pilot", email: "lb-pilot@example.com" },
        { id: OTHER, name: "Other", email: "lb-other@example.com" },
        { id: ADMIN, name: "Admin", email: "lb-admin@example.com" },
        { id: OWNER, name: "Owner", email: "lb-owner@example.com" },
      ]);
    await db.getDb().insert(s.userRoles).values({ userId: ADMIN, role: "admin" });
  }, 60_000);

  let certifiedId: string;

  it("keeps drafts to the pilot (admins may read), changeable until certified", async () => {
    const created = await ops.createEntry(PILOT, flight);
    expect(created.ok).toBe(true);
    const id = (created as { id: string }).id;
    const read = (user: string) =>
      rls.asUser(user, (tx) =>
        tx.select().from(s.logbookEntries).where(eq(s.logbookEntries.id, id)),
      );
    expect(await read(OTHER)).toHaveLength(0);
    expect(await read(ADMIN)).toHaveLength(1);
    expect(await ops.updateEntry(OTHER, id, { ...flight, remarks: "mine" })).toEqual({
      ok: false,
      error: "not_editable",
    });
    expect(await ops.updateEntry(PILOT, id, { ...flight, remarks: "Nice day" })).toEqual({
      ok: true,
    });
    expect((await ops.certifyEntries(PILOT, [id])).ok).toBe(true);
    certifiedId = id;
    const [row] = await read(PILOT);
    expect(row).toMatchObject({ status: "certified", remarks: "Nice day" });
    expect(row!.certifiedAt).not.toBeNull();
  });

  it("never changes or deletes a certified entry", async () => {
    expect(await ops.updateEntry(PILOT, certifiedId, flight)).toEqual({
      ok: false,
      error: "not_editable",
    });
    expect(await ops.deleteEntry(PILOT, certifiedId)).toEqual({ ok: false, error: "not_editable" });
    // Even straight SQL as the app is refused by the guard.
    expect(
      await code(
        rls.asUser(PILOT, (tx) =>
          tx.execute(
            sql`update public.logbook_entries set remarks = 'x' where id = ${certifiedId}`,
          ),
        ),
      ),
    ).toBeUndefined(); // the policy hides certified rows from updates: nothing changes
    const [row] = await db
      .getDb()
      .select()
      .from(s.logbookEntries)
      .where(eq(s.logbookEntries.id, certifiedId));
    expect(row!.remarks).toBe("Nice day");
    // The app can't create certified or ownAplane entries itself.
    expect(
      await code(
        rls.asUser(PILOT, (tx) =>
          tx.insert(s.logbookEntries).values({ ...flight, pilotId: PILOT, status: "certified" }),
        ),
      ),
    ).toBe("42501");
    expect(
      await code(
        rls.asUser(PILOT, (tx) =>
          tx.insert(s.logbookEntries).values({ ...flight, pilotId: PILOT, source: "ownaplane" }),
        ),
      ),
    ).toBe("42501");
  });

  it("supersedes a certified entry with its certified correction", async () => {
    const correction = await ops.createEntry(PILOT, { ...flight, totalMinutes: 75 }, certifiedId);
    expect(correction.ok).toBe(true);
    const newId = (correction as { id: string }).id;
    expect(await ops.createEntry(OTHER, flight, certifiedId)).toEqual({
      ok: false,
      error: "bad_correction",
    });
    expect((await ops.certifyEntries(PILOT, [newId])).ok).toBe(true);
    const detail = await entries.getEntry(PILOT, certifiedId);
    expect(detail!.entry.status).toBe("superseded");
    expect(detail!.correctedBy.map((e) => e.id)).toEqual([newId]);
    expect((await entries.getEntry(PILOT, newId))!.history.map((e) => e.id)).toEqual([certifiedId]);
    expect(await ops.createEntry(PILOT, flight, certifiedId)).toEqual({
      ok: false,
      error: "bad_correction",
    });
  });

  it("refuses incomplete or future entries and strikes through with a reason", async () => {
    const incomplete = await ops.createEntry(PILOT, { ...flight, registration: null });
    const id = (incomplete as { id: string }).id;
    expect(await ops.certifyEntries(PILOT, [id])).toEqual({
      ok: false,
      error: "incomplete",
      incomplete: [id],
    });
    expect(
      await code(
        rls.asUser(PILOT, (tx) =>
          tx.execute(sql`select public.certify_logbook_entries(array[${id}]::uuid[])`),
        ),
      ),
    ).toBe("incomplete");
    await ops.updateEntry(PILOT, id, { ...flight, date: "2099-01-01" });
    expect(await ops.certifyEntries(PILOT, [id])).toEqual({ ok: false, error: "date_in_future" });
    expect(await ops.deleteEntry(PILOT, id)).toEqual({ ok: true });

    const twice = (await ops.createEntry(PILOT, { ...flight, date: "2026-05-02" })) as {
      id: string;
    };
    await ops.certifyEntries(PILOT, [twice.id]);
    expect(await ops.voidEntry(PILOT, twice.id, " ")).toEqual({
      ok: false,
      error: "reason_required",
    });
    expect(await ops.voidEntry(OTHER, twice.id, "Not mine")).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await ops.voidEntry(PILOT, twice.id, "Entered twice")).toEqual({ ok: true });
    expect((await entries.getEntry(PILOT, twice.id))!.entry).toMatchObject({
      status: "superseded",
      voidReason: "Entered twice",
    });
  });

  it("totals only certified entries, with brought-forward totals", async () => {
    const bf = (await ops.createEntry(PILOT, {
      ...flight,
      kind: "brought_forward",
      date: "2025-12-31",
      departurePlace: null,
      arrivalPlace: null,
      totalMinutes: 6000,
      picMinutes: 5000,
      landingsDay: 400,
    })) as { id: string };
    await ops.certifyEntries(PILOT, [bf.id]);
    await ops.createEntry(PILOT, { ...flight, date: "2026-05-03" }); // draft: not counted
    const totals = await entries.getTotals(PILOT);
    expect(totals.all).toMatchObject({ totalMinutes: 6075, picMinutes: 5070, landingsDay: 401 });
    expect(totals.byType).toEqual([{ aircraftType: "C172S", minutes: 75 }]);
  });

  it("adds the legs of a confirmed ownAplane flight log as drafts, once", async () => {
    const owner = db.getDb();
    await owner.insert(s.airports).values([
      {
        ident: "LBSF",
        icaoCode: "LBSF",
        type: "large_airport",
        name: "Sofia",
        country: "BG",
        latitude: 42.69,
        longitude: 23.41,
        timezone: "Europe/Sofia",
      },
      {
        ident: "BG-0004",
        type: "small_airport",
        name: "Field",
        country: "BG",
        latitude: 42.5,
        longitude: 23.2,
        timezone: "Europe/Sofia",
      },
    ]);
    await owner
      .update(s.profiles)
      .set({ displayName: "Petar Pilot" })
      .where(eq(s.profiles.id, PILOT));
    const [plane] = await owner
      .insert(s.aircraft)
      .values({
        ownerId: OWNER,
        registration: "LZ-LBK",
        manufacturer: "Cessna",
        model: "172S",
        typeDesignator: "C172",
        seats: 4,
        fuelType: "avgas_100ll",
      })
      .returning();
    const [booking] = await owner
      .insert(s.bookings)
      .values({
        aircraftId: plane!.id,
        pilotId: PILOT,
        ownerId: OWNER,
        status: "in_progress",
        period: "[2026-06-01T07:00:00Z,2026-06-01T12:00:00Z)",
        departureIdent: "LBSF",
        arrivalIdent: "LBSF",
        purpose: "local",
        plannedHours: 2,
        pricePerHour: 180,
        currency: "EUR",
        priceBasis: "wet",
        timeBasis: "hobbs",
        estimate: 360,
        expiresAt: new Date("2026-05-31T00:00:00Z"),
      })
      .returning();
    const [log] = await owner
      .insert(s.flightLogs)
      .values({ bookingId: booking!.id, status: "submitted" })
      .returning();
    const t = (h: number, m: number) => new Date(Date.UTC(2026, 5, 1, h, m));
    await owner.insert(s.flightLegs).values([
      {
        flightLogId: log!.id,
        seq: 1,
        fromIdent: "LBSF",
        toIdent: "BG-0004",
        engineStart: t(8, 0),
        blockOff: t(8, 5),
        blockOn: t(8, 50),
        engineStop: t(8, 52),
        landings: 1,
      },
      {
        flightLogId: log!.id,
        seq: 2,
        fromIdent: "BG-0004",
        toIdent: "LBSF",
        engineStart: t(9, 30),
        blockOff: t(9, 32),
        blockOn: t(10, 20),
        engineStop: t(10, 22),
        landings: 3,
      },
    ]);
    const confirm = () =>
      owner.update(s.flightLogs).set({ status: "confirmed" }).where(eq(s.flightLogs.id, log!.id));
    await confirm();
    const rows = await rls.asUser(PILOT, (tx) =>
      tx.select().from(s.logbookEntries).where(eq(s.logbookEntries.source, "ownaplane")),
    );
    const byPlace = rows.sort((a, b) => (a.departureTime! < b.departureTime! ? -1 : 1));
    expect(
      byPlace.map((r) => [
        r.departurePlace,
        r.departureTime,
        r.arrivalPlace,
        r.arrivalTime,
        r.totalMinutes,
        r.landingsDay,
      ]),
    ).toEqual([
      ["LBSF", "08:05:00", "BG-0004", "08:50:00", 45, 1],
      ["BG-0004", "09:32:00", "LBSF", "10:20:00", 48, 3],
    ]);
    expect(byPlace[0]).toMatchObject({
      status: "draft",
      kind: "flight",
      date: "2026-06-01",
      aircraftType: "Cessna 172S",
      registration: "LZ-LBK",
      picName: "Petar Pilot",
      picMinutes: 45,
      seMinutes: 45,
    });
    await owner
      .update(s.flightLogs)
      .set({ status: "submitted" })
      .where(eq(s.flightLogs.id, log!.id));
    await confirm();
    const again = await rls.asUser(PILOT, (tx) =>
      tx.select().from(s.logbookEntries).where(eq(s.logbookEntries.source, "ownaplane")),
    );
    expect(again).toHaveLength(2);
  });
});
