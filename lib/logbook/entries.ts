import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { asUser } from "@/lib/db/rls";
import { type LogbookEntry, logbookEntries } from "@/lib/db/schema";
import { sumEntries } from "./totals";

export { sumEntries, TOTAL_COLUMNS, type Totals, type TotalColumn } from "./totals";

// Reading the pilot's logbook (LOG-1…5). RLS: the pilot (and admins) only.

export const PAGE_SIZE = 50;

/** One page of entries, newest first (drafts, certified and struck-through ones). */
export async function listEntries(userId: string, page = 1) {
  const rows = await asUser(userId, (tx) =>
    tx
      .select()
      .from(logbookEntries)
      .where(eq(logbookEntries.pilotId, userId))
      .orderBy(
        desc(logbookEntries.date),
        sql`${logbookEntries.departureTime} desc nulls last`,
        desc(logbookEntries.createdAt),
      )
      .limit(PAGE_SIZE + 1)
      .offset((page - 1) * PAGE_SIZE),
  );
  return { entries: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
}

export async function listDrafts(userId: string) {
  return asUser(userId, (tx) =>
    tx
      .select()
      .from(logbookEntries)
      .where(and(eq(logbookEntries.pilotId, userId), eq(logbookEntries.status, "draft")))
      .orderBy(asc(logbookEntries.date), sql`${logbookEntries.departureTime} nulls first`),
  );
}

/** One entry with the entries it corrects and the one that corrected it. */
export async function getEntry(userId: string, id: string) {
  return asUser(userId, async (tx) => {
    const [entry] = await tx
      .select()
      .from(logbookEntries)
      .where(and(eq(logbookEntries.id, id), eq(logbookEntries.pilotId, userId)));
    if (!entry) return null;
    const history: LogbookEntry[] = [];
    let previous = entry.correctsId;
    while (previous && history.length < 20) {
      const [row] = await tx.select().from(logbookEntries).where(eq(logbookEntries.id, previous));
      if (!row) break;
      history.push(row);
      previous = row.correctsId;
    }
    const correctedBy = await tx
      .select()
      .from(logbookEntries)
      .where(eq(logbookEntries.correctsId, id))
      .orderBy(desc(logbookEntries.createdAt));
    return { entry, history, correctedBy };
  });
}

/** Certified and struck-through entries in the order flown, for the EASA print and CSV. */
export async function entriesInOrder(userId: string) {
  return asUser(userId, (tx) =>
    tx
      .select()
      .from(logbookEntries)
      .where(
        and(
          eq(logbookEntries.pilotId, userId),
          inArray(logbookEntries.status, ["certified", "superseded"]),
        ),
      )
      .orderBy(
        asc(logbookEntries.date),
        sql`case ${logbookEntries.kind} when 'brought_forward' then 0 else 1 end`,
        sql`${logbookEntries.departureTime} nulls first`,
        asc(logbookEntries.createdAt),
      ),
  );
}

/** Totals to date, the last 90 days (flights only) and hours per aircraft type (LOG-1, LOG-7). */
export async function getTotals(userId: string) {
  const rows = await asUser(userId, (tx) =>
    tx
      .select()
      .from(logbookEntries)
      .where(and(eq(logbookEntries.pilotId, userId), eq(logbookEntries.status, "certified"))),
  );
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const recent = rows.filter((r) => r.kind === "flight" && r.date >= since);
  const byType = new Map<string, number>();
  for (const r of rows) {
    if (r.kind !== "flight" || !r.aircraftType || !r.totalMinutes) continue;
    byType.set(r.aircraftType, (byType.get(r.aircraftType) ?? 0) + r.totalMinutes);
  }
  return {
    all: sumEntries(rows),
    last90: sumEntries(recent),
    byType: [...byType.entries()]
      .map(([aircraftType, minutes]) => ({ aircraftType, minutes }))
      .sort((a, b) => b.minutes - a.minutes),
    certified: rows.length,
  };
}

export type LogbookTotals = Awaited<ReturnType<typeof getTotals>>;
