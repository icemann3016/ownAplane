import "server-only";

import { asc, desc, eq, inArray, or, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { asUser } from "@/lib/db/rls";
import { aircraft, airports, bookingEvents, bookings, profiles } from "@/lib/db/schema";

/** Unanswered requests past their deadline expire (pages call this; so does the daily job). */
export async function expireBookingRequests(): Promise<number> {
  const [row] = (await getDb().execute(
    sql`select public.expire_booking_requests() as n`,
  )) as unknown as { n: number }[];
  return row?.n ?? 0;
}

const periodColumns = {
  from: sql<string>`lower(${bookings.period})`,
  to: sql<string>`upper(${bookings.period})`,
};

/**
 * A booking the viewer may see (pilot, owner or admin; RLS), with its aircraft, people, airfields
 * and history. Null otherwise.
 */
export async function getBooking(viewerId: string, id: string) {
  await expireBookingRequests();
  const found = await asUser(viewerId, async (tx) => {
    const [row] = await tx
      .select({
        booking: bookings,
        ...periodColumns,
        proposedFrom: sql<string | null>`lower(${bookings.proposedPeriod})`,
        proposedTo: sql<string | null>`upper(${bookings.proposedPeriod})`,
      })
      .from(bookings)
      .where(eq(bookings.id, id));
    if (!row) return null;
    const events = await tx
      .select()
      .from(bookingEvents)
      .where(eq(bookingEvents.bookingId, id))
      .orderBy(asc(bookingEvents.createdAt));
    return { ...row, events };
  });
  if (!found) return null;
  const b = found.booking;

  // The viewer may see this booking, so they may see its aircraft and people even if the
  // aircraft is no longer listed: trusted read after the access check above.
  const db = getDb();
  const [plane] = await db
    .select({
      id: aircraft.id,
      registration: aircraft.registration,
      manufacturer: aircraft.manufacturer,
      model: aircraft.model,
      typeDesignator: aircraft.typeDesignator,
      oilUnit: aircraft.oilUnit,
      fuelType: aircraft.fuelType,
      fuelBurnLph: aircraft.fuelBurnLph,
      status: aircraft.status,
      ifr: aircraft.ifr,
    })
    .from(aircraft)
    .where(eq(aircraft.id, b.aircraftId));
  const people = await db
    .select({ id: profiles.id, displayName: profiles.displayName, avatarKey: profiles.avatarKey })
    .from(profiles)
    .where(inArray(profiles.id, [b.ownerId, ...(b.pilotId ? [b.pilotId] : [])]));
  const fields = await db
    .select({
      ident: airports.ident,
      code: sql<string>`coalesce(${airports.icaoCode}, ${airports.ident})`,
      name: airports.name,
      timezone: airports.timezone,
      latitude: airports.latitude,
      longitude: airports.longitude,
    })
    .from(airports)
    .where(inArray(airports.ident, [b.departureIdent, b.arrivalIdent, ...b.stops]));
  const byIdent = new Map(fields.map((f) => [f.ident, f]));

  return {
    booking: b,
    period: { from: new Date(found.from), to: new Date(found.to) },
    proposal:
      found.proposedFrom && found.proposedTo
        ? { from: new Date(found.proposedFrom), to: new Date(found.proposedTo) }
        : null,
    aircraft: plane!,
    pilot: people.find((p) => p.id === b.pilotId) ?? null,
    owner: people.find((p) => p.id === b.ownerId)!,
    route: [b.departureIdent, ...b.stops, b.arrivalIdent].map((ident) => byIdent.get(ident)!),
    events: found.events,
  };
}

export type BookingDetail = NonNullable<Awaited<ReturnType<typeof getBooking>>>;

/** The user's bookings as pilot and as owner, newest first. */
export async function listBookings(userId: string) {
  await expireBookingRequests();
  const rows = await asUser(userId, (tx) =>
    tx
      .select({
        id: bookings.id,
        status: bookings.status,
        pilotId: bookings.pilotId,
        ownerId: bookings.ownerId,
        estimate: bookings.estimate,
        currency: bookings.currency,
        expiresAt: bookings.expiresAt,
        departureIdent: bookings.departureIdent,
        arrivalIdent: bookings.arrivalIdent,
        aircraftId: bookings.aircraftId,
        ...periodColumns,
      })
      .from(bookings)
      .where(or(eq(bookings.pilotId, userId), eq(bookings.ownerId, userId)))
      .orderBy(desc(sql`lower(${bookings.period})`))
      .limit(200),
  );
  if (!rows.length) return [];
  const db = getDb();
  const planes = await db
    .select({
      id: aircraft.id,
      registration: aircraft.registration,
      manufacturer: aircraft.manufacturer,
      model: aircraft.model,
      timezone: airports.timezone,
    })
    .from(aircraft)
    .leftJoin(airports, eq(airports.ident, aircraft.homeAirportIdent))
    .where(inArray(aircraft.id, [...new Set(rows.map((r) => r.aircraftId))]));
  const deps = await db
    .select({ ident: airports.ident, timezone: airports.timezone })
    .from(airports)
    .where(inArray(airports.ident, [...new Set(rows.map((r) => r.departureIdent))]));
  const zone = new Map(deps.map((d) => [d.ident, d.timezone]));
  const byId = new Map(planes.map((p) => [p.id, p]));
  return rows.map((r) => ({
    ...r,
    from: new Date(r.from),
    to: new Date(r.to),
    timeZone: zone.get(r.departureIdent) ?? "UTC",
    aircraft: byId.get(r.aircraftId)!,
    role: r.pilotId === userId ? ("pilot" as const) : ("owner" as const),
  }));
}

export type BookingListItem = Awaited<ReturnType<typeof listBookings>>[number];

/** Owner view: whether the pilot meets the aircraft's requirements for this flight (yes/no only). */
export async function pilotMeetsRequirements(
  ownerId: string,
  b: { pilotId: string | null; aircraftId: string; period: string },
  airfields: string[],
): Promise<boolean | null> {
  if (!b.pilotId) return null;
  const rows = (await asUser(ownerId, (tx) =>
    tx.execute(sql`select public.pilot_meets_requirements(${b.pilotId}::uuid,
      ${b.aircraftId}::uuid, ${b.period}::tstzrange, ${`{${airfields.join(",")}}`}::text[]) as ok`),
  )) as unknown as { ok: boolean | null }[];
  return rows[0]?.ok ?? null;
}

/** The other side's name, email and phone, once the booking is accepted (MSG-2); else null. */
export async function getBookingContact(userId: string, bookingId: string) {
  const [row] = (await asUser(userId, (tx) =>
    tx.execute(sql`select * from public.booking_contacts(${bookingId}::uuid)`),
  )) as unknown as { user_id: string; name: string; email: string; phone: string | null }[];
  return row ? { userId: row.user_id, name: row.name, email: row.email, phone: row.phone } : null;
}
