import "server-only";

import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { type Done, refusal } from "@/lib/bookings/outcome";
import { asUser } from "@/lib/db/rls";
import { aircraft, calendarEntries, meterReadings } from "@/lib/db/schema";
import { toRange } from "@/lib/domain/time";
import { pgError } from "./manage";

// Day-to-day owner operations on an aircraft (SRC-5, BKG-7, BKG-8, BKG-15): calendar blocks,
// grounding, fixed defects, known items and meter readings. Shared by the website and the API;
// RLS and the database functions decide what the owner may do.

export type CalendarBlock = {
  kind: "owner_use" | "maintenance" | "unavailable";
  from: Date;
  to: Date;
  note: string | null;
};

/** Block time (UTC); refused when it overlaps (`overlaps`) or is too long (`too_long`). */
export async function addCalendarBlock(
  userId: string,
  aircraftId: string,
  block: CalendarBlock,
): Promise<Done<{ id: string }>> {
  if (block.to <= block.from) return { ok: false, error: "endBeforeStart", field: "to" };
  const own = await asUser(userId, async (tx) => {
    const [row] = await tx
      .select({ id: aircraft.id })
      .from(aircraft)
      .where(and(eq(aircraft.id, aircraftId), eq(aircraft.ownerId, userId)));
    return row;
  });
  if (!own) return { ok: false, error: "not_found" };
  try {
    const [row] = await asUser(userId, (tx) =>
      tx
        .insert(calendarEntries)
        .values({
          aircraftId,
          kind: block.kind,
          note: block.note,
          period: toRange(block.from, block.to),
        })
        .returning({ id: calendarEntries.id }),
    );
    return { ok: true, id: row!.id };
  } catch (e) {
    const { code } = pgError(e);
    if (code === "23P01") return { ok: false, error: "overlaps" };
    if (code === "23514") return { ok: false, error: "too_long", field: "to" };
    throw e;
  }
}

/** Remove one of the owner's blocks (bookings are released by the booking flow). */
export async function deleteCalendarBlock(
  userId: string,
  aircraftId: string,
  id: string,
): Promise<Done> {
  const deleted = await asUser(userId, (tx) =>
    tx
      .delete(calendarEntries)
      .where(
        and(
          eq(calendarEntries.id, id),
          eq(calendarEntries.aircraftId, aircraftId),
          ne(calendarEntries.kind, "booking"),
        ),
      )
      .returning({ id: calendarEntries.id }),
  );
  return deleted.length ? { ok: true } : { ok: false, error: "not_found" };
}

/** Ground the aircraft: no bookings, acceptances or check-outs until it's listed again. */
export async function groundAircraft(userId: string, aircraftId: string): Promise<Done> {
  const rows = await asUser(userId, (tx) =>
    tx
      .update(aircraft)
      .set({ status: "grounded" })
      .where(
        and(
          eq(aircraft.id, aircraftId),
          eq(aircraft.ownerId, userId),
          inArray(aircraft.status, ["listed", "paused", "unlisted"]),
        ),
      )
      .returning({ id: aircraft.id }),
  );
  return rows.length ? { ok: true } : { ok: false, error: "not_allowed" };
}

async function run(userId: string, query: ReturnType<typeof sql>): Promise<Done> {
  try {
    await asUser(userId, (tx) => tx.execute(query));
    return { ok: true };
  } catch (e) {
    return refusal(e);
  }
}

/** The owner marks a defect as fixed, with an optional note (BKG-8). */
export const resolveDefect = (userId: string, defectId: string, note: string) =>
  run(userId, sql`select public.resolve_defect(${defectId}::uuid, ${note})`);

/** The owner marks an aircraft remark as a known item, or as fixed (BKG-15). */
export const setKnownItem = (userId: string, remarkId: string, state: "known" | "resolved") =>
  run(userId, sql`select public.set_known_item(${remarkId}::uuid, ${state})`);

export type MeterReading = {
  readAt: Date;
  hobbs: number | null;
  tach: number | null;
  note: string | null;
};

/** Record Hobbs/tach between rentals (BKG-7), e.g. after flying outside ownAplane. */
export async function addMeterReading(
  userId: string,
  aircraftId: string,
  r: MeterReading,
): Promise<Done<{ id: string }>> {
  try {
    const [row] = await asUser(userId, (tx) =>
      tx
        .insert(meterReadings)
        .values({ aircraftId, ...r })
        .returning({ id: meterReadings.id }),
    );
    return { ok: true, id: row!.id };
  } catch (e) {
    const err = e as { cause?: { code?: string; message?: string } };
    if (err.cause?.message === "reading_in_future") {
      return { ok: false, error: "reading_in_future", field: "readAt" };
    }
    if (err.cause?.code === "42501") return { ok: false, error: "not_found" };
    throw e;
  }
}

/** Remove a reading recorded by mistake. */
export async function deleteMeterReading(
  userId: string,
  aircraftId: string,
  id: string,
): Promise<Done> {
  const deleted = await asUser(userId, (tx) =>
    tx
      .delete(meterReadings)
      .where(and(eq(meterReadings.id, id), eq(meterReadings.aircraftId, aircraftId)))
      .returning({ id: meterReadings.id }),
  );
  return deleted.length ? { ok: true } : { ok: false, error: "not_found" };
}

/**
 * Show a listed aircraft first in search, labelled "Featured" (SUB-10); beyond the plan's
 * featured spots: `plan_limit` with the limit.
 */
export async function setFeatured(userId: string, aircraftId: string, on: boolean): Promise<Done> {
  try {
    const rows = await asUser(userId, (tx) =>
      tx
        .update(aircraft)
        .set({ featured: on })
        .where(and(eq(aircraft.id, aircraftId), eq(aircraft.ownerId, userId)))
        .returning({ id: aircraft.id }),
    );
    return rows.length ? { ok: true } : { ok: false, error: "not_found" };
  } catch (e) {
    const { message, detail } = pgError(e);
    if (message === "plan_limit") {
      return { ok: false, error: "plan_limit", limit: Number(detail?.split(":")[1] ?? 0) };
    }
    throw e;
  }
}
