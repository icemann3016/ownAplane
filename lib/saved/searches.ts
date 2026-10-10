import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { searchAircraft } from "@/lib/aircraft/search";
import { getDb } from "@/lib/db";
import { asUser } from "@/lib/db/rls";
import { savedSearches, savedSearchHits } from "@/lib/db/schema";
import { filtersToQuery, parseQuery } from "@/lib/validation/search";

// Saved searches with alerts (SRC-6). RLS: own only. What a search already showed is kept in
// saved_search_hits (trusted), so alerts tell only about aircraft that match later.

export const MAX_SAVED_SEARCHES = 20;

export type SaveSearchResult = { ok: true; id: string } | { ok: false; error: "too_many_searches" };

/** Save the current search; the aircraft it shows now don't trigger an alert. */
export async function saveSearch(
  userId: string,
  input: { name: string; query: string; alerts: boolean },
): Promise<SaveSearchResult> {
  const filters = parseQuery(input.query);
  const query = filtersToQuery(filters);
  let id: string;
  try {
    const [row] = await asUser(userId, (tx) =>
      tx
        .insert(savedSearches)
        .values({ userId, name: input.name, query, alerts: input.alerts })
        .returning({ id: savedSearches.id }),
    );
    id = row!.id;
  } catch (e) {
    const err = e as { cause?: { message?: string } };
    if (err.cause?.message === "too_many_searches") return { ok: false, error: err.cause.message };
    throw e;
  }
  const { results } = await searchAircraft(userId, filters);
  if (results.length) {
    await getDb()
      .insert(savedSearchHits)
      .values(results.map((r) => ({ savedSearchId: id, aircraftId: r.id })))
      .onConflictDoNothing();
  }
  return { ok: true, id };
}

export async function listSavedSearches(userId: string) {
  return asUser(userId, (tx) =>
    tx
      .select()
      .from(savedSearches)
      .where(eq(savedSearches.userId, userId))
      .orderBy(desc(savedSearches.createdAt)),
  );
}

/** Switch a search's alerts on or off; false if it isn't the user's. */
export async function setSearchAlerts(userId: string, id: string, alerts: boolean) {
  const rows = await asUser(userId, (tx) =>
    tx
      .update(savedSearches)
      .set({ alerts })
      .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId)))
      .returning({ id: savedSearches.id }),
  );
  return rows.length > 0;
}

export async function deleteSavedSearch(userId: string, id: string) {
  const rows = await asUser(userId, (tx) =>
    tx
      .delete(savedSearches)
      .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId)))
      .returning({ id: savedSearches.id }),
  );
  return rows.length > 0;
}
