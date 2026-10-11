import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { refundCredit, spendCredit } from "@/lib/billing/credits";
import { asUser } from "@/lib/db/rls";
import { documents, logbookEntries, logbookSpreads } from "@/lib/db/schema";
import { readDocument } from "@/lib/documents";
import { isOcrConfigured, readScan, type ScanFile } from ".";
import { lineValues, SPREAD_TASK, totalDifferences, writtenTotals } from "./logbook";
import { logRead, readsLeft } from "./usage";

// Reading a scanned logbook spread into draft entries (LOG-6). The scans stay attached to the
// spread; every line read is a draft for the pilot to check and certify.

export type SpreadReadError =
  | "not_configured"
  | "not_found"
  | "limit"
  | "no_credits"
  | "not_this_document"
  | "nothing_read"
  | "unreadable"
  | "failed";

export async function readLogbookSpread(
  userId: string,
  leftDocumentId: string,
  rightDocumentId: string | null,
): Promise<{ ok: true; spreadId: string } | { ok: false; error: SpreadReadError }> {
  const ids = rightDocumentId ? [leftDocumentId, rightDocumentId] : [leftDocumentId];
  const own = await asUser(userId, (tx) =>
    tx
      .select({ id: documents.id })
      .from(documents)
      .where(and(inArray(documents.id, ids), eq(documents.ownerId, userId))),
  );
  if (own.length !== ids.length) return { ok: false, error: "not_found" };
  if (!isOcrConfigured()) return { ok: false, error: "not_configured" };
  if ((await readsLeft(userId)) < ids.length) return { ok: false, error: "limit" };
  const files: ScanFile[] = [];
  for (const id of ids) {
    const file = await readDocument(userId, id);
    if (!file) return { ok: false, error: "not_found" };
    files.push({ contentType: file.doc.contentType, body: file.body });
  }

  // One AI credit per spread; a read that gives nothing usable gets it back.
  const credit = await spendCredit(userId);
  if (!credit.ok) return credit;
  const read = await readScan(SPREAD_TASK, files);
  if (!read.ok) {
    await refundCredit(credit.entryId);
    await logRead({
      userId,
      documentId: leftDocumentId,
      kind: "logbook",
      outcome: read.error === "unreadable" ? "unreadable" : "failed",
      pages: ids.length,
    });
    return read;
  }
  await logRead({
    userId,
    documentId: leftDocumentId,
    kind: "logbook",
    outcome: "ok",
    pages: ids.length,
  });
  if (!read.data.isLogbook) return { ok: false, error: "not_this_document" };

  const today = new Date().toISOString().slice(0, 10);
  const lines = [...read.data.lines].sort((a, b) => a.line - b.line);
  const drafts = lines
    .map((l) => ({ line: l.line, values: lineValues(l, today) }))
    .filter((d): d is { line: number; values: NonNullable<typeof d.values> } => d.values !== null);
  if (!drafts.length) {
    await refundCredit(credit.entryId);
    return { ok: false, error: "nothing_read" };
  }
  const written = writtenTotals(read.data.totalThisPage);

  const spreadId = await asUser(userId, async (tx) => {
    const [spread] = await tx
      .insert(logbookSpreads)
      .values({
        pilotId: userId,
        leftDocumentId,
        rightDocumentId,
        linesRead: drafts.length,
        linesSkipped: lines.length - drafts.length,
        pageTotals: written,
        differences: totalDifferences(
          drafts.map((d) => d.values),
          written,
        ),
      })
      .returning({ id: logbookSpreads.id });
    await tx.insert(logbookEntries).values(
      drafts.map((d) => ({
        ...d.values,
        pilotId: userId,
        source: "scan" as const,
        spreadId: spread!.id,
        spreadLine: Math.min(d.line, 99),
      })),
    );
    return spread!.id;
  });
  return { ok: true, spreadId };
}

/** A spread with the entries read from it (pilot or admins). */
export async function getSpread(userId: string, id: string) {
  return asUser(userId, async (tx) => {
    const [spread] = await tx.select().from(logbookSpreads).where(eq(logbookSpreads.id, id));
    if (!spread) return null;
    const entries = await tx
      .select()
      .from(logbookEntries)
      .where(eq(logbookEntries.spreadId, id))
      .orderBy(asc(logbookEntries.spreadLine));
    return { spread, entries };
  });
}
