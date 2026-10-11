import { reorderPhotos } from "@/lib/aircraft/manage-parts";
import { requireApiUser } from "@/lib/api/auth";
import { apiRoute, bodyOf, parse } from "@/lib/api/http";
import { photoOrderBody } from "@/lib/api/my-aircraft";
import { myAircraftResponse } from "@/lib/api/my-aircraft-dto";
import { ownAircraftId } from "@/lib/api/my-aircraft-route";

type Context = RouteContext<"/api/v1/me/aircraft/[id]/photos/order">;

/** PUT …/photos/order `{ order: [photoId…] }`: the photos' order, cover first. */
export const PUT = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const id = ownAircraftId((await params).id);
  const { order } = parse(photoOrderBody, await bodyOf(request));
  await reorderPhotos(user.id, id, order);
  return myAircraftResponse(user.id, id);
});
