import { isUuid } from "@/lib/aircraft/queries";
import { requireApiUser } from "@/lib/api/auth";
import { bookingDto } from "@/lib/api/dto";
import { ApiError, apiRoute, json } from "@/lib/api/http";
import { getBooking } from "@/lib/bookings/queries";

/** GET /api/v1/bookings/{id}: one booking of the signed-in pilot or owner, with its history. */
export const GET = apiRoute(async (request, { params }: RouteContext<"/api/v1/bookings/[id]">) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  const booking = isUuid(id) ? await getBooking(user.id, id) : null;
  if (!booking) throw new ApiError("not_found", "No booking with this id.");
  return json({ data: bookingDto(booking, user.id) });
});
