import "server-only";

import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

import { getDb, type Tx } from "@/lib/db";
import { aircraft, calendarConnections, calendarEntries, notifications } from "@/lib/db/schema";
import { type ExternalEvent, rangeOf } from "./events";

// Stores another system's busy times (SYN-1, SYN-4, SYN-5). Trusted code (owner connection):
// callers checked the connection (the owner's own, a valid API key, or the sync job). Each busy
// time is written as an active calendar entry when the time is free; the exclusion constraint
// decides, so this is safe against concurrent bookings. Otherwise it's kept inactive: as a
// conflict if an ownAplane booking is in the way (the owner is notified), else as "covered"
// (the owner already blocked that time). A database trigger activates it once that is released.

/** active = blocks the aircraft; covered = already blocked by the owner; conflict = see SYN-5. */
export type EventStatus = "active" | "covered" | "conflict";

type Existing = {
  id: string;
  externalId: string;
  from: Date;
  to: Date;
  active: boolean;
  conflict: boolean;
};

const EXCLUSION_VIOLATION = "23P01";
const pgCode = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err.cause?.code ?? err.code;
};

/** The ownAplane booking an entry of this aircraft would overlap, if any. */
async function bookingInTheWay(tx: Tx, aircraftId: string, event: ExternalEvent) {
  const [row] = (await tx.execute(sql`
    select booking_id from public.calendar_entries
    where aircraft_id = ${aircraftId} and active and kind = 'booking'
      and period && ${rangeOf(event)}::tstzrange
    order by lower(period) limit 1`)) as unknown as { booking_id: string }[];
  return row?.booking_id ?? null;
}

async function place(
  tx: Tx,
  conn: { id: string; aircraftId: string },
  event: ExternalEvent,
  prev: Existing | undefined,
): Promise<{ status: EventStatus; bookingId: string | null }> {
  const period = rangeOf(event);
  try {
    await tx.transaction(async (sp) => {
      if (prev) {
        await sp
          .update(calendarEntries)
          .set({ period, active: true, conflict: false })
          .where(eq(calendarEntries.id, prev.id));
      } else {
        await sp.insert(calendarEntries).values({
          aircraftId: conn.aircraftId,
          kind: "unavailable",
          connectionId: conn.id,
          externalId: event.id,
          period,
        });
      }
    });
    return { status: "active", bookingId: null };
  } catch (e) {
    if (pgCode(e) !== EXCLUSION_VIOLATION) throw e;
  }
  const bookingId = await bookingInTheWay(tx, conn.aircraftId, event);
  const held = { period, active: false, conflict: bookingId !== null };
  if (prev) {
    await tx.update(calendarEntries).set(held).where(eq(calendarEntries.id, prev.id));
  } else {
    await tx.insert(calendarEntries).values({
      aircraftId: conn.aircraftId,
      kind: "unavailable",
      connectionId: conn.id,
      externalId: event.id,
      ...held,
    });
  }
  return { status: bookingId ? "conflict" : "covered", bookingId };
}

export type ApplyResult = {
  statuses: Map<string, EventStatus>;
  removed: number;
  conflicts: number;
};

/**
 * Write a connection's busy times. `replace`: the events are everything the other system has
 * (a feed or a full push), so stored ones that are missing are removed. `upsert`: only these.
 * Events must come from normalizeEvents().
 */
export async function applyEvents(
  connectionId: string,
  events: ExternalEvent[],
  mode: "replace" | "upsert",
): Promise<ApplyResult> {
  return getDb().transaction(async (tx) => {
    // One sync per connection at a time.
    const [conn] = await tx
      .select({
        id: calendarConnections.id,
        aircraftId: calendarConnections.aircraftId,
        ownerId: aircraft.ownerId,
      })
      .from(calendarConnections)
      .innerJoin(aircraft, eq(aircraft.id, calendarConnections.aircraftId))
      .where(eq(calendarConnections.id, connectionId))
      .for("update", { of: calendarConnections });
    if (!conn) throw new Error("calendar connection not found");

    const ids = events.map((e) => e.id);
    const existing = (await tx
      .select({
        id: calendarEntries.id,
        externalId: calendarEntries.externalId,
        from: sql<string>`lower(${calendarEntries.period})`,
        to: sql<string>`upper(${calendarEntries.period})`,
        active: calendarEntries.active,
        conflict: calendarEntries.conflict,
      })
      .from(calendarEntries)
      .where(
        and(
          eq(calendarEntries.connectionId, connectionId),
          mode === "upsert" && ids.length ? inArray(calendarEntries.externalId, ids) : undefined,
        ),
      )) as unknown as (Omit<Existing, "from" | "to"> & { from: string; to: string })[];
    const byId = new Map<string, Existing>(
      existing.map((e) => [e.externalId, { ...e, from: new Date(e.from), to: new Date(e.to) }]),
    );

    let removed = 0;
    if (mode === "replace") {
      // First free the time of busy times that are gone, so changed ones can take their place.
      const gone = await tx
        .delete(calendarEntries)
        .where(
          and(
            eq(calendarEntries.connectionId, connectionId),
            ids.length ? notInArray(calendarEntries.externalId, ids) : undefined,
          ),
        )
        .returning({ id: calendarEntries.id });
      removed = gone.length;
    }

    const statuses = new Map<string, EventStatus>();
    const newConflicts = new Set<string>();
    for (const event of events) {
      const prev = byId.get(event.id);
      const same =
        prev &&
        prev.from.getTime() === event.from.getTime() &&
        prev.to.getTime() === event.to.getTime();
      if (same && prev.active) {
        statuses.set(event.id, "active");
        continue;
      }
      const { status, bookingId } = await place(tx, conn, event, prev);
      statuses.set(event.id, status);
      if (status === "conflict" && bookingId && !(same && prev.conflict)) {
        newConflicts.add(bookingId);
      }
    }

    // SYN-5: tell the owner at once (in the app and by email, like booking updates).
    if (newConflicts.size) {
      await tx.insert(notifications).values(
        [...newConflicts].map((bookingId) => ({
          userId: conn.ownerId,
          type: "calendar_conflict",
          bookingId,
        })),
      );
    }
    const conflicts = [...statuses.values()].filter((s) => s === "conflict").length;
    return { statuses, removed, conflicts };
  });
}

/** Remove one pushed busy time; false if there was none with that id. */
export async function removeEvent(connectionId: string, externalId: string): Promise<boolean> {
  const rows = await getDb()
    .delete(calendarEntries)
    .where(
      and(
        eq(calendarEntries.connectionId, connectionId),
        eq(calendarEntries.externalId, externalId),
      ),
    )
    .returning({ id: calendarEntries.id });
  return rows.length > 0;
}
