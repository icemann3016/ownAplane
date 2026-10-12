import { eq, sql } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";

import { describeDb, prepareDatabase } from "./setup";

// Practice flights for admins: an accepted booking starting now on the admin's own hidden
// practice aircraft, so the real check-out and check-in can be tried; removed on request.

let db: typeof import("@/lib/db");
let rls: typeof import("@/lib/db/rls");
let s: typeof import("@/lib/db/schema");
let practice: typeof import("@/lib/admin/practice");

const ADMIN = "e7e7e7e7-1111-4111-8111-e7e7e7e7e7e7";
const OTHER_ADMIN = "f8f8f8f8-2222-4222-8222-f8f8f8f8f8f8";

describeDb("practice flights for admins", () => {
  beforeAll(async () => {
    await prepareDatabase();
    db = await import("@/lib/db");
    rls = await import("@/lib/db/rls");
    s = await import("@/lib/db/schema");
    practice = await import("@/lib/admin/practice");
    await db
      .getDb()
      .insert(s.users)
      .values([
        { id: ADMIN, name: "Admin", email: "practice-admin@example.com" },
        { id: OTHER_ADMIN, name: "Other admin", email: "practice-admin-2@example.com" },
      ]);
    await db.getDb().insert(s.airports).values({
      ident: "LBSF",
      type: "large_airport",
      name: "Sofia",
      icaoCode: "LBSF",
      country: "BG",
      latitude: 42.6952,
      longitude: 23.4062,
      timezone: "Europe/Sofia",
    });
  }, 60_000);

  const booking = async (id: string) =>
    (await db.getDb().select().from(s.bookings).where(eq(s.bookings.id, id)))[0];

  it("opens a practice flight the admin can check out at once, hidden from everyone else", async () => {
    const started = await practice.startPracticeFlight(ADMIN);
    expect(started.ok).toBe(true);
    const id = started.ok ? started.bookingId : "";
    expect(await booking(id)).toMatchObject({
      pilotId: ADMIN,
      status: "accepted",
      departureIdent: "LBSF",
    });
    expect(await practice.getPracticeFlight(ADMIN)).toMatchObject({
      bookingId: id,
      registration: practice.practiceRegistration(ADMIN),
      status: "accepted",
    });
    // The real check-out works: the flight log opens and the booking is in progress.
    await rls.asUser(ADMIN, (tx) => tx.execute(sql`select public.start_flight_log(${id}::uuid)`));
    expect((await booking(id))!.status).toBe("in_progress");
    expect(await practice.getPracticeFlight(ADMIN)).toMatchObject({ status: "in_progress" });

    // Not listed, so nobody else sees the practice aircraft; its owner can't log in or get mail.
    expect(await rls.asAnon((tx) => tx.select().from(s.aircraft))).toEqual([]);
    expect(await rls.asUser(OTHER_ADMIN, (tx) => tx.select().from(s.aircraft))).toEqual([]);
    const [owner] = await db
      .getDb()
      .select()
      .from(s.users)
      .where(eq(s.users.email, practice.PRACTICE_EMAIL));
    expect(
      await db.getDb().select().from(s.accounts).where(eq(s.accounts.userId, owner!.id)),
    ).toEqual([]);
    expect(
      (
        await db.getDb().select().from(s.userSettings).where(eq(s.userSettings.userId, owner!.id))
      )[0],
    ).toMatchObject({ emailBookings: false, inAppBookings: false });
  });

  it("replaces the previous practice flight, one practice aircraft per admin", async () => {
    const first = await practice.getPracticeFlight(ADMIN);
    const again = await practice.startPracticeFlight(ADMIN);
    const mine = again.ok ? again.bookingId : "";
    expect(mine).not.toBe(first!.bookingId);
    expect(await booking(first!.bookingId)).toBeUndefined();
    expect((await booking(mine))!.status).toBe("accepted");

    const theirs = await practice.startPracticeFlight(OTHER_ADMIN);
    expect(theirs.ok).toBe(true);
    const planes = await db
      .getDb()
      .select({ registration: s.aircraft.registration })
      .from(s.aircraft);
    expect(planes.map((p) => p.registration).sort()).toEqual(
      [practice.practiceRegistration(ADMIN), practice.practiceRegistration(OTHER_ADMIN)].sort(),
    );
    expect(practice.practiceRegistration(ADMIN)).toMatch(/^ZZ-[0-9A-F]{6}$/);
  });

  it("removes an admin's practice data, nobody else's", async () => {
    expect(await practice.removePracticeData(ADMIN)).toBe(1);
    expect(await practice.removePracticeData(ADMIN)).toBe(0);
    expect(await practice.getPracticeFlight(ADMIN)).toBeNull();
    expect(await practice.getPracticeFlight(OTHER_ADMIN)).not.toBeNull();
    expect(await practice.removePracticeData(OTHER_ADMIN)).toBe(1);
    expect(await db.getDb().select().from(s.bookings)).toEqual([]);
    const actions = await db.getDb().select({ action: s.adminActions.action }).from(s.adminActions);
    expect(actions.map((a) => a.action).sort()).toEqual([
      "practice_flight",
      "practice_flight",
      "practice_flight",
      "practice_removed",
      "practice_removed",
    ]);
  });
});
