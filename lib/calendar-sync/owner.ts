import "server-only";

import { and, asc, eq, isNotNull, sql } from "drizzle-orm";

import { asUser } from "@/lib/db/rls";
import { calendarConnections, calendarEntries } from "@/lib/db/schema";

// The owner's view of an aircraft's connections (SYN-1…5), with their own rights (RLS).

export async function listConnections(userId: string, aircraftId: string) {
  return asUser(userId, async (tx) => {
    const connections = await tx
      .select()
      .from(calendarConnections)
      .where(eq(calendarConnections.aircraftId, aircraftId))
      .orderBy(asc(calendarConnections.createdAt));
    const counts = await tx
      .select({
        connectionId: calendarEntries.connectionId,
        busy: sql<number>`(count(*) filter (where ${calendarEntries.active}))::int`,
        conflicts: sql<number>`(count(*) filter (where ${calendarEntries.conflict}))::int`,
      })
      .from(calendarEntries)
      .where(
        and(eq(calendarEntries.aircraftId, aircraftId), isNotNull(calendarEntries.connectionId)),
      )
      .groupBy(calendarEntries.connectionId);
    const conflicts = (await tx.execute(sql`
      select e.id, e.connection_id as "connectionId", lower(e.period) as "from",
        upper(e.period) as "to",
        (select b.booking_id from public.calendar_entries b
         where b.aircraft_id = e.aircraft_id and b.active and b.kind = 'booking'
           and b.period && e.period
         order by lower(b.period) limit 1) as "bookingId"
      from public.calendar_entries e
      where e.aircraft_id = ${aircraftId} and e.conflict
      order by lower(e.period)`)) as unknown as {
      id: string;
      connectionId: string;
      from: string;
      to: string;
      bookingId: string | null;
    }[];
    const byConnection = new Map(counts.map((c) => [c.connectionId, c]));
    return connections.map((c) => ({
      ...c,
      busy: byConnection.get(c.id)?.busy ?? 0,
      conflicts: conflicts
        .filter((x) => x.connectionId === c.id)
        .map((x) => ({ ...x, from: new Date(x.from), to: new Date(x.to) })),
    }));
  });
}

export type ConnectionView = Awaited<ReturnType<typeof listConnections>>[number];
