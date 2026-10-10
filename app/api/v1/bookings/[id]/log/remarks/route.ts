import { requireApiUser } from "@/lib/api/auth";
import { check, logOf, logResponse } from "@/lib/api/flight-log";
import { apiRoute, bodyOf, parse } from "@/lib/api/http";
import { remarkBody } from "@/lib/api/schemas";
import { addRemark } from "@/lib/bookings/log-entries";

type Context = RouteContext<"/api/v1/bookings/[id]/log/remarks">;

/** POST /api/v1/bookings/{id}/log/remarks: a remark or PIREP (aircraft, weather, airfield). */
export const POST = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  const remark = parse(remarkBody, await bodyOf(request));
  const { data } = await logOf(user.id, id);
  check(await addRemark(user.id, data.log.id, remark));
  return logResponse(user.id, id, 201);
});
