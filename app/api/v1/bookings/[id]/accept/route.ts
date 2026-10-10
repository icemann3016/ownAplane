import { isUuid } from "@/lib/aircraft/queries";
import { requireApiUser } from "@/lib/api/auth";
import { bookingError } from "@/lib/api/booking-errors";
import { bookingDto } from "@/lib/api/dto";
import { apiRoute, bodyOf, json, parse } from "@/lib/api/http";
import { acceptBody } from "@/lib/api/schemas";
import { getBooking } from "@/lib/bookings/queries";
import { respondToBooking } from "@/lib/bookings/respond";
import { sendNotificationsSoon } from "@/lib/notifications/soon";

type Context = RouteContext<"/api/v1/bookings/[id]/accept">;

/** POST /api/v1/bookings/{id}/accept: the owner accepts a request (BKG-3). */
export const POST = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  if (!isUuid(id)) throw bookingError("not_found");
  const { note } = parse(acceptBody, await bodyOf(request, {}));
  sendNotificationsSoon();
  const outcome = await respondToBooking(user.id, id, "accept", note || null, null);
  if (!outcome.ok) throw bookingError(outcome.error);
  return json({ data: bookingDto((await getBooking(user.id, id))!, user.id) });
});
