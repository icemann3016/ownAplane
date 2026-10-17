import { visibleRequest } from "@/lib/api/airport-requests";
import { airportRequestDto } from "@/lib/api/airport-requests-dto";
import { requireApiUser } from "@/lib/api/auth";
import { apiRoute, json } from "@/lib/api/http";

type Context = RouteContext<"/api/v1/airport-requests/[id]">;

/** GET /api/v1/airport-requests/{id}: one request for its pilot or the airfield's team. */
export const GET = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const view = await visibleRequest(user.id, (await params).id);
  return json({ data: airportRequestDto(view, user.id) });
});
