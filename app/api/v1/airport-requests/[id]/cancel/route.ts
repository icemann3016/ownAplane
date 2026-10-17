import { airportRequestError, visibleRequest } from "@/lib/api/airport-requests";
import { airportRequestDto } from "@/lib/api/airport-requests-dto";
import { requireApiUser } from "@/lib/api/auth";
import { apiRoute, json } from "@/lib/api/http";
import { cancelAirportRequest } from "@/lib/airport-requests/ops";
import { sendNotificationsSoon } from "@/lib/notifications/soon";

type Context = RouteContext<"/api/v1/airport-requests/[id]/cancel">;

/** POST /api/v1/airport-requests/{id}/cancel: the pilot cancels; the airfield's team is told. */
export const POST = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  await visibleRequest(user.id, id);
  sendNotificationsSoon();
  const result = await cancelAirportRequest(user.id, id);
  if (!result.ok) throw airportRequestError(result.error);
  return json({ data: airportRequestDto(await visibleRequest(user.id, id), user.id) });
});
