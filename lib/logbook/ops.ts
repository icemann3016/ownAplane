import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { type Done, refusal } from "@/lib/bookings/outcome";
import { asUser } from "@/lib/db/rls";
import { type LogbookEntry, logbookEntries } from "@/lib/db/schema";
import type { LogbookEntryInput } from "@/lib/validation/logbook";

// Changes to the pilot's logbook (LOG-1…3), shared by the website and the API. Drafts change
// freely; certified entries only through certify / correct / strike through (database
// functions), never edited or deleted.

/** A new draft; with `correctsId` it corrects one of the pilot's certified entries. */
export async function createEntry(
  userId: string,
  values: LogbookEntryInput,
  correctsId: string | null = null,
  source: "manual" | "scan" = "manual",
): Promise<Done<{ id: string }>> {
  try {
    const [row] = await asUser(userId, (tx) =>
      tx
        .insert(logbookEntries)
        .values({ ...values, pilotId: userId, source, correctsId })
        .returning({ id: logbookEntries.id }),
    );
    return { ok: true, id: row!.id };
  } catch (e) {
    return refusal(e);
  }
}

/** Change a draft (anything else: `not_editable`). */
export async function updateEntry(
  userId: string,
  id: string,
  values: LogbookEntryInput,
): Promise<Done> {
  try {
    const { kind: _kind, ...rest } = values;
    const rows = await asUser(userId, (tx) =>
      tx
        .update(logbookEntries)
        .set(rest)
        .where(and(eq(logbookEntries.id, id), eq(logbookEntries.status, "draft")))
        .returning({ id: logbookEntries.id }),
    );
    return rows.length ? { ok: true } : { ok: false, error: "not_editable" };
  } catch (e) {
    return refusal(e);
  }
}

/** Delete a draft (certified entries are struck through instead). */
export async function deleteEntry(userId: string, id: string): Promise<Done> {
  try {
    const rows = await asUser(userId, (tx) =>
      tx
        .delete(logbookEntries)
        .where(and(eq(logbookEntries.id, id), eq(logbookEntries.status, "draft")))
        .returning({ id: logbookEntries.id }),
    );
    return rows.length ? { ok: true } : { ok: false, error: "not_editable" };
  } catch (e) {
    return refusal(e);
  }
}

/**
 * Certify drafts, all or nothing: refused with `incomplete` (and the ids missing something),
 * `date_in_future` or `already_corrected`.
 */
export async function certifyEntries(
  userId: string,
  ids: string[],
): Promise<Done<{ count: number }> & { incomplete?: string[] }> {
  if (!ids.length) return { ok: true, count: 0 };
  const drafts = await asUser(userId, (tx) =>
    tx
      .select()
      .from(logbookEntries)
      .where(and(eq(logbookEntries.status, "draft"), inArray(logbookEntries.id, ids))),
  );
  const incomplete = drafts.filter((d) => missingFields(d).length > 0).map((d) => d.id);
  if (incomplete.length) return { ok: false, error: "incomplete", incomplete };
  try {
    const [row] = (await asUser(userId, (tx) =>
      tx.execute(
        sql`select public.certify_logbook_entries(array[${sql.join(
          ids.map((id) => sql`${id}`),
          sql`, `,
        )}]::uuid[]) as n`,
      ),
    )) as unknown as { n: number }[];
    return { ok: true, count: row?.n ?? 0 };
  } catch (e) {
    return refusal(e);
  }
}

/** What a draft still needs before it can be certified (field names). Pure. */
export function missingFields(e: Pick<LogbookEntry, keyof LogbookEntry>): string[] {
  const needed =
    e.kind === "flight"
      ? ([
          "departurePlace",
          "arrivalPlace",
          "aircraftType",
          "registration",
          "totalMinutes",
          "picName",
        ] as const)
      : e.kind === "fstd"
        ? (["fstdType", "fstdMinutes"] as const)
        : ([] as const);
  return needed.filter((f) => e[f] == null);
}

/** Strike a certified entry through with a reason (no replacement). */
export async function voidEntry(userId: string, id: string, reason: string): Promise<Done> {
  try {
    await asUser(userId, (tx) =>
      tx.execute(sql`select public.void_logbook_entry(${id}::uuid, ${reason})`),
    );
    return { ok: true };
  } catch (e) {
    return refusal(e);
  }
}

/** An entry's values for a correction form or draft. Pure. */
export function entryValues(e: LogbookEntry): LogbookEntryInput {
  return {
    kind: e.kind,
    date: e.date,
    departurePlace: e.departurePlace,
    departureTime: e.departureTime?.slice(0, 5) ?? null,
    arrivalPlace: e.arrivalPlace,
    arrivalTime: e.arrivalTime?.slice(0, 5) ?? null,
    aircraftType: e.aircraftType,
    registration: e.registration,
    seMinutes: e.seMinutes,
    meMinutes: e.meMinutes,
    mpMinutes: e.mpMinutes,
    totalMinutes: e.totalMinutes,
    picName: e.picName,
    landingsDay: e.landingsDay,
    landingsNight: e.landingsNight,
    nightMinutes: e.nightMinutes,
    ifrMinutes: e.ifrMinutes,
    picMinutes: e.picMinutes,
    copilotMinutes: e.copilotMinutes,
    dualMinutes: e.dualMinutes,
    instructorMinutes: e.instructorMinutes,
    fstdType: e.fstdType,
    fstdMinutes: e.fstdMinutes,
    remarks: e.remarks,
  };
}
