import { requireApiUser } from "@/lib/api/auth";
import { getMyPlan } from "@/lib/billing/plan";
import { PLANS } from "@/lib/billing/plans";
import { ApiError, apiRoute, bodyOf, json, parse } from "@/lib/api/http";
import { savedSearchBody, savedSearchDto } from "@/lib/api/social";
import { listSavedSearches, MAX_SAVED_SEARCHES, saveSearch } from "@/lib/saved/searches";

/** GET /api/v1/saved-searches: the user's saved searches (SRC-6). */
export const GET = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  return json({ data: (await listSavedSearches(user.id)).map(savedSearchDto), nextCursor: null });
});

/**
 * POST /api/v1/saved-searches `{ name, query, alerts }`: save a search; with alerts, the user is
 * told once a day about aircraft that newly match (not the ones it shows now).
 */
export const POST = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  const input = parse(savedSearchBody, await bodyOf(request));
  const result = await saveSearch(user.id, input);
  if (!result.ok) {
    const limit = PLANS[(await getMyPlan(user.id)).plan].savedSearches;
    throw new ApiError(
      "conflict",
      `At most ${limit} saved searches on this plan (${MAX_SAVED_SEARCHES} with Pilot Plus).`,
      undefined,
      { reason: result.error, limit },
    );
  }
  const saved = (await listSavedSearches(user.id)).find((s) => s.id === result.id)!;
  return json({ data: savedSearchDto(saved) }, { status: 201 });
});
