import "server-only";

import { randomUUID } from "node:crypto";

import { and, count, eq, lt, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { asUser } from "@/lib/db/rls";
import {
  adminActions,
  aircraftDocuments,
  airportClaims,
  defects,
  documents,
  flightLogs,
  flightUplifts,
  logbookSpreads,
  medicals,
  pilotLicences,
  pilotRatings,
} from "@/lib/db/schema";
import { EXTENSIONS, safeFilename, sniffFileType } from "@/lib/files/sniff";
import { getStorage } from "@/lib/storage";
import { DOCUMENT_MAX_BYTES } from "@/lib/validation/pilot";

/** Upper limit per user, so the storage can't be filled by one account. */
export const MAX_DOCUMENTS_PER_USER = 50;

export type UploadError = "invalidType" | "tooLarge" | "tooMany" | "failed";
export type UploadResult =
  { ok: true; id: string; filename: string; sizeBytes: number } | { ok: false; error: UploadError };

/** Store a private document for the user (PDF or image, checked by content). */
export async function saveDocument(userId: string, file: File): Promise<UploadResult> {
  if (file.size > DOCUMENT_MAX_BYTES) return { ok: false, error: "tooLarge" };
  const body = new Uint8Array(await file.arrayBuffer());
  const type = sniffFileType(body);
  if (!type) return { ok: false, error: "invalidType" };

  const existing = await asUser(userId, async (tx) => {
    const [row] = await tx
      .select({ n: count() })
      .from(documents)
      .where(eq(documents.ownerId, userId));
    return row?.n ?? 0;
  });
  if (existing >= MAX_DOCUMENTS_PER_USER) return { ok: false, error: "tooMany" };

  const key = `documents/${userId}/${randomUUID()}.${EXTENSIONS[type]}`;
  const filename = safeFilename(file.name, type);
  const storage = getStorage("private");
  await storage.put(key, body, type);
  try {
    const [row] = await asUser(userId, (tx) =>
      tx
        .insert(documents)
        .values({
          ownerId: userId,
          storageKey: key,
          filename,
          contentType: type,
          sizeBytes: body.length,
        })
        .returning({ id: documents.id }),
    );
    return { ok: true, id: row!.id, filename, sizeBytes: body.length };
  } catch (e) {
    await storage.delete(key).catch(() => undefined);
    throw e;
  }
}

/**
 * Read a document if the viewer may see it (enforced by RLS): its owner, admins, and the other
 * party of a booking for the flight log's photos and receipts.
 * Admin views of other people's documents are written to the audit log.
 */
export async function readDocument(viewerId: string, documentId: string) {
  const found = await asUser(viewerId, async (tx) => {
    const [doc] = await tx.select().from(documents).where(eq(documents.id, documentId));
    if (!doc) return null;
    const [role] = (await tx.execute(
      sql`select public.user_has_role('admin') as admin`,
    )) as unknown as { admin: boolean }[];
    return { doc, admin: Boolean(role?.admin) };
  });
  if (!found) return null;
  const { doc } = found;
  const file = await getStorage("private").get(doc.storageKey);
  if (!file) return null;
  if (doc.ownerId !== viewerId && found.admin) {
    await getDb().insert(adminActions).values({
      adminId: viewerId,
      action: "document.view",
      targetType: "document",
      targetId: doc.id,
    });
  }
  return { doc, body: file.body };
}

const referenced = (id: typeof documents.id) => sql`(
  exists (select 1 from ${pilotLicences} where ${pilotLicences.documentId} = ${id})
  or exists (select 1 from ${pilotRatings} where ${pilotRatings.documentId} = ${id})
  or exists (select 1 from ${medicals} where ${medicals.documentId} = ${id})
  or exists (select 1 from ${aircraftDocuments} where ${aircraftDocuments.documentId} = ${id})
  or exists (select 1 from ${flightLogs} where ${flightLogs.checkoutPhotoId} = ${id})
  or exists (select 1 from ${flightUplifts} where ${flightUplifts.receiptId} = ${id})
  or exists (select 1 from ${defects} where ${defects.photoId} = ${id})
  or exists (select 1 from ${logbookSpreads} where ${logbookSpreads.leftDocumentId} = ${id}
    or ${logbookSpreads.rightDocumentId} = ${id})
  or exists (select 1 from ${airportClaims} where ${airportClaims.documentId} = ${id})
)`;

/** Delete the user's document if no credential or aircraft uses it any more (row and file). */
export async function deleteDocumentIfUnused(userId: string, documentId: string | null) {
  if (!documentId) return;
  const deleted = await asUser(userId, (tx) =>
    tx
      .delete(documents)
      .where(
        and(
          eq(documents.id, documentId),
          eq(documents.ownerId, userId),
          sql`not ${referenced(documents.id)}`,
        ),
      )
      .returning({ storageKey: documents.storageKey }),
  );
  for (const { storageKey } of deleted) {
    await getStorage("private")
      .delete(storageKey)
      .catch((e) => console.warn("[documents] couldn't delete file", e));
  }
}

/**
 * Remove uploads that were never attached to a credential or aircraft (e.g. the form was
 * abandoned).
 * Trusted code (daily job): uses the owner connection.
 */
export async function deleteOrphanDocuments(olderThan: Date): Promise<number> {
  const deleted = await getDb()
    .delete(documents)
    .where(and(lt(documents.createdAt, olderThan), sql`not ${referenced(documents.id)}`))
    .returning({ storageKey: documents.storageKey });
  for (const { storageKey } of deleted) {
    await getStorage("private")
      .delete(storageKey)
      .catch((e) => console.warn("[documents] couldn't delete file", e));
  }
  return deleted.length;
}

/** All of a user's document files (used when the account is deleted). */
export async function deleteAllDocumentFiles(userId: string) {
  const rows = await getDb()
    .select({ storageKey: documents.storageKey })
    .from(documents)
    .where(eq(documents.ownerId, userId));
  for (const { storageKey } of rows) {
    await getStorage("private")
      .delete(storageKey)
      .catch((e) => console.warn("[documents] couldn't delete file", e));
  }
}
