import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { getProfileAndRoles } from "@/lib/account/profile";
import type { Done, Fail } from "@/lib/bookings/outcome";
import { asUser } from "@/lib/db/rls";
import {
  aircraft,
  aircraftDocuments,
  aircraftPhotos,
  type AircraftStatus,
  bookings,
} from "@/lib/db/schema";
import { deleteDocumentIfUnused } from "@/lib/documents";
import { STATUS_ACTIONS } from "./catalog";
import { deletePhotoFiles } from "./photos";

// An owner's aircraft (LST-1…7): create, change, list/pause/unlist and delete, shared by the
// website's forms and the API. RLS limits everything to the owner's own aircraft; the database
// checks listings (aircraft_listing_gaps) and registrations.

export type AircraftValues = Partial<typeof aircraft.$inferInsert>;

/** Postgres error code and detail of a failed query (drizzle wraps the driver error). */
export function pgError(e: unknown): { code?: string; detail?: string; message?: string } {
  type Pg = { code?: string; detail?: string; message?: string };
  const err = e as Pg & { cause?: Pg };
  return {
    code: err.cause?.code ?? err.code,
    detail: err.cause?.detail ?? err.detail,
    message: err.cause?.message ?? err.message,
  };
}

/** Constraint errors the owner can fix: a taken registration or an unknown home airfield. */
function constraintFail(e: unknown): Fail {
  const { code } = pgError(e);
  if (code === "23505") return { ok: false, error: "registration_taken", field: "registration" };
  if (code === "23503") return { ok: false, error: "unknown_airfield", field: "homeAirport" };
  throw e;
}

/** A new draft (step 1 of a listing). Only owners add aircraft. */
export async function createAircraft(
  userId: string,
  values: AircraftValues & Pick<typeof aircraft.$inferInsert, "registration">,
): Promise<Done<{ id: string }>> {
  const roles = (await getProfileAndRoles(userId))?.roles ?? [];
  if (!roles.includes("owner")) return { ok: false, error: "owner_role_needed" };
  try {
    const [row] = await asUser(userId, (tx) =>
      tx
        .insert(aircraft)
        .values({ ...values, ownerId: userId } as typeof aircraft.$inferInsert)
        .returning({ id: aircraft.id }),
    );
    return { ok: true, id: row!.id };
  } catch (e) {
    return constraintFail(e);
  }
}

/** Change some fields of the user's aircraft; returns its status. */
export async function updateAircraft(
  userId: string,
  id: string,
  values: AircraftValues,
): Promise<Done<{ status: AircraftStatus }>> {
  try {
    const rows = await asUser(userId, (tx) =>
      tx
        .update(aircraft)
        .set(values)
        .where(and(eq(aircraft.id, id), eq(aircraft.ownerId, userId)))
        .returning({ status: aircraft.status }),
    );
    return rows[0] ? { ok: true, status: rows[0].status } : { ok: false, error: "not_found" };
  } catch (e) {
    return constraintFail(e);
  }
}

/**
 * List, pause or unlist (LST-7). Refused: a move the status doesn't allow (`not_allowed`), a
 * listing that misses something (`not_ready`, with what), one an admin blocked (`blocked`), a
 * registration already listed by someone else (`registration_taken`).
 */
export async function setAircraftStatus(
  userId: string,
  id: string,
  status: "listed" | "paused" | "unlisted",
): Promise<Done> {
  const current = await asUser(userId, async (tx) => {
    const [row] = await tx
      .select({ status: aircraft.status })
      .from(aircraft)
      .where(and(eq(aircraft.id, id), eq(aircraft.ownerId, userId)));
    return row?.status;
  });
  if (!current) return { ok: false, error: "not_found" };
  if (!STATUS_ACTIONS[current].includes(status)) return { ok: false, error: "not_allowed" };
  try {
    await asUser(userId, (tx) =>
      tx
        .update(aircraft)
        .set({ status })
        .where(and(eq(aircraft.id, id), eq(aircraft.ownerId, userId))),
    );
    return { ok: true };
  } catch (e) {
    const { code, detail, message } = pgError(e);
    // Beyond the plan's listed aircraft (SUB-3): detail "aircraft:<limit>".
    if (message === "plan_limit") {
      return { ok: false, error: "plan_limit", limit: Number(detail?.split(":")[1] ?? 0) };
    }
    if (code === "23514" && detail)
      return { ok: false, error: "not_ready", missing: detail.split(",") };
    if (code === "23514") return { ok: false, error: "blocked" };
    if (code === "23505") return { ok: false, error: "registration_taken" };
    throw e;
  }
}

/** Delete an aircraft with its photos and documents; not while bookings are open. */
export async function deleteAircraft(userId: string, id: string): Promise<Done> {
  // Pilots rely on upcoming bookings: those have to be cancelled first.
  const upcoming = await asUser(userId, (tx) =>
    tx
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(
          eq(bookings.aircraftId, id),
          inArray(bookings.status, ["requested", "accepted", "in_progress"]),
        ),
      )
      .limit(1),
  );
  if (upcoming.length) return { ok: false, error: "has_bookings" };
  const removed = await asUser(userId, async (tx) => {
    const photos = await tx
      .select({ key: aircraftPhotos.storageKey })
      .from(aircraftPhotos)
      .where(eq(aircraftPhotos.aircraftId, id));
    const docs = await tx
      .select({ documentId: aircraftDocuments.documentId })
      .from(aircraftDocuments)
      .where(eq(aircraftDocuments.aircraftId, id));
    const deleted = await tx
      .delete(aircraft)
      .where(and(eq(aircraft.id, id), eq(aircraft.ownerId, userId)))
      .returning({ id: aircraft.id });
    return deleted.length
      ? { photos: photos.map((p) => p.key), documentIds: docs.map((d) => d.documentId) }
      : null;
  });
  if (!removed) return { ok: false, error: "not_found" };
  await deletePhotoFiles(removed.photos);
  for (const documentId of new Set(removed.documentIds)) {
    await deleteDocumentIfUnused(userId, documentId);
  }
  return { ok: true };
}
