import { searchAircraft } from "@/lib/aircraft/search";
import { optionalApiUser } from "@/lib/api/auth";
import { aircraftSummaryDto } from "@/lib/api/dto";
import { ApiError, apiRoute, json, parse, queryOf } from "@/lib/api/http";
import { aircraftSearchQuery, toSearchFilters } from "@/lib/api/schemas";

/**
 * GET /api/v1/aircraft: listed aircraft near an airfield, free for the whole period, optionally
 * only those the signed-in pilot may rent (SRC-1, SRC-2). Public; a token adds `eligible`.
 */
export const GET = apiRoute(async (request) => {
  const query = parse(aircraftSearchQuery, queryOf(request));
  const user = await optionalApiUser(request);
  if (query.eligible && !user) {
    throw new ApiError("unauthorized", "eligible=true needs a signed-in pilot.");
  }
  const { origin, results } = await searchAircraft(user?.id ?? null, toSearchFilters(query));
  if (query.airport && !origin) throw new ApiError("not_found", "No airfield with this ident.");
  return json({ data: results.map(aircraftSummaryDto), nextCursor: null });
});
