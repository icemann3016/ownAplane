import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { searchAircraft } from "@/lib/aircraft/search";
import { getDb } from "@/lib/db";
import { notifications, profiles, savedSearches, savedSearchHits } from "@/lib/db/schema";
import { zonedToUtc } from "@/lib/domain/time";
import { reportError } from "@/lib/monitoring";
import { parseQuery } from "@/lib/validation/search";

/**
 * Saved-search alerts (SRC-6), run by the daily job: each search with alerts is run again as its
 * user (their rights, their eligibility) and aircraft it hasn't shown before are recorded; if
 * there are any, the user gets one notification for that search (in the app and by email).
 * Searches whose dates are over are skipped. Returns how many alerts were created.
 */
export async function runSavedSearchAlerts(limit = 500): Promise<number> {
  const db = getDb();
  const searches = await db
    .select({ id: savedSearches.id, userId: savedSearches.userId, query: savedSearches.query })
    .from(savedSearches)
    .innerJoin(profiles, eq(profiles.id, savedSearches.userId))
    .where(and(eq(savedSearches.alerts, true), isNull(profiles.suspendedAt)))
    .limit(limit);
  let alerts = 0;
  for (const search of searches) {
    try {
      const filters = parseQuery(search.query);
      const end = filters.to ? zonedToUtc(filters.to, "UTC") : null;
      if (end && end < new Date()) continue;
      const { results } = await searchAircraft(search.userId, filters);
      if (!results.length) continue;
      const ids = results.map((r) => r.id);
      const seen = await db
        .select({ id: savedSearchHits.aircraftId })
        .from(savedSearchHits)
        .where(
          and(
            eq(savedSearchHits.savedSearchId, search.id),
            inArray(savedSearchHits.aircraftId, ids),
          ),
        );
      const known = new Set(seen.map((s) => s.id));
      const fresh = ids.filter((id) => !known.has(id));
      if (!fresh.length) continue;
      await db.transaction(async (tx) => {
        await tx
          .insert(savedSearchHits)
          .values(fresh.map((aircraftId) => ({ savedSearchId: search.id, aircraftId })))
          .onConflictDoNothing();
        await tx.insert(notifications).values({
          userId: search.userId,
          type: "saved_search",
          savedSearchId: search.id,
        });
        await tx
          .update(savedSearches)
          .set({ lastAlertAt: new Date() })
          .where(eq(savedSearches.id, search.id));
      });
      alerts += 1;
    } catch (e) {
      await reportError(e, { where: "saved-search-alerts", tags: { search: search.id } });
    }
  }
  return alerts;
}
