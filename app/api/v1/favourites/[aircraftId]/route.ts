import { isUuid } from "@/lib/aircraft/queries";
import { requireApiUser } from "@/lib/api/auth";
import { ApiError, apiRoute, json } from "@/lib/api/http";
import { setFavourite } from "@/lib/saved/favourites";

type Context = RouteContext<"/api/v1/favourites/[aircraftId]">;

/** PUT /api/v1/favourites/{aircraftId}: add a listed aircraft to the favourites. */
export const PUT = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { aircraftId } = await params;
  if (!isUuid(aircraftId) || !(await setFavourite(user.id, aircraftId, true))) {
    throw new ApiError("not_found", "No aircraft with this id.");
  }
  return json({ data: { aircraftId, favourite: true } });
});

/** DELETE /api/v1/favourites/{aircraftId}: remove it. */
export const DELETE = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { aircraftId } = await params;
  if (isUuid(aircraftId)) await setFavourite(user.id, aircraftId, false);
  return json({ data: { aircraftId, favourite: false } });
});
