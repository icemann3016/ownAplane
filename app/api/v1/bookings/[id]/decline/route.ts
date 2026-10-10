import { isUuid } from "@/lib/aircraft/queries";
import { requireApiUser } from "@/lib/api/auth";
import { bookingError } from "@/lib/api/booking-errors";
import { bookingDto } from "@/lib/api/dto";
import { apiRoute, bodyOf, json, parse } from "@/lib/api/http";
import { declineBody } from "@/lib/api/schemas";
import { getBooking } from "@/lib/bookings/queries";
import { respondToBooking } from "@/lib/bookings/respond";
import { sendNotificationsSoon } from "@/lib/notifications/soon";

type Context = RouteContext<"/api/v1/bookings/[id]/decline">;

/** POST /api/v1/bookings/{id}/decline: the owner declines, optionally suggesting another time. */
export const POST = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  if (!isUuid(id)) throw bookingError("not_found");
  const { note, proposal } = parse(declineBody, await bodyOf(request, {}));
  sendNotificationsSoon();
  const outcome = await respondToBooking(
    user.id,
    id,
    "decline",
    note || null,
    proposal ? { from: new Date(proposal.from), to: new Date(proposal.to) } : null,
  );
  if (!outcome.ok) throw bookingError(outcome.error);
  return json({ data: bookingDto((await getBooking(user.id, id))!, user.id) });
});
