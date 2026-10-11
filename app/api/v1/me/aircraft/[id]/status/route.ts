import { setAircraftStatus } from "@/lib/aircraft/manage";
import { requireApiUser } from "@/lib/api/auth";
import { apiRoute, bodyOf, parse } from "@/lib/api/http";
import { aircraftError, statusBody } from "@/lib/api/my-aircraft";
import { myAircraftResponse } from "@/lib/api/my-aircraft-dto";
import { ownAircraftId } from "@/lib/api/my-aircraft-route";

type Context = RouteContext<"/api/v1/me/aircraft/[id]/status">;

/**
 * PUT /api/v1/me/aircraft/{id}/status `{ status: listed | paused | unlisted }` (LST-7). Listing
 * needs a home base, a price, a photo and a verified ARC and insurance: 409 `not_ready` with
 * `details.missing`.
 */
export const PUT = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const id = ownAircraftId((await params).id);
  const { status } = parse(statusBody, await bodyOf(request));
  const outcome = await setAircraftStatus(user.id, id, status);
  if (!outcome.ok) throw aircraftError(outcome);
  return myAircraftResponse(user.id, id);
});
