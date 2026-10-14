import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { asUser } from "@/lib/db/rls";
import { aircraft, airportOperators, bookings } from "@/lib/db/schema";

// A request to an airfield filled in from one of the pilot's bookings (APT-7): the aircraft,
// and the arrival and/or departure that the trip makes there. Times stay editable.

export type RequestPrefill = {
  bookingId: string;
  registration: string;
  aircraftType: string;
  mtomKg: number | null;
  pob: number;
  arriving: boolean;
  arrivalAt: string;
  fromIdent: string | null;
  departing: boolean;
  departureAt: string;
  toIdent: string | null;
};

/** "2026-10-20T09:00" (UTC) for a datetime-local field. */
const field = (d: Date) => d.toISOString().slice(0, 16);

export async function bookingPrefill(
  userId: string,
  bookingId: string,
  ident: string,
): Promise<RequestPrefill | null> {
  const [b] = await asUser(userId, (tx) =>
    tx
      .select({
        registration: aircraft.registration,
        aircraftType: aircraft.typeDesignator,
        mtomKg: aircraft.mtomKg,
        from: sql<string>`lower(${bookings.period})`,
        to: sql<string>`upper(${bookings.period})`,
        departureIdent: bookings.departureIdent,
        arrivalIdent: bookings.arrivalIdent,
        stops: bookings.stops,
        plannedHours: bookings.plannedHours,
        passengers: bookings.passengers,
      })
      .from(bookings)
      .innerJoin(aircraft, eq(aircraft.id, bookings.aircraftId))
      .where(and(eq(bookings.id, bookingId), eq(bookings.pilotId, userId))),
  );
  if (!b) return null;
  const start = new Date(b.from);
  const end = new Date(b.to);
  const route = [b.departureIdent, ...(b.stops ?? []), b.arrivalIdent];
  const at = route.indexOf(ident);
  if (at === -1) return null;
  const isStart = at === 0;
  const isEnd = route.lastIndexOf(ident) === route.length - 1;
  const firstLeg = new Date(start.getTime() + Math.min(b.plannedHours, 2) * 1_800_000);
  return {
    bookingId,
    registration: b.registration,
    aircraftType: b.aircraftType,
    mtomKg: b.mtomKg,
    pob: b.passengers + 1,
    // Leaving from the start of the trip; arriving at its end or at a stop on the way.
    departing: isStart || !isEnd,
    departureAt: isStart ? field(start) : "",
    toIdent: route[at + 1] ?? null,
    arriving: !isStart || isEnd,
    arrivalAt: isEnd ? field(isStart ? end : firstLeg) : "",
    fromIdent: isStart ? (route[route.length - 2] ?? null) : (route[at - 1] ?? null),
  };
}

/** Which airfields of a booking's trip take requests on ownAplane (for links on the booking). */
export async function requestableAirfields(userId: string, idents: string[]) {
  const unique = [...new Set(idents)];
  if (!unique.length) return [];
  const rows = await asUser(userId, (tx) =>
    tx
      .select({ ident: airportOperators.airportIdent })
      .from(airportOperators)
      .where(inArray(airportOperators.airportIdent, unique)),
  );
  return unique.filter((i) => rows.some((r) => r.ident === i));
}
