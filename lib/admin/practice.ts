import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  adminActions,
  aircraft,
  airports,
  bookings,
  calendarEntries,
  profiles,
  userRoles,
  userSettings,
  users,
} from "@/lib/db/schema";

// Practice flights for admins (Zlati, 2026-10-12): an accepted booking with the admin as pilot,
// starting now, on a practice aircraft of a practice owner account, so the real check-out and
// check-in (flight log) can be tried on the live site. Nothing is listed or searchable; the
// practice owner has no password and gets no emails. Trusted code: callers use requireAdmin().

/** The practice owner (on the demo domain, so `npm run demo:seed -- --remove` clears it too). */
export const PRACTICE_EMAIL = "practice@demo.ownaplane.eu";
const HOURS = 3;

/** Each admin's own practice aircraft: "ZZ-" (no country uses ZZ) and 6 letters of their id. */
export const practiceRegistration = (adminId: string) =>
  `ZZ-${adminId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

const OPEN = ["accepted", "in_progress"] as const;

export type PracticeFlight = {
  bookingId: string;
  registration: string;
  status: string;
  from: Date;
  to: Date;
};

async function practiceOwner(): Promise<string> {
  const db = getDb();
  const [found] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, PRACTICE_EMAIL));
  if (found) return found.id;
  const [user] = await db
    .insert(users)
    .values({ name: "Practice owner (ownAplane)", email: PRACTICE_EMAIL, emailVerified: true })
    .onConflictDoNothing()
    .returning({ id: users.id });
  const id =
    user?.id ??
    (await db.select({ id: users.id }).from(users).where(eq(users.email, PRACTICE_EMAIL)))[0]!.id;
  await db.insert(userRoles).values({ userId: id, role: "owner" }).onConflictDoNothing();
  // No emails or in-app notices for an account nobody reads.
  const quiet = {
    emailBookings: false,
    inAppBookings: false,
    emailReviews: false,
    inAppReviews: false,
    emailMessages: false,
  };
  await db
    .insert(userSettings)
    .values({ userId: id, ...quiet })
    .onConflictDoUpdate({ target: userSettings.userId, set: quiet });
  return id;
}

/** An airfield for the practice flight: the admin's home airfield, else LBSF, else any. */
async function practiceAirfield(adminId: string): Promise<string | null> {
  const db = getDb();
  const [home] = await db
    .select({ ident: profiles.homeAirportIdent })
    .from(profiles)
    .where(eq(profiles.id, adminId));
  if (home?.ident) return home.ident;
  const [any] = await db
    .select({ ident: airports.ident })
    .from(airports)
    .orderBy(sql`${airports.ident} <> 'LBSF'`, airports.ident)
    .limit(1);
  return any?.ident ?? null;
}

async function practiceAircraft(adminId: string, ownerId: string, base: string) {
  const db = getDb();
  const registration = practiceRegistration(adminId);
  const [found] = await db
    .select({ id: aircraft.id })
    .from(aircraft)
    .where(and(eq(aircraft.registration, registration), eq(aircraft.ownerId, ownerId)));
  if (found) return { id: found.id, registration };
  // Unlisted, not a draft: registrations are unique among non-draft aircraft.
  const [plane] = await db
    .insert(aircraft)
    .values({
      ownerId,
      registration,
      manufacturer: "Cessna",
      model: "172S (practice)",
      typeDesignator: "C172",
      seats: 4,
      fuelType: "avgas_100ll",
      fuelBurnLph: 32,
      homeAirportIdent: base,
      pricePerHour: 150,
      status: "unlisted",
    })
    .returning({ id: aircraft.id });
  return { id: plane!.id, registration };
}

/** The admin's practice flight that can still be checked out or checked in, if any. */
export async function getPracticeFlight(adminId: string): Promise<PracticeFlight | null> {
  const [row] = await getDb()
    .select({
      bookingId: bookings.id,
      registration: aircraft.registration,
      status: bookings.status,
      from: sql<string>`lower(${bookings.period})`,
      to: sql<string>`upper(${bookings.period})`,
    })
    .from(bookings)
    .innerJoin(aircraft, eq(aircraft.id, bookings.aircraftId))
    .innerJoin(users, eq(users.id, bookings.ownerId))
    .where(
      and(
        eq(bookings.pilotId, adminId),
        eq(users.email, PRACTICE_EMAIL),
        eq(aircraft.registration, practiceRegistration(adminId)),
        inArray(bookings.status, [...OPEN]),
      ),
    )
    .orderBy(sql`lower(${bookings.period}) desc`)
    .limit(1);
  return row ? { ...row, from: new Date(row.from), to: new Date(row.to) } : null;
}

/**
 * A fresh practice flight for the admin: their earlier practice bookings are removed, and a new
 * accepted one from 5 minutes ago to 3 hours ahead is made, so the check-out is open at once.
 */
export async function startPracticeFlight(
  adminId: string,
): Promise<{ ok: true; bookingId: string } | { ok: false; error: "no_airfield" }> {
  const base = await practiceAirfield(adminId);
  if (!base) return { ok: false, error: "no_airfield" };
  const ownerId = await practiceOwner();
  const plane = await practiceAircraft(adminId, ownerId, base);
  const start = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 5 * 60_000);
  const end = new Date(start.getTime() + HOURS * 3_600_000);
  const period = `[${start.toISOString()},${end.toISOString()})`;
  const bookingId = await getDb().transaction(async (tx) => {
    // Earlier practice bookings go (with their flight logs), so the time is free again.
    await tx.delete(bookings).where(eq(bookings.aircraftId, plane.id));
    const [booking] = await tx
      .insert(bookings)
      .values({
        aircraftId: plane.id,
        pilotId: adminId,
        ownerId,
        status: "accepted",
        period,
        departureIdent: base,
        arrivalIdent: base,
        purpose: "local",
        plannedHours: HOURS,
        message: "Practice flight to try the check-out and check-in.",
        pricePerHour: 150,
        currency: "EUR",
        priceBasis: "wet",
        timeBasis: "hobbs",
        estimate: 150 * HOURS,
        expiresAt: start,
        respondedAt: new Date(),
      })
      .returning({ id: bookings.id });
    await tx.insert(calendarEntries).values({
      aircraftId: plane.id,
      period,
      kind: "booking",
      bookingId: booking!.id,
      createdBy: ownerId,
    });
    await tx.insert(adminActions).values({
      adminId,
      action: "practice_flight",
      targetType: "booking",
      targetId: booking!.id,
    });
    return booking!.id;
  });
  return { ok: true, bookingId };
}

/**
 * Remove the admin's practice aircraft with its bookings and flight logs. The practice owner
 * account stays (empty), so another admin's practice flight being made meanwhile never breaks.
 */
export async function removePracticeData(adminId: string): Promise<number> {
  return getDb().transaction(async (tx) => {
    const removed = await tx
      .delete(aircraft)
      .where(
        and(
          eq(aircraft.registration, practiceRegistration(adminId)),
          sql`${aircraft.ownerId} = (select id from public.users where email = ${PRACTICE_EMAIL})`,
        ),
      )
      .returning({ id: aircraft.id });
    if (removed.length) {
      await tx.insert(adminActions).values({
        adminId,
        action: "practice_removed",
        targetType: "aircraft",
        targetId: removed[0]!.id,
      });
    }
    return removed.length;
  });
}
