import { requireApiUser } from "@/lib/api/auth";
import { check, idOr404, logOf, logResponse } from "@/lib/api/flight-log";
import { apiRoute } from "@/lib/api/http";
import { deleteRemark } from "@/lib/bookings/log-entries";

type Context = RouteContext<"/api/v1/bookings/[id]/log/remarks/[remarkId]">;

/** DELETE /api/v1/bookings/{id}/log/remarks/{remarkId}: remove a remark while editable. */
export const DELETE = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id, remarkId } = await params;
  const { data } = await logOf(user.id, id);
  check(await deleteRemark(user.id, data.log.id, idOr404(remarkId)));
  return logResponse(user.id, id);
});
