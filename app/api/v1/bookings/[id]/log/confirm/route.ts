import { requireApiUser } from "@/lib/api/auth";
import { check, idOr404, logResponse } from "@/lib/api/flight-log";
import { apiRoute } from "@/lib/api/http";
import { confirmFlightLog } from "@/lib/bookings/flight-log-ops";
import { sendNotificationsSoon } from "@/lib/notifications/soon";

type Context = RouteContext<"/api/v1/bookings/[id]/log/confirm">;

/**
 * POST /api/v1/bookings/{id}/log/confirm: the owner confirms; flown time and amount due are
 * worked out on the server (as the log's `amount` shows) and the booking is completed.
 */
export const POST = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  sendNotificationsSoon();
  check(await confirmFlightLog(user.id, idOr404(id)));
  return logResponse(user.id, id);
});
