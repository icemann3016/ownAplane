import "server-only";

import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { asUser } from "@/lib/db/rls";
import { aircraft, airports, bookings, flightLegs, flightLogs, profiles } from "@/lib/db/schema";
import type { FlightLeg } from "@/lib/db/schema";
import type { UsageFlight } from "@/lib/domain/usage";

export type UsageLegRow = FlightLeg & { bookingId: string; pilotId: string | null };

/**
 * Legs of the aircraft's confirmed flight logs (BKG-16), oldest first, with the booking and pilot.
 * RLS: only the booking's owner (and admins) see them.
 */
export async function getAircraftUsage(
  ownerId: string,
  aircraftId: string,
  /** From when (the plan's usage history, SUB-10); null = all. */
  since: Date | null = null,
) {
  const rows = await asUser(ownerId, (tx) =>
    tx
      .select({
        leg: flightLegs,
        bookingId: bookings.id,
        pilotId: bookings.pilotId,
        flownMinutes: flightLogs.flownMinutes,
      })
      .from(flightLegs)
      .innerJoin(flightLogs, eq(flightLogs.id, flightLegs.flightLogId))
      .innerJoin(bookings, eq(bookings.id, flightLogs.bookingId))
      .where(
        and(
          eq(bookings.aircraftId, aircraftId),
          eq(bookings.ownerId, ownerId),
          eq(flightLogs.status, "confirmed"),
          since ? gte(flightLegs.blockOff, since) : undefined,
        ),
      )
      .orderBy(asc(flightLegs.blockOff), asc(flightLegs.seq)),
  );
  const flights = new Map<string, UsageFlight>();
  for (const r of rows) {
    const flight = flights.get(r.bookingId) ?? {
      bookingId: r.bookingId,
      pilotId: r.pilotId,
      flownMinutes: r.flownMinutes ?? 0,
      legs: [],
    };
    flight.legs.push(r.leg);
    flights.set(r.bookingId, flight);
  }
  const legs: UsageLegRow[] = rows.map((r) => ({
    ...r.leg,
    bookingId: r.bookingId,
    pilotId: r.pilotId,
  }));
  return { flights: [...flights.values()], legs };
}

/** Display names of pilots (profiles are public). */
export async function pilotNames(userId: string, ids: (string | null)[]) {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
  if (!wanted.length) return new Map<string, string>();
  const rows = await asUser(userId, (tx) =>
    tx
      .select({ id: profiles.id, name: profiles.displayName })
      .from(profiles)
      .where(inArray(profiles.id, wanted)),
  );
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Codes to show for airport idents (ICAO, else the local id). */
export async function airportCodes(idents: string[]) {
  const wanted = [...new Set(idents)];
  if (!wanted.length) return new Map<string, string>();
  const rows = await getDb()
    .select({
      ident: airports.ident,
      code: sql<string>`coalesce(${airports.icaoCode}, ${airports.ident})`,
    })
    .from(airports)
    .where(inArray(airports.ident, wanted));
  return new Map(rows.map((r) => [r.ident, r.code]));
}

/**
 * The pilot's own legs for their logbook (BKG-16): logs they sent or the owner confirmed, oldest
 * first, with the aircraft's registration and type.
 */
export async function getPilotLegs(pilotId: string) {
  const rows = await asUser(pilotId, (tx) =>
    tx
      .select({ leg: flightLegs, aircraftId: bookings.aircraftId })
      .from(flightLegs)
      .innerJoin(flightLogs, eq(flightLogs.id, flightLegs.flightLogId))
      .innerJoin(bookings, eq(bookings.id, flightLogs.bookingId))
      .where(
        and(eq(bookings.pilotId, pilotId), inArray(flightLogs.status, ["submitted", "confirmed"])),
      )
      .orderBy(asc(flightLegs.blockOff), asc(flightLegs.seq)),
  );
  if (!rows.length) return [];
  // The pilot flew these aircraft, so they may see their registration and type even if they are
  // no longer listed: trusted read after the RLS-checked query above.
  const planes = await getDb()
    .select({
      id: aircraft.id,
      registration: aircraft.registration,
      typeDesignator: aircraft.typeDesignator,
    })
    .from(aircraft)
    .where(inArray(aircraft.id, [...new Set(rows.map((r) => r.aircraftId))]));
  const byId = new Map(planes.map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r.leg, aircraft: byId.get(r.aircraftId)! }));
}
