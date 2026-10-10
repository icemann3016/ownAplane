import { requireApiUser } from "@/lib/api/auth";
import { check, idOr404, logOf, logResponse } from "@/lib/api/flight-log";
import { apiRoute, bodyOf, parse } from "@/lib/api/http";
import { upliftBody } from "@/lib/api/schemas";
import { deleteUplift, saveUplift } from "@/lib/bookings/log-entries";

type Context = RouteContext<"/api/v1/bookings/[id]/log/uplifts/[upliftId]">;

/** PUT /api/v1/bookings/{id}/log/uplifts/{upliftId}: change fuel or oil added. */
export const PUT = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id, upliftId } = await params;
  const uplift = parse(upliftBody, await bodyOf(request));
  const { data } = await logOf(user.id, id);
  check(await saveUplift(user.id, data.log.id, idOr404(upliftId), uplift));
  return logResponse(user.id, id);
});

/** DELETE /api/v1/bookings/{id}/log/uplifts/{upliftId}: remove fuel or oil added. */
export const DELETE = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id, upliftId } = await params;
  const { data } = await logOf(user.id, id);
  check(await deleteUplift(user.id, data.log.id, idOr404(upliftId)));
  return logResponse(user.id, id);
});
