import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import type { Tx } from "@/lib/db";
import { asAnon, asUser } from "@/lib/db/rls";
import {
  bookings,
  calendarConnections,
  calendarEntries,
  type CalendarEntryKind,
  profiles,
} from "@/lib/db/schema";

export type CalendarItem = {
  id: string;
  kind: CalendarEntryKind;
  from: Date;
  to: Date;
  note: string | null;
  /** For bookings: the booking, its status and the pilot's name. */
  bookingId: string | null;
  bookingStatus: string | null;
  pilotName: string | null;
  /** For busy times from another system (SYN-1): the connection's name. */
  source: string | null;
};

const rangeOf = (from: Date, to: Date) =>
  sql`tstzrange(${from.toISOString()}::timestamptz, ${to.toISOString()}::timestamptz, '[)')`;

/** The owner's active calendar entries overlapping [from, to) (owner or admin; RLS). */
export async function getCalendarEntries(
  userId: string,
  aircraftId: string,
  from: Date,
  to: Date,
): Promise<CalendarItem[]> {
  const rows = await asUser(userId, (tx) =>
    tx
      .select({
        id: calendarEntries.id,
        kind: calendarEntries.kind,
        note: calendarEntries.note,
        from: sql<string>`lower(${calendarEntries.period})`,
        to: sql<string>`upper(${calendarEntries.period})`,
        bookingId: calendarEntries.bookingId,
        bookingStatus: bookings.status,
        pilotName: profiles.displayName,
        source: calendarConnections.name,
      })
      .from(calendarEntries)
      .leftJoin(bookings, eq(bookings.id, calendarEntries.bookingId))
      .leftJoin(profiles, eq(profiles.id, bookings.pilotId))
      .leftJoin(calendarConnections, eq(calendarConnections.id, calendarEntries.connectionId))
      .where(
        and(
          eq(calendarEntries.aircraftId, aircraftId),
          eq(calendarEntries.active, true),
          sql`${calendarEntries.period} && ${rangeOf(from, to)}`,
        ),
      )
      .orderBy(asc(sql`lower(${calendarEntries.period})`))
      .limit(500),
  );
  return rows.map((r) => ({ ...r, from: new Date(r.from), to: new Date(r.to) }));
}

export type BusyPeriod = {
  from: Date;
  to: Date;
  kind: CalendarEntryKind;
  /** A booking that's only requested, not accepted yet. */
  pending: boolean;
};

/**
 * When a visible aircraft is busy within [from, to), and for what kind of entry (SRC-4). Never
 * notes or who booked it.
 */
export async function getBusyPeriods(
  viewerId: string | null,
  aircraftId: string,
  from: Date,
  to: Date,
): Promise<BusyPeriod[]> {
  const query = (tx: Tx) =>
    tx.execute(sql`
      select lower(period) as "from", upper(period) as "to", kind, pending
      from public.aircraft_calendar_view(${aircraftId}::uuid, ${rangeOf(from, to)})`) as unknown as Promise<
      { from: string; to: string; kind: CalendarEntryKind; pending: boolean }[]
    >;
  const rows = viewerId ? await asUser(viewerId, query) : await asAnon(query);
  return rows.map((r) => ({
    from: new Date(r.from),
    to: new Date(r.to),
    kind: r.kind,
    pending: r.pending,
  }));
}
