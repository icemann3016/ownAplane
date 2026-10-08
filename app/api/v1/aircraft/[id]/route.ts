import { getVisibleAircraft } from "@/lib/aircraft/public";
import { getPhotos } from "@/lib/aircraft/queries";
import { getAirport } from "@/lib/airports";
import { optionalApiUser } from "@/lib/api/auth";
import { aircraftDto } from "@/lib/api/dto";
import { ApiError, apiRoute, json } from "@/lib/api/http";

/**
 * GET /api/v1/aircraft/{id}: a listed aircraft (public), or any of the signed-in owner's own
 * aircraft. 404 for everything else, like the website.
 */
export const GET = apiRoute(async (request, { params }: RouteContext<"/api/v1/aircraft/[id]">) => {
  const { id } = await params;
  const user = await optionalApiUser(request);
  const viewerId = user?.id ?? null;
  const found = await getVisibleAircraft(viewerId, id);
  if (!found) throw new ApiError("not_found", "No aircraft with this id.");
  const [photos, home] = await Promise.all([
    getPhotos(viewerId, id),
    getAirport(found.aircraft.homeAirportIdent),
  ]);
  return json({ data: aircraftDto(found, photos, home) });
});
