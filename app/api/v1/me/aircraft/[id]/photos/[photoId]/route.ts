import { deletePhoto } from "@/lib/aircraft/manage-parts";
import { requireApiUser } from "@/lib/api/auth";
import { apiRoute } from "@/lib/api/http";
import { aircraftError } from "@/lib/api/my-aircraft";
import { myAircraftResponse } from "@/lib/api/my-aircraft-dto";
import { ownAircraftId } from "@/lib/api/my-aircraft-route";

type Context = RouteContext<"/api/v1/me/aircraft/[id]/photos/[photoId]">;

/** DELETE …/photos/{photoId}: remove a photo (a listed aircraft keeps at least one). */
export const DELETE = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id, photoId } = await params;
  const aircraftId = ownAircraftId(id);
  const outcome = await deletePhoto(user.id, aircraftId, ownAircraftId(photoId, "photo"));
  if (!outcome.ok) throw aircraftError(outcome);
  return myAircraftResponse(user.id, aircraftId);
});
