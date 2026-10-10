import { eq, sql } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";

import { describeDb, forceListed, prepareDatabase } from "./setup";

let db: typeof import("@/lib/db");
let rls: typeof import("@/lib/db/rls");
let s: typeof import("@/lib/db/schema");

const OLA = "5e5e5e5e-8888-4888-8888-888888888888"; // owner
const PAT = "6f6f6f6f-9999-4999-8999-999999999999"; // pilot
const QUI = "7a7a7a7a-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // someone else
let aircraftId: string;

const inDays = (days: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const periodIn = (days: number) => `[${inDays(days)}T08:00:00Z,${inDays(days)}T12:00:00Z)`;

type Failure = { requirement: string; blocking: boolean; need: string | null; have: string | null };

/** The pilot's own eligibility result (as the app asks for it). */
async function mine(user: string | null, period: string | null = null): Promise<Failure[]> {
  const query = (tx: import("@/lib/db").Tx) =>
    tx.execute(
      sql`select * from public.my_eligibility(${aircraftId}::uuid, ${period}::tstzrange)`,
    ) as unknown as Promise<Failure[]>;
  return user ? rls.asUser(user, query) : rls.asAnon(query);
}
const codes = async (user: string, period: string | null = null) =>
  (await mine(user, period)).map((f) => f.requirement);

async function setRequirements(values: Partial<typeof s.rentalRequirements.$inferInsert>) {
  await db
    .getDb()
    .insert(s.rentalRequirements)
    .values({ aircraftId, ...values })
    .onConflictDoUpdate({ target: s.rentalRequirements.aircraftId, set: values });
}

describeDb("eligibility check", () => {
  beforeAll(async () => {
    await prepareDatabase();
    db = await import("@/lib/db");
    rls = await import("@/lib/db/rls");
    s = await import("@/lib/db/schema");
    const owner = db.getDb();
    await owner.insert(s.users).values([
      { id: OLA, name: "Ola", email: "ola@example.com" },
      { id: PAT, name: "Pat", email: "pat@example.com" },
      { id: QUI, name: "Qui", email: "qui@example.com" },
    ]);
    const [plane] = await owner
      .insert(s.aircraft)
      .values({
        ownerId: OLA,
        registration: "LZ-OLA",
        manufacturer: "Diamond",
        model: "DA40 NG",
        typeDesignator: "DA40",
        seats: 4,
        fuelType: "jet_a1",
      })
      .returning();
    aircraftId = plane!.id;
    await forceListed(aircraftId);
  }, 60_000);

  it("needs a verified licence, medical and class rating", async () => {
    expect(await codes(PAT)).toEqual(["licence", "medical", "class_rating"]);
    // Pending items don't count.
    await db.getDb().insert(s.pilotLicences).values({
      userId: PAT,
      type: "ppl_a",
      issuingState: "BG",
      number: "BG.1",
      status: "pending",
    });
    expect(await codes(PAT)).toContain("licence");

    await db.getDb().update(s.pilotLicences).set({ status: "verified" });
    await db
      .getDb()
      .insert(s.medicals)
      .values({
        userId: PAT,
        class: "class2",
        issuingState: "BG",
        validUntil: inDays(30),
        status: "verified",
      });
    await db.getDb().insert(s.pilotRatings).values({
      userId: PAT,
      kind: "class",
      code: "SEP_LAND",
      status: "verified",
    });
    expect(await mine(PAT)).toEqual([]);
  });

  it("checks that credentials are still valid at the end of the rental", async () => {
    expect(await codes(PAT, periodIn(10))).toEqual([]);
    expect(await codes(PAT, periodIn(40))).toEqual(["medical"]);
  });

  it("applies the LAPL(A) limits: 2,000 kg MTOM and 3 passengers (FCL.105.A)", async () => {
    const owner = db.getDb();
    const plane = (values: Partial<typeof s.aircraft.$inferInsert>) =>
      owner.update(s.aircraft).set(values).where(eq(s.aircraft.id, aircraftId));
    // Editing a verified licence sends it back to pending; the admin verifies it again.
    const licence = eq(s.pilotLicences.userId, PAT);
    await owner.update(s.pilotLicences).set({ type: "lapl_a" }).where(licence);
    await owner.update(s.pilotLicences).set({ status: "verified" }).where(licence);
    await plane({ mtomKg: 2100 });
    expect(await mine(PAT)).toEqual([
      { requirement: "lapl_mtom", blocking: true, need: "2000", have: "2100" },
    ]);
    await plane({ mtomKg: 1310, seats: 5 });
    expect(await mine(PAT)).toEqual([
      { requirement: "lapl_passengers", blocking: false, need: "3", have: null },
    ]);

    // Bookings refuse a fourth passenger for a LAPL holder.
    await owner
      .insert(s.airports)
      .values({
        ident: "LBSF",
        type: "large_airport",
        name: "Sofia",
        country: "BG",
        latitude: 42.6952,
        longitude: 23.4062,
        timezone: "Europe/Sofia",
      })
      .onConflictDoNothing();
    const book = (passengers: number) =>
      owner
        .insert(s.bookings)
        .values({
          aircraftId,
          pilotId: PAT,
          ownerId: OLA,
          status: "requested",
          period: periodIn(20 + passengers),
          departureIdent: "LBSF",
          arrivalIdent: "LBSF",
          purpose: "local",
          passengers,
          plannedHours: 2,
          pricePerHour: 150,
          currency: "EUR",
          priceBasis: "wet",
          timeBasis: "hobbs",
          estimate: 300,
          expiresAt: new Date(Date.now() + 86_400_000),
        })
        .then(
          () => "booked",
          (e: { cause?: { message?: string } }) => e.cause?.message,
        );
    expect(await book(4)).toBe("lapl_passengers");
    expect(await book(3)).toBe("booked");

    // A PPL lifts the limits.
    await owner.insert(s.pilotLicences).values({
      userId: PAT,
      type: "ppl_a",
      issuingState: "BG",
      number: "BG.2",
      status: "verified",
    });
    expect(await mine(PAT)).toEqual([]);
    expect(await book(4)).toBe("booked");
    await owner.delete(s.bookings).where(eq(s.bookings.aircraftId, aircraftId));
    await owner.delete(s.pilotLicences).where(eq(s.pilotLicences.type, "lapl_a"));
    await plane({ mtomKg: null, seats: 4 });
  });

  it("checks the owner's licence types and ratings", async () => {
    await setRequirements({
      licenceTypes: ["lapl_a", "cpl_a"],
      requiredRatings: ["NIGHT", "C510"],
    });
    expect(await mine(PAT)).toEqual([
      { requirement: "licence_type", blocking: true, need: "lapl_a,cpl_a", have: null },
      { requirement: "rating", blocking: true, need: "NIGHT", have: null },
      { requirement: "rating", blocking: true, need: "C510", have: null },
    ]);
    await setRequirements({ licenceTypes: ["ppl_a"], requiredRatings: [] });
    expect(await mine(PAT)).toEqual([]);
  });

  it("compares declared hours with the minimums", async () => {
    await setRequirements({ minTotalHours: 100, minTypeHours: 10, min90DaysHours: 3 });
    await db
      .getDb()
      .insert(s.pilotExperience)
      .values({ userId: PAT, totalHours: 50, picHours: 40, last90DaysHours: 5 });
    await db
      .getDb()
      .insert(s.experienceByType)
      .values({ userId: PAT, aircraftType: "DA40", hours: 4 });
    expect(await mine(PAT)).toEqual([
      { requirement: "total_hours", blocking: true, need: "100.0", have: "50.0" },
      { requirement: "type_hours", blocking: true, need: "10.0", have: "4.0" },
    ]);
    await setRequirements({ minTotalHours: null, minTypeHours: null, min90DaysHours: null });
  });

  it("checks the minimum age on the day of the rental", async () => {
    await setRequirements({ minAge: 21 });
    expect(await mine(PAT)).toMatchObject([{ requirement: "age_unknown", need: "21" }]);
    await db
      .getDb()
      .update(s.pilotExperience)
      .set({ birthDate: `${new Date().getUTCFullYear() - 19}-01-01` })
      .where(eq(s.pilotExperience.userId, PAT));
    expect(await mine(PAT)).toMatchObject([{ requirement: "age", need: "21", have: "19" }]);
    await setRequirements({ minAge: 18 });
    expect(await mine(PAT)).toEqual([]);
  });

  it("handles pilots without reviews and the minimum pilot rating", async () => {
    await setRequirements({ allowUnrated: true, unratedNeedsCheckout: true });
    expect(await mine(PAT)).toEqual([
      { requirement: "checkout", blocking: false, need: null, have: null },
    ]);
    const meets = await rls.asUser(
      PAT,
      (tx) =>
        tx.execute(
          sql`select public.i_meet_requirements(${aircraftId}::uuid) as ok`,
        ) as unknown as Promise<{ ok: boolean }[]>,
    );
    expect(meets[0]!.ok).toBe(true); // a checkout is a condition, not a refusal

    await setRequirements({ allowUnrated: false, unratedNeedsCheckout: false, minPilotRating: 4 });
    expect(await codes(PAT)).toEqual(["unrated"]);
    await db
      .getDb()
      .update(s.profiles)
      .set({ ratingAvg: 3.5, ratingCount: 2 })
      .where(eq(s.profiles.id, PAT));
    expect(await mine(PAT)).toMatchObject([
      { requirement: "pilot_rating", need: "4.0", have: "3.50" },
    ]);
    await db.getDb().update(s.profiles).set({ ratingAvg: 4.5 }).where(eq(s.profiles.id, PAT));
    expect(await mine(PAT)).toEqual([]);
  });

  it("never lets owners rent their own aircraft", async () => {
    expect(await codes(OLA)).toContain("own_aircraft");
  });

  it("gives the owner only a yes/no, and nobody else anything", async () => {
    const ask = (viewer: string, pilot: string) =>
      rls.asUser(
        viewer,
        (tx) =>
          tx.execute(
            sql`select public.pilot_meets_requirements(${pilot}::uuid, ${aircraftId}::uuid) as ok`,
          ) as unknown as Promise<{ ok: boolean | null }[]>,
      );
    expect((await ask(OLA, PAT))[0]!.ok).toBe(true);
    expect((await ask(OLA, QUI))[0]!.ok).toBe(false);
    expect((await ask(QUI, PAT))[0]!.ok).toBeNull();
    expect(await mine(null)).toEqual([]);
    expect(
      await rls
        .asUser(QUI, (tx) =>
          tx.execute(
            sql`select * from public.eligibility_failures(${PAT}::uuid, ${aircraftId}::uuid, null)`,
          ),
        )
        .catch((e: { cause?: { code?: string } }) => e.cause?.code),
    ).toBe("42501");
  });
});
