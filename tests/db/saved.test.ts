import { eq, sql } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";

import { describeDb, forceListed, prepareDatabase } from "./setup";

let db: typeof import("@/lib/db");
let rls: typeof import("@/lib/db/rls");
let s: typeof import("@/lib/db/schema");

const OWNER = "8b8b8b8b-1111-4111-8111-111111111111";
const PILOT = "9c9c9c9c-2222-4222-8222-222222222222";
const OTHER = "adadadad-3333-4333-8333-333333333333";
let listed: string;
let draft: string;

async function code(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (e) {
    const err = e as { cause?: { code?: string; message?: string } };
    return err.cause?.code === "P0001" ? err.cause.message : err.cause?.code;
  }
}

describeDb("favourites and saved searches (SRC-6)", () => {
  const plane = async (registration: string, list: boolean) => {
    const [row] = await db
      .getDb()
      .insert(s.aircraft)
      .values({
        ownerId: OWNER,
        registration,
        manufacturer: "Cessna",
        model: "172S",
        typeDesignator: "C172",
        seats: 4,
        fuelType: "avgas_100ll",
        homeAirportIdent: "LBSF",
        pricePerHour: 180,
        nightVfr: true,
      })
      .returning();
    if (list) await forceListed(row!.id);
    return row!.id;
  };

  beforeAll(async () => {
    await prepareDatabase();
    db = await import("@/lib/db");
    rls = await import("@/lib/db/rls");
    s = await import("@/lib/db/schema");
    const owner = db.getDb();
    await owner.insert(s.users).values([
      { id: OWNER, name: "Owner", email: "saved-owner@example.com" },
      { id: PILOT, name: "Pilot", email: "saved-pilot@example.com" },
      { id: OTHER, name: "Other", email: "saved-other@example.com" },
    ]);
    await owner
      .insert(s.airports)
      .values({
        ident: "LBSF",
        type: "large_airport",
        name: "Sofia",
        icaoCode: "LBSF",
        country: "BG",
        latitude: 42.6952,
        longitude: 23.4062,
        timezone: "Europe/Sofia",
      })
      .onConflictDoNothing();
    listed = await plane("LZ-FAV", true);
    draft = await plane("LZ-DRF", false);
  }, 60_000);

  it("keeps each user's favourites private, and only for aircraft they may see", async () => {
    const { listFavourites, setFavourite } = await import("@/lib/saved/favourites");
    expect(await setFavourite(PILOT, listed, true)).toBe(true);
    expect(await setFavourite(PILOT, listed, true)).toBe(true); // twice is fine
    expect(await setFavourite(PILOT, draft, true)).toBe(false); // someone else's draft
    expect(
      await code(
        rls.asUser(PILOT, (tx) =>
          tx.insert(s.favouriteAircraft).values({ userId: PILOT, aircraftId: draft }),
        ),
      ),
    ).toBe("42501");
    expect(
      await code(
        rls.asUser(OTHER, (tx) =>
          tx.insert(s.favouriteAircraft).values({ userId: PILOT, aircraftId: listed }),
        ),
      ),
    ).toBe("42501");
    expect((await listFavourites(PILOT)).map((f) => f.registration)).toEqual(["LZ-FAV"]);
    expect(await rls.asUser(OTHER, (tx) => tx.select().from(s.favouriteAircraft))).toEqual([]);
    expect(await setFavourite(PILOT, listed, false)).toBe(false);
    expect(await listFavourites(PILOT)).toEqual([]);
  });

  it("keeps saved searches private and their hits out of reach", async () => {
    const { saveSearch, listSavedSearches, setSearchAlerts, deleteSavedSearch } =
      await import("@/lib/saved/searches");
    const saved = await saveSearch(PILOT, {
      name: "Near Sofia",
      query: "airport=LBSF",
      alerts: true,
    });
    expect(saved).toMatchObject({ ok: true });
    const id = (saved as { id: string }).id;
    expect(await listSavedSearches(OTHER)).toEqual([]);
    expect(await setSearchAlerts(OTHER, id, false)).toBe(false);
    expect(await deleteSavedSearch(OTHER, id)).toBe(false);
    expect(await code(rls.asUser(PILOT, (tx) => tx.select().from(s.savedSearchHits)))).toBe(
      "42501",
    );
    // What the search showed when saved is remembered, so it won't alert about it.
    const hits = await db
      .getDb()
      .select()
      .from(s.savedSearchHits)
      .where(eq(s.savedSearchHits.savedSearchId, id));
    expect(hits.map((h) => h.aircraftId)).toEqual([listed]);
    expect(
      await code(
        rls.asUser(PILOT, (tx) =>
          tx.insert(s.savedSearches).values({ userId: OTHER, name: "x", query: "" }),
        ),
      ),
    ).toBe("42501");
  });

  it("alerts once about aircraft that newly match, never about old or expired searches", async () => {
    const { runSavedSearchAlerts } = await import("@/lib/saved/alerts");
    const { saveSearch } = await import("@/lib/saved/searches");
    await saveSearch(PILOT, {
      name: "Last year",
      query: "airport=LBSF&from=2020-01-01T08:00&to=2020-01-01T12:00",
      alerts: true,
    });
    const alerts = () =>
      db.getDb().select().from(s.notifications).where(eq(s.notifications.userId, PILOT));
    expect(await runSavedSearchAlerts()).toBe(0);
    expect(await alerts()).toEqual([]);

    await plane("LZ-NEW", true);
    expect(await runSavedSearchAlerts()).toBe(1);
    const [alert] = await alerts();
    expect(alert).toMatchObject({ type: "saved_search", bookingId: null });
    const [search] = await db
      .getDb()
      .select()
      .from(s.savedSearches)
      .where(eq(s.savedSearches.id, alert!.savedSearchId!));
    expect(search).toMatchObject({ name: "Near Sofia" });
    expect(search!.lastAlertAt).toBeInstanceOf(Date);
    // The same aircraft doesn't alert twice.
    expect(await runSavedSearchAlerts()).toBe(0);
  });

  it("allows at most 20 saved searches per user", async () => {
    const owner = db.getDb();
    const count = async () =>
      (
        (await owner.execute(
          sql`select count(*)::int as n from public.saved_searches where user_id = ${OTHER}`,
        )) as unknown as { n: number }[]
      )[0]!.n;
    for (let i = await count(); i < 20; i++) {
      await rls.asUser(OTHER, (tx) =>
        tx.insert(s.savedSearches).values({ userId: OTHER, name: `Search ${i}`, query: "" }),
      );
    }
    expect(
      await code(
        rls.asUser(OTHER, (tx) =>
          tx.insert(s.savedSearches).values({ userId: OTHER, name: "One too many", query: "" }),
        ),
      ),
    ).toBe("too_many_searches");
  });
});
