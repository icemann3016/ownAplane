import "server-only";

import { and, count, eq, gt, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { documentReads } from "@/lib/db/schema";

// Every read is logged (who, which document, outcome; never the content) for the daily limit
// per user and for admins. Trusted code (the caller checked the user may read the document).

/** Reads a user may start per 24 hours (each page of a logbook spread counts). */
export function dailyReadLimit(): number {
  const n = Number(process.env.OCR_DAILY_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : 40;
}

export async function readsLeft(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ pages: sql<number>`coalesce(sum(${documentReads.pages}), 0)::int` })
    .from(documentReads)
    .where(
      and(
        eq(documentReads.userId, userId),
        gt(documentReads.createdAt, sql`now() - interval '24 hours'`),
      ),
    );
  return Math.max(0, dailyReadLimit() - (row?.pages ?? 0));
}

export async function logRead(entry: {
  userId: string;
  documentId: string | null;
  kind: "licence" | "medical" | "logbook";
  outcome: "ok" | "unreadable" | "failed";
  pages?: number;
  consentAt?: Date | null;
}) {
  await getDb()
    .insert(documentReads)
    .values({ ...entry, pages: entry.pages ?? 1, consentAt: entry.consentAt ?? null });
}

/** Reads per day for the last 7 days (admins). */
export async function readsLastWeek() {
  return getDb()
    .select({
      day: sql<string>`(${documentReads.createdAt} at time zone 'utc')::date::text`,
      kind: documentReads.kind,
      reads: count(),
      pages: sql<number>`sum(${documentReads.pages})::int`,
    })
    .from(documentReads)
    .where(gt(documentReads.createdAt, sql`now() - interval '7 days'`))
    .groupBy(sql`1`, documentReads.kind)
    .orderBy(sql`1 desc`);
}
