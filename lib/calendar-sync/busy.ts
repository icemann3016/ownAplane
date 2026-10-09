import "server-only";

import { and, asc, eq, isNull, ne, or, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { aircraft, calendarConnections, calendarEntries } from "@/lib/db/schema";
import type { BusyTime } from "./ics";

/** A connection found by its API key or export token, with its aircraft (trusted lookup). */
export async function findConnection(by: { apiKeyHash: string } | { exportToken: string }) {
  const [row] = await getDb()
    .select({
      id: calendarConnections.id,
      name: calendarConnections.name,
      inbound: calendarConnections.inbound,
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
 * and blocks, and other systems' busy times, but not this connection's own (no echo). Times
 * only; nothing about who or why.
 */
export async function busyTimesFor(
  connection: { id: string; aircraftId: string },
  from: Date,
  to: Date,
): Promise<BusyTime[]> {
  const rows = (await getDb()
    .select({
      id: calendarEntries.id,
      from: sql<string>`lower(${calendarEntries.period})`,
      to: sql<string>`upper(${calendarEntries.period})`,
      kind: calendarEntries.kind,
    })
    .from(calendarEntries)
    .where(
      and(
        eq(calendarEntries.aircraftId, connection.aircraftId),
        eq(calendarEntries.active, true),
        or(isNull(calendarEntries.connectionId), ne(calendarEntries.connectionId, connection.id)),
        sql`${calendarEntries.period} && tstzrange(${from.toISOString()}::timestamptz, ${to.toISOString()}::timestamptz)`,
      ),
    )
    .orderBy(asc(sql`lower(${calendarEntries.period})`))
    .limit(5000)) as unknown as { id: string; from: string; to: string; kind: string }[];
  return rows.map((r) => ({
    id: r.id,
    from: new Date(r.from),
    to: new Date(r.to),
    booking: r.kind === "booking",
  }));
}
