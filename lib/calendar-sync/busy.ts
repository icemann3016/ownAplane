import "server-only";

import { and, asc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/lib/db";
import {
  aircraft,
  bookings,
  calendarConnections,
  calendarEntries,
  profiles,
} from "@/lib/db/schema";
import type { BusyDetail } from "./outgoing";

/** A connection found by its API key or export token, with its aircraft (trusted lookup). */
export async function findConnection(by: { apiKeyHash: string } | { exportToken: string }) {
  const [row] = await getDb()
    .select({
      id: calendarConnections.id,
      name: calendarConnections.name,
      inbound: calendarConnections.inbound,
      exportFields: calendarConnections.exportFields,
      importFields: calendarConnections.importFields,
      aircraftId: aircraft.id,
      registration: aircraft.registration,
      ownerId: aircraft.ownerId,
    })
    .from(calendarConnections)
    .innerJoin(aircraft, eq(aircraft.id, calendarConnections.aircraftId))
    .where(
      "apiKeyHash" in by
        ? eq(calendarConnections.apiKeyHash, by.apiKeyHash)
        : eq(calendarConnections.exportToken, by.exportToken),
    );
  return row ?? null;
}

/**
 * When the aircraft is busy in ownAplane, for another system (SYN-3, SYN-4): bookings, requests
 * and blocks, and other systems' busy times, but not this connection's own (no echo). With the
 * details callers may share (outgoing.ts decides which, from the owner's choice).
 */
export async function busyTimesFor(
  connection: { id: string; aircraftId: string },
  from: Date,
  to: Date,
): Promise<BusyDetail[]> {
  const pilot = alias(profiles, "pilot");
  const rows = (await getDb()
    .select({
      id: calendarEntries.id,
      from: sql<string>`lower(${calendarEntries.period})`,
      to: sql<string>`upper(${calendarEntries.period})`,
      kind: calendarEntries.kind,
      connectionId: calendarEntries.connectionId,
      note: calendarEntries.note,
      bookingId: calendarEntries.bookingId,
      bookingStatus: bookings.status,
      departure: bookings.departureIdent,
      arrival: bookings.arrivalIdent,
      pilotName: pilot.displayName,
      registration: aircraft.registration,
    })
    .from(calendarEntries)
    .innerJoin(aircraft, eq(aircraft.id, calendarEntries.aircraftId))
    .leftJoin(bookings, eq(bookings.id, calendarEntries.bookingId))
    .leftJoin(pilot, eq(pilot.id, bookings.pilotId))
    .where(
      and(
        eq(calendarEntries.aircraftId, connection.aircraftId),
        eq(calendarEntries.active, true),
        or(isNull(calendarEntries.connectionId), ne(calendarEntries.connectionId, connection.id)),
        sql`${calendarEntries.period} && tstzrange(${from.toISOString()}::timestamptz, ${to.toISOString()}::timestamptz)`,
      ),
    )
    .orderBy(asc(sql`lower(${calendarEntries.period})`))
    .limit(5000)) as unknown as (Omit<BusyDetail, "from" | "to" | "external"> & {
    from: string;
    to: string;
    connectionId: string | null;
  })[];
  return rows.map(({ connectionId, ...r }) => ({
    ...r,
    from: new Date(r.from),
    to: new Date(r.to),
    external: connectionId !== null,
  }));
}
