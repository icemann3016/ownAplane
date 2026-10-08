import { requireApiUser } from "@/lib/api/auth";
import { bookingSummaryDto } from "@/lib/api/dto";
import { apiRoute, json } from "@/lib/api/http";
import { listBookings } from "@/lib/bookings/queries";

/** GET /api/v1/bookings: the signed-in user's bookings as pilot and as owner, newest first. */
export const GET = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  const rows = await listBookings(user.id);
  return json({ data: rows.map(bookingSummaryDto), nextCursor: null });
});
