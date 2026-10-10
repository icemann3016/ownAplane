import { requireApiUser } from "@/lib/api/auth";
import { check, idOr404, logOf, logResponse } from "@/lib/api/flight-log";
import { apiRoute, bodyOf, parse } from "@/lib/api/http";
import { legBody } from "@/lib/api/schemas";
import { deleteLeg, saveLeg } from "@/lib/bookings/log-entries";

type Context = RouteContext<"/api/v1/bookings/[id]/log/legs/[legId]">;

/** PUT /api/v1/bookings/{id}/log/legs/{legId}: change a leg while the log is editable. */
export const PUT = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id, legId } = await params;
  const leg = parse(legBody, await bodyOf(request));
  const { data } = await logOf(user.id, id);
  check(await saveLeg(user.id, data.log.id, idOr404(legId), leg));
  return logResponse(user.id, id);
});

/** DELETE /api/v1/bookings/{id}/log/legs/{legId}: remove a leg while the log is editable. */
export const DELETE = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id, legId } = await params;
  const { data } = await logOf(user.id, id);
  check(await deleteLeg(user.id, data.log.id, idOr404(legId)));
  return logResponse(user.id, id);
});
