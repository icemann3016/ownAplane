import { getVisibleAircraft } from "@/lib/aircraft/public";
import { isUuid } from "@/lib/aircraft/queries";
import { optionalApiUser } from "@/lib/api/auth";
import { ApiError, apiRoute, json } from "@/lib/api/http";
import { reviewDto } from "@/lib/api/reviews";
import { listPublishedReviews } from "@/lib/reviews/queries";

type Context = RouteContext<"/api/v1/aircraft/[id]/reviews">;

/** GET /api/v1/aircraft/{id}/reviews: published reviews of the aircraft (RAT-4). */
export const GET = apiRoute(async (request, { params }: Context) => {
  const user = await optionalApiUser(request);
  const { id } = await params;
  if (!isUuid(id) || !(await getVisibleAircraft(user?.id ?? null, id))) {
    throw new ApiError("not_found", "No aircraft with this id.");
  }
  const rows = await listPublishedReviews({ aircraftId: id }, 50);
  return json({ data: rows.map(reviewDto), nextCursor: null });
});
