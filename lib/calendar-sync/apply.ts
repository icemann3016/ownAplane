import "server-only";

import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

import { getDb, type Tx } from "@/lib/db";
import { aircraft, calendarConnections, calendarEntries, notifications } from "@/lib/db/schema";
import { type ExternalEvent, rangeOf } from "./events";
import { importFields } from "./fields";
import { type Incoming, prepareIncoming, type Skipped } from "./incoming";

// Stores another system's busy times (SYN-1, SYN-4, SYN-5). Trusted code (owner connection):
// callers checked the connection (the owner's own, a valid API key, or the sync job). Each busy
// time is written as an active calendar entry when the time is free; the exclusion constraint
// decides, so this is safe against concurrent bookings. Otherwise it's kept inactive: as a
// conflict if an ownAplane booking is in the way (the owner is notified), else as "covered"
// (the owner already blocked that time). A database trigger activates it once that is released.
// What else is kept (title, maintenance, tentative, registration) is the owner's choice.

/** active = blocks the aircraft; covered = already blocked by the owner; conflict = SYN-5. */
export type EventStatus = "active" | "covered" | "conflict" | Skipped;

type Existing = {
  id: string;
  externalId: string;
  from: Date;
  to: Date;
  active: boolean;
  conflict: boolean;
  kind: string;
  note: string | null;
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
  { event, kind, note }: Incoming,
  prev: Existing | undefined,
): Promise<{ status: EventStatus; bookingId: string | null }> {
  const values = { period: rangeOf(event), kind, note };
  const write = (db: Tx, extra: { active: boolean; conflict: boolean }) =>
    prev
      ? db
          .update(calendarEntries)
          .set({ ...values, ...extra })
          .where(eq(calendarEntries.id, prev.id))
      : db.insert(calendarEntries).values({
          aircraftId: conn.aircraftId,
          connectionId: conn.id,
          externalId: event.id,
          ...values,
          ...extra,
        });
  try {
    await tx.transaction(async (sp) => {
      await write(sp, { active: true, conflict: false });
    });
    return { status: "active", bookingId: null };
  } catch (e) {
    if (pgCode(e) !== EXCLUSION_VIOLATION) throw e;
  }
  const bookingId = await bookingInTheWay(tx, conn.aircraftId, event);
  await write(tx, { active: false, conflict: bookingId !== null });
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
 * Events must come from normalizeEvents(). Skipped ones (tentative, another aircraft) are
 * removed if they were stored before.
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
        importFields: calendarConnections.importFields,
        ownerId: aircraft.ownerId,
        registration: aircraft.registration,
      })
      .from(calendarConnections)
      .innerJoin(aircraft, eq(aircraft.id, calendarConnections.aircraftId))
      .where(eq(calendarConnections.id, connectionId))
      .for("update", { of: calendarConnections });
    if (!conn) throw new Error("calendar connection not found");

    const { keep, skipped } = prepareIncoming(
      events,
      importFields(conn.importFields),
      conn.registration,
    );
    const ids = keep.map((k) => k.event.id);
    const byConnection = eq(calendarEntries.connectionId, connectionId);
    // First free the time of busy times that are gone or now skipped, so changed ones fit.
    const gone =
      mode === "replace"
        ? await tx
            .delete(calendarEntries)
            .where(
              and(
                byConnection,
                ids.length ? notInArray(calendarEntries.externalId, ids) : undefined,
              ),
            )
            .returning({ id: calendarEntries.id })
        : skipped.size
          ? await tx
              .delete(calendarEntries)
              .where(and(byConnection, inArray(calendarEntries.externalId, [...skipped.keys()])))
              .returning({ id: calendarEntries.id })
          : [];

    const existing = ids.length
      ? ((await tx
          .select({
            id: calendarEntries.id,
            externalId: calendarEntries.externalId,
            from: sql<string>`lower(${calendarEntries.period})`,
            to: sql<string>`upper(${calendarEntries.period})`,
            active: calendarEntries.active,
            conflict: calendarEntries.conflict,
            kind: calendarEntries.kind,
            note: calendarEntries.note,
          })
          .from(calendarEntries)
          .where(and(byConnection, inArray(calendarEntries.externalId, ids)))) as unknown as (Omit<
          Existing,
          "from" | "to"
        > & { from: string; to: string })[])
      : [];
    const byId = new Map<string, Existing>(
      existing.map((e) => [e.externalId, { ...e, from: new Date(e.from), to: new Date(e.to) }]),
    );

    const statuses = new Map<string, EventStatus>(skipped);
    const newConflicts = new Set<string>();
    for (const item of keep) {
      const { event } = item;
      const prev = byId.get(event.id);
      const samePeriod =
        prev &&
        prev.from.getTime() === event.from.getTime() &&
        prev.to.getTime() === event.to.getTime();
      if (samePeriod && prev.active && prev.kind === item.kind && prev.note === item.note) {
        statuses.set(event.id, "active");
        continue;
      }
      const { status, bookingId } = await place(tx, conn, item, prev);
      statuses.set(event.id, status);
      if (status === "conflict" && bookingId && !(samePeriod && prev.conflict)) {
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
    return { statuses, removed: gone.length, conflicts };
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
