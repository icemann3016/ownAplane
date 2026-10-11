import { groundAircraft } from "@/lib/aircraft/owner-ops";
import { requireApiUser } from "@/lib/api/auth";
import { apiRoute } from "@/lib/api/http";
import { aircraftError } from "@/lib/api/my-aircraft";
import { myAircraftResponse } from "@/lib/api/my-aircraft-dto";
import { requireOwnAircraft } from "@/lib/api/my-aircraft-route";

type Context = RouteContext<"/api/v1/me/aircraft/[id]/ground">;

/**
 * POST /api/v1/me/aircraft/{id}/ground: no requests, acceptances or check-outs until the owner
 * lists it again (BKG-8).
 */
export const POST = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const plane = await requireOwnAircraft(user.id, (await params).id);
  const outcome = await groundAircraft(user.id, plane.id);
  if (!outcome.ok) throw aircraftError(outcome);
  return myAircraftResponse(user.id, plane.id);
});
