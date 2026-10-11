import "server-only";

import { randomBytes } from "node:crypto";

import { and, eq, inArray, or, sql } from "drizzle-orm";

import { airportCodes } from "@/lib/bookings/usage";
import { getDb } from "@/lib/db";
import { aircraft, bookingFeeds, bookings } from "@/lib/db/schema";

// The user's own bookings as a private calendar link (Pilot Plus): as pilot and as owner, from
// a month ago to a year ahead. Trusted code after requireUser() or the link's token.

const DAY = 86_400_000;

export async function getFeedToken(userId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ token: bookingFeeds.token })
    .from(bookingFeeds)
    .where(eq(bookingFeeds.userId, userId));
  return row?.token ?? null;
}

/** A new link (the old one stops working). */
export async function resetFeed(userId: string): Promise<string> {
  const token = randomBytes(24).toString("hex");
  await getDb()
    .insert(bookingFeeds)
    .values({ userId, token })
    .onConflictDoUpdate({ target: bookingFeeds.userId, set: { token, createdAt: new Date() } });
  return token;
}

export async function deleteFeed(userId: string): Promise<void> {
  await getDb().delete(bookingFeeds).where(eq(bookingFeeds.userId, userId));
}

export async function feedUser(token: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ userId: bookingFeeds.userId })
    .from(bookingFeeds)
    .where(eq(bookingFeeds.token, token));
  return row?.userId ?? null;
}

export type FeedBooking = {
  id: string;
  role: "pilot" | "owner";
  status: string;
  registration: string;
  from: Date;
  to: Date;
  route: string;
};

/** Bookings that are on (requested, accepted, flying, done) as pilot or owner. */
export async function feedBookings(userId: string, now = Date.now()): Promise<FeedBooking[]> {
  const rows = await getDb()
    .select({
      id: bookings.id,
      pilotId: bookings.pilotId,
      status: bookings.status,
      registration: aircraft.registration,
      from: sql<string>`lower(${bookings.period})`,
      to: sql<string>`upper(${bookings.period})`,
      departure: bookings.departureIdent,
      arrival: bookings.arrivalIdent,
    })
    .from(bookings)
    .innerJoin(aircraft, eq(aircraft.id, bookings.aircraftId))
    .where(
      and(
        or(eq(bookings.pilotId, userId), eq(bookings.ownerId, userId)),
        inArray(bookings.status, ["requested", "accepted", "in_progress", "completed"]),
        sql`upper(${bookings.period}) > ${new Date(now - 30 * DAY).toISOString()}::timestamptz`,
        sql`lower(${bookings.period}) < ${new Date(now + 400 * DAY).toISOString()}::timestamptz`,
      ),
    );
  const codes = await airportCodes(rows.flatMap((r) => [r.departure, r.arrival]));
  const code = (ident: string) => codes.get(ident) ?? ident;
  return rows.map((r) => ({
    id: r.id,
    role: r.pilotId === userId ? "pilot" : "owner",
    status: r.status,
    registration: r.registration,
    from: new Date(r.from),
    to: new Date(r.to),
    route:
      r.departure === r.arrival ? code(r.departure) : `${code(r.departure)} → ${code(r.arrival)}`,
  }));
}
