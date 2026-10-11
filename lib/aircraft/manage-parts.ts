import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import type { Done } from "@/lib/bookings/outcome";
import type { Tx } from "@/lib/db";
import { asUser } from "@/lib/db/rls";
import {
  aircraft,
  type AircraftDocumentKind,
  aircraftDocuments,
  aircraftPhotos,
  type AircraftStatus,
  rentalRequirements,
} from "@/lib/db/schema";
import { deleteDocumentIfUnused } from "@/lib/documents";
import { isVerifiedKind } from "./catalog";
import { pgError } from "./manage";
import { deletePhotoFiles } from "./photos";

// Parts of an owner's aircraft (LST-3, LST-6, LST-8, RAT-6/7): rental requirements, documents
// and photos, shared by the website and the API.

class Refused extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function ownStatus(tx: Tx, userId: string, aircraftId: string) {
  const [own] = await tx
    .select({ status: aircraft.status })
    .from(aircraft)
    .where(and(eq(aircraft.id, aircraftId), eq(aircraft.ownerId, userId)));
  return own?.status ?? null;
}

export type Requirements = Omit<typeof rentalRequirements.$inferInsert, "aircraftId">;

/** Who may rent the aircraft; returns its status (drafts end their setup here). */
export async function saveRequirements(
  userId: string,
  aircraftId: string,
  data: Requirements,
): Promise<Done<{ status: AircraftStatus }>> {
  const status = await asUser(userId, async (tx) => {
    const own = await ownStatus(tx, userId, aircraftId);
    if (!own) return null;
    await tx
      .insert(rentalRequirements)
      .values({ aircraftId, ...data })
      .onConflictDoUpdate({ target: rentalRequirements.aircraftId, set: data });
    return own;
  });
  return status ? { ok: true, status } : { ok: false, error: "not_found" };
}

/**
 * A listed aircraft must keep a valid, verified ARC and insurance: renewals are added as new
 * documents (the old one counts until the new one is verified).
 */
async function assertStillListable(tx: Tx, aircraftId: string, code: string) {
  const [row] = (await tx.execute(sql`
    select a.status, public.aircraft_listing_gaps(a.id) as gaps
    from ${aircraft} a where a.id = ${aircraftId}`)) as unknown as {
    status: string;
    gaps: string[];
  }[];
  if (row?.status === "listed" && row.gaps.some((g) => g === "arc" || g === "insurance")) {
    throw new Refused(code);
  }
}

export type AircraftDocumentInput = {
  kind: AircraftDocumentKind;
  title: string | null;
  expiresOn: string | null;
  documentId: string;
};

/**
 * Add (no id) or change a document of the user's aircraft. CofA, ARC and insurance wait for an
 * admin. Refused: `not_found`, `document_invalid` (not the user's upload), `add_renewal`
 * (changing it would leave a listed aircraft without a valid ARC or insurance).
 */
export async function saveAircraftDocument(
  userId: string,
  aircraftId: string,
  id: string | null,
  input: AircraftDocumentInput,
): Promise<Done<{ id: string }>> {
  const { kind, title, expiresOn, documentId } = input;
  let replaced: string | null = null;
  let savedId: string;
  try {
    savedId = await asUser(userId, async (tx) => {
      if (!(await ownStatus(tx, userId, aircraftId))) throw new Refused("not_found");
      if (id) {
        const mine = and(
          eq(aircraftDocuments.id, id),
          eq(aircraftDocuments.aircraftId, aircraftId),
        );
        const [existing] = await tx
          .select({ documentId: aircraftDocuments.documentId })
          .from(aircraftDocuments)
          .where(mine);
        if (!existing) throw new Refused("not_found");
        await tx.update(aircraftDocuments).set({ title, expiresOn, documentId }).where(mine);
        if (existing.documentId !== documentId) replaced = existing.documentId;
        await assertStillListable(tx, aircraftId, "add_renewal");
        return id;
      }
      const [row] = await tx
        .insert(aircraftDocuments)
        .values({
          aircraftId,
          kind,
          title,
          expiresOn,
          documentId,
          status: isVerifiedKind(kind) ? "pending" : null,
        })
        .returning({ id: aircraftDocuments.id });
      return row!.id;
    });
  } catch (e) {
    if (e instanceof Refused) return { ok: false, error: e.code };
    if (pgError(e).code === "42501") {
      return { ok: false, error: "document_invalid", field: "documentId" };
    }
    throw e;
  }
  await deleteDocumentIfUnused(userId, replaced);
  return { ok: true, id: savedId };
}

/** Delete an aircraft document and its file (if nothing else uses it). */
export async function deleteAircraftDocument(
  userId: string,
  aircraftId: string,
  id: string,
): Promise<Done> {
  let deleted: { documentId: string }[];
  try {
    deleted = await asUser(userId, async (tx) => {
      const rows = await tx
        .delete(aircraftDocuments)
        .where(and(eq(aircraftDocuments.id, id), eq(aircraftDocuments.aircraftId, aircraftId)))
        .returning({ documentId: aircraftDocuments.documentId });
      await assertStillListable(tx, aircraftId, "cant_delete_listed");
      return rows;
    });
  } catch (e) {
    if (e instanceof Refused) return { ok: false, error: e.code };
    throw e;
  }
  if (!deleted.length) return { ok: false, error: "not_found" };
  for (const row of deleted) await deleteDocumentIfUnused(userId, row.documentId);
  return { ok: true };
}

/** Save the photos' order (the first one is the cover). RLS limits it to the owner's photos. */
export async function reorderPhotos(userId: string, aircraftId: string, order: string[]) {
  await asUser(userId, async (tx) => {
    const cases = sql.join(
      order.map((id, i) => sql`when ${id}::uuid then ${i}::int`),
      sql` `,
    );
    await tx
      .update(aircraftPhotos)
      .set({ sortOrder: sql`case ${aircraftPhotos.id} ${cases} end` })
      .where(and(eq(aircraftPhotos.aircraftId, aircraftId), inArray(aircraftPhotos.id, order)));
  });
}

/** Delete one photo (row and file). A listed aircraft keeps at least one photo (LST-3). */
export async function deletePhoto(
  userId: string,
  aircraftId: string,
  photoId: string,
): Promise<Done> {
  const deleted = await asUser(userId, async (tx) => {
    const own = await ownStatus(tx, userId, aircraftId);
    if (!own) return [];
    if (own === "listed") {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(aircraftPhotos)
        .where(eq(aircraftPhotos.aircraftId, aircraftId));
      if ((row?.n ?? 0) <= 1) return null;
    }
    return tx
      .delete(aircraftPhotos)
      .where(and(eq(aircraftPhotos.id, photoId), eq(aircraftPhotos.aircraftId, aircraftId)))
      .returning({ storageKey: aircraftPhotos.storageKey });
  });
  if (deleted === null) return { ok: false, error: "last_photo" };
  if (!deleted.length) return { ok: false, error: "not_found" };
  await deletePhotoFiles(deleted.map((d) => d.storageKey));
  return { ok: true };
}
