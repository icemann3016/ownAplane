import "server-only";

import { and, eq } from "drizzle-orm";

import { asUser } from "@/lib/db/rls";
import {
  experienceByType,
  medicals,
  pilotExperience,
  pilotLicences,
  pilotRatings,
} from "@/lib/db/schema";
import { deleteDocumentIfUnused } from "@/lib/documents";
import type { CredentialKind } from "./labels";

// Changes to a pilot's own credentials (VER-1…3), shared by the website's forms and the API.
// RLS makes sure it's their own row and their own document; the database sends a verified item
// back to "pending" when it changes.

const tables = { licence: pilotLicences, rating: pilotRatings, medical: medicals } as const;

/** Postgres error code of a failed query (drizzle wraps the driver error). */
function pgCode(e: unknown): string | undefined {
  const err = e as { code?: string; cause?: { code?: string } };
  return err.cause?.code ?? err.code;
}

export type CredentialSaved =
  { ok: true; id: string } | { ok: false; error: "notFound" | "documentInvalid" };

class NotFound extends Error {}

/** Insert (no id) or update one credential of the user. */
export async function saveCredential(
  userId: string,
  kind: CredentialKind,
  id: string | undefined,
  data: Record<string, unknown> & { documentId: string | null },
): Promise<CredentialSaved> {
  // The three tables share id, user_id and document_id; drizzle maps the other columns from the
  // real table at runtime, so typing it as one of them is safe here.
  const table = tables[kind] as typeof pilotLicences;
  const values = data as Partial<typeof pilotLicences.$inferInsert>;
  let replacedDocument: string | null = null;
  let savedId: string;
  try {
    savedId = await asUser(userId, async (tx) => {
      const mine = id ? and(eq(table.id, id), eq(table.userId, userId)) : undefined;
      if (mine) {
        const [existing] = await tx
          .select({ documentId: table.documentId })
          .from(table)
          .where(mine);
        if (!existing) throw new NotFound();
        await tx.update(table).set(values).where(mine);
        if (existing.documentId !== data.documentId) replacedDocument = existing.documentId;
        return id!;
      }
      const [row] = await tx
        .insert(table)
        .values({ ...values, userId } as typeof pilotLicences.$inferInsert)
        .returning({ id: table.id });
      return row!.id;
    });
  } catch (e) {
    if (e instanceof NotFound) return { ok: false, error: "notFound" };
    if (pgCode(e) === "42501") return { ok: false, error: "documentInvalid" };
    throw e;
  }
  await deleteDocumentIfUnused(userId, replacedDocument);
  return { ok: true, id: savedId };
}

/** Delete a credential and its document (if nothing else uses it); false when not found. */
export async function deleteCredential(
  userId: string,
  kind: CredentialKind,
  id: string,
): Promise<boolean> {
  const table = tables[kind] as typeof pilotLicences; // same columns used here
  const deleted = await asUser(userId, (tx) =>
    tx
      .delete(table)
      .where(and(eq(table.id, id), eq(table.userId, userId)))
      .returning({ documentId: table.documentId }),
  );
  for (const row of deleted) await deleteDocumentIfUnused(userId, row.documentId);
  return deleted.length > 0;
}

export type Experience = {
  totalHours: number;
  picHours: number;
  last90DaysHours: number;
  birthDate: string | null;
};

export async function saveExperience(userId: string, data: Experience) {
  await asUser(userId, (tx) =>
    tx
      .insert(pilotExperience)
      .values({ userId, ...data })
      .onConflictDoUpdate({ target: pilotExperience.userId, set: data }),
  );
}

/** Hours on one aircraft type (ICAO designator), added or changed. */
export async function saveTypeHours(userId: string, aircraftType: string, hours: number) {
  await asUser(userId, (tx) =>
    tx
      .insert(experienceByType)
      .values({ userId, aircraftType, hours })
      .onConflictDoUpdate({
        target: [experienceByType.userId, experienceByType.aircraftType],
        set: { hours },
      }),
  );
}

export async function deleteTypeHours(userId: string, aircraftType: string): Promise<boolean> {
  const deleted = await asUser(userId, (tx) =>
    tx
      .delete(experienceByType)
      .where(
        and(eq(experienceByType.userId, userId), eq(experienceByType.aircraftType, aircraftType)),
      )
      .returning({ type: experienceByType.aircraftType }),
  );
  return deleted.length > 0;
}
