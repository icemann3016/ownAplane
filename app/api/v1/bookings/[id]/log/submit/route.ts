import { requireApiUser } from "@/lib/api/auth";
import { check, logOf, logResponse } from "@/lib/api/flight-log";
import { apiRoute } from "@/lib/api/http";
import { submitFlightLog } from "@/lib/bookings/flight-log-ops";
import { sendNotificationsSoon } from "@/lib/notifications/soon";

type Context = RouteContext<"/api/v1/bookings/[id]/log/submit">;

/** POST /api/v1/bookings/{id}/log/submit: check-in; the pilot sends the log to the owner. */
export const POST = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  const { data } = await logOf(user.id, id);
  sendNotificationsSoon();
  check(await submitFlightLog(user.id, data.log.id));
  return logResponse(user.id, id);
});
