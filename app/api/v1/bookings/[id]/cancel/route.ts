import { isUuid } from "@/lib/aircraft/queries";
import { requireApiUser } from "@/lib/api/auth";
import { bookingError } from "@/lib/api/booking-errors";
import { bookingDto } from "@/lib/api/dto";
import { apiRoute, bodyOf, json, parse } from "@/lib/api/http";
import { cancelBody } from "@/lib/api/schemas";
import { getBooking } from "@/lib/bookings/queries";
import { cancelBooking } from "@/lib/bookings/respond";
import { sendNotificationsSoon } from "@/lib/notifications/soon";

type Context = RouteContext<"/api/v1/bookings/[id]/cancel">;

/**
 * POST /api/v1/bookings/{id}/cancel `{ reason }`: the pilot or owner cancels before the start
 * (BKG-6). `details.late` says whether it was after the free-cancellation time.
 */
export const POST = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  if (!isUuid(id)) throw bookingError("not_found");
  const { reason } = parse(cancelBody, await bodyOf(request));
  sendNotificationsSoon();
  const outcome = await cancelBooking(user.id, id, reason);
  if (!outcome.ok) throw bookingError(outcome.error);
  const booking = await getBooking(user.id, id);
  return json({ data: bookingDto(booking!, user.id), details: { late: outcome.late } });
});
