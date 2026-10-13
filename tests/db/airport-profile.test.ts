import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";

import { describeDb, prepareDatabase } from "./setup";

let db: typeof import("@/lib/db");
let rls: typeof import("@/lib/db/rls");
let s: typeof import("@/lib/db/schema");
let ops: typeof import("@/lib/airport-profile/ops");
let queries: typeof import("@/lib/airport-profile/queries");

const MANAGER = "e5e5e5e5-1111-4111-8111-111111111111";
const STAFF = "f6f6f6f6-2222-4222-8222-222222222222";
const OTHER = "a7a7a7a7-3333-4333-8333-333333333333";
const RUN = "LBRN";
const OPEN = "LBOP"; // an airfield without a team: open data only

const profile = {
  description: "Grass field by the river.",
  phone: "+359 2 000 000",
  email: "ops@ruse-airfield.example",
  website: "https://ruse-airfield.example",
  pprRequired: true,
  pprNoticeHours: 24,
  currency: "EUR" as const,
  services: ["hangar" as const, "tie_downs" as const],
  fuels: ["avgas_100ll" as const],
};

describeDb("airport profiles (APT-1)", () => {
  beforeAll(async () => {
    await prepareDatabase();
    db = await import("@/lib/db");
    rls = await import("@/lib/db/rls");
    s = await import("@/lib/db/schema");
    ops = await import("@/lib/airport-profile/ops");
    queries = await import("@/lib/airport-profile/queries");
    const owner = db.getDb();
    await owner.insert(s.users).values([
      { id: MANAGER, name: "Mia Manager", email: "mia@ruse-airfield.example" },
      { id: STAFF, name: "Sam Staff", email: "sam@ruse-airfield.example" },
      { id: OTHER, name: "Otto Other", email: "otto@example.com" },
    ]);
    await owner.insert(s.airports).values(
      [RUN, OPEN].map((ident) => ({
        ident,
        type: "small_airport",
        name: ident === RUN ? "Ruse" : "Open Field",
        icaoCode: ident,
        country: "BG",
        latitude: 43.7,
        longitude: 26.0,
        timezone: "Europe/Sofia",
      })),
    );
    await owner.insert(s.airportOperators).values({ airportIdent: RUN });
    await owner.insert(s.airportMembers).values([
      { airportIdent: RUN, userId: MANAGER, role: "manager" },
      { airportIdent: RUN, userId: STAFF, role: "staff" },
    ]);
    // Open data from the import (owner connection).
    await owner.insert(s.airportRunways).values([
      { airportIdent: RUN, designator: "08/26", lengthM: 900, surface: "grass" },
      { airportIdent: OPEN, designator: "18/36", lengthM: 600, surface: "grass" },
    ]);
  }, 60_000);

  it("lets only the airfield's managers change its profile", async () => {
    expect(await ops.updateProfile(STAFF, RUN, profile)).toEqual({
      ok: false,
      error: "not_allowed",
    });
    expect(await ops.updateProfile(OTHER, RUN, profile)).toEqual({
      ok: false,
      error: "not_allowed",
    });
    expect(await ops.updateProfile(MANAGER, RUN, profile)).toEqual({ ok: true });
    // The verification itself isn't theirs to change.
    await expect(
      rls.asUser(MANAGER, (tx) =>
        tx
          .update(s.airportOperators)
          .set({ verifiedAt: new Date(0) })
          .where(eq(s.airportOperators.airportIdent, RUN)),
      ),
    ).rejects.toThrow();
    const data = await queries.getAirportProfile(RUN);
    expect(data?.profile).toMatchObject({ ...profile, airportIdent: RUN });
    expect(data?.profile.profileUpdatedAt).not.toBeNull();
  });

  it("keeps hours, closures, runways, frequencies and fees for managers to change", async () => {
    const hours = {
      note: "Outside these hours on request",
      hours: [1, 2, 3, 4, 5].map((weekday) => ({
        weekday: weekday as 1,
        opens: "08:00",
        closes: "18:00",
      })),
    };
    expect(await ops.setHours(STAFF, RUN, hours)).toEqual({ ok: false, error: "not_allowed" });
    expect(await ops.setHours(MANAGER, RUN, hours)).toEqual({ ok: true });
    // Saving again replaces them.
    expect(await ops.setHours(MANAGER, RUN, hours)).toEqual({ ok: true });
    expect(
      await ops.addClosure(MANAGER, RUN, {
        startsOn: "2027-01-01",
        endsOn: "2027-01-02",
        note: "Holidays",
      }),
    ).toEqual({ ok: true });
    const runway = {
      designator: "01/19",
      lengthM: 700,
      widthM: 18,
      surface: "grass" as const,
      lighted: false,
    };
    expect(await ops.addRunway(STAFF, RUN, runway)).toEqual({ ok: false, error: "not_allowed" });
    expect(await ops.addRunway(MANAGER, RUN, runway)).toEqual({ ok: true });
    // Nobody changes the open data of an airfield without a team.
    expect(await ops.addRunway(OTHER, OPEN, runway)).toEqual({ ok: false, error: "not_allowed" });
    expect(
      await ops.addFrequency(MANAGER, RUN, { type: "A/G", mhz: 123.5, description: "Ruse Radio" }),
    ).toEqual({ ok: true });
    expect(
      await ops.addFee(MANAGER, RUN, {
        kind: "landing",
        label: null,
        maxMtomKg: 1000,
        amount: 15,
        unit: "landing",
      }),
    ).toEqual({ ok: true });

    // Everyone reads them, even logged out.
    const data = await queries.getAirportProfile(RUN);
    expect(data?.hours).toHaveLength(5);
    expect(data?.profile.hoursNote).toBe("Outside these hours on request");
    expect(data?.runways.map((r) => r.designator)).toEqual(["01/19", "08/26"]);
    expect(data?.frequencies).toMatchObject([{ type: "A/G", mhz: 123.5 }]);
    expect(data?.fees).toMatchObject([{ kind: "landing", amount: 15, maxMtomKg: 1000 }]);
    expect(data?.closures).toMatchObject([{ startsOn: "2027-01-01", note: "Holidays" }]);
    expect(await rls.asAnon((tx) => tx.select().from(s.airportRunways))).toHaveLength(3);

    // Staff and others can't remove anything; managers can.
    const [opened] = data!.runways;
    expect(await ops.removeItem(STAFF, RUN, "runway", opened!.id)).toEqual({
      ok: false,
      error: "not_allowed",
    });
    expect(await ops.removeItem(MANAGER, RUN, "runway", opened!.id)).toEqual({ ok: true });
    const [openRunway] = await db
      .getDb()
      .select()
      .from(s.airportRunways)
      .where(eq(s.airportRunways.airportIdent, OPEN));
    expect(await ops.removeItem(MANAGER, OPEN, "runway", openRunway!.id)).toEqual({
      ok: false,
      error: "not_allowed",
    });
  });

  it("caps the rows a team adds", async () => {
    const fee = {
      kind: "other" as const,
      label: "Fee",
      maxMtomKg: null,
      amount: 1,
      unit: "once" as const,
    };
    for (let i = 0; i < 49; i++) {
      expect(await ops.addFee(MANAGER, RUN, fee)).toEqual({ ok: true });
    }
    expect(await ops.addFee(MANAGER, RUN, fee)).toEqual({ ok: false, error: "too_many_rows" });
  });

  it("shows pages only for airfields with a team", async () => {
    expect(await queries.getAirportProfile(OPEN)).toBeNull();
    expect((await queries.listAirportsOnOwnAplane()).map((a) => a.ident)).toEqual([RUN]);
  });
});
