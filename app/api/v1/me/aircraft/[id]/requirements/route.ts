import { saveRequirements } from "@/lib/aircraft/manage-parts";
import { requireApiUser } from "@/lib/api/auth";
import { apiRoute, bodyOf, parse } from "@/lib/api/http";
import { aircraftError, requirementsBody } from "@/lib/api/my-aircraft";
import { myAircraftResponse } from "@/lib/api/my-aircraft-dto";
import { ownAircraftId } from "@/lib/api/my-aircraft-route";

type Context = RouteContext<"/api/v1/me/aircraft/[id]/requirements">;

/** PUT /api/v1/me/aircraft/{id}/requirements: who may rent it (RAT-6, RAT-7; all fields). */
export const PUT = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const id = ownAircraftId((await params).id);
  const input = parse(requirementsBody, await bodyOf(request));
  const saved = await saveRequirements(user.id, id, input);
  if (!saved.ok) throw aircraftError(saved);
  return myAircraftResponse(user.id, id);
});
