import { requireApiUser } from "@/lib/api/auth";
import { check, logOf, logResponse } from "@/lib/api/flight-log";
import { apiRoute, bodyOf, parse } from "@/lib/api/http";
import { checkoutBody } from "@/lib/api/schemas";
import { saveCheckoutReadings } from "@/lib/bookings/flight-log-ops";

type Context = RouteContext<"/api/v1/bookings/[id]/log/checkout">;

/** PUT /api/v1/bookings/{id}/log/checkout: the readings found at check-out (litres). */
export const PUT = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  const readings = parse(checkoutBody, await bodyOf(request));
  const { data } = await logOf(user.id, id);
  check(await saveCheckoutReadings(user.id, data.log.id, readings));
  return logResponse(user.id, id);
});
