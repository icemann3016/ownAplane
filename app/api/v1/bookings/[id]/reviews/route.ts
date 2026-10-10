import { isUuid } from "@/lib/aircraft/queries";
import { requireApiUser } from "@/lib/api/auth";
import { bookingError } from "@/lib/api/booking-errors";
import { ApiError, apiRoute, bodyOf, json, parse } from "@/lib/api/http";
import { reviewBody, reviewDto } from "@/lib/api/reviews";
import { getBooking } from "@/lib/bookings/queries";
import { sendNotificationsSoon } from "@/lib/notifications/soon";
import { getBookingReviews } from "@/lib/reviews/queries";
import { submitReview } from "@/lib/reviews/write";

type Context = RouteContext<"/api/v1/bookings/[id]/reviews">;

async function reviewsOf(userId: string, bookingId: string) {
  const booking = isUuid(bookingId) ? await getBooking(userId, bookingId) : null;
  if (!booking) throw new ApiError("not_found", "No booking with this id.");
  const r = await getBookingReviews(userId, bookingId);
  return json({
    data: {
      mine: r.mine ? reviewDto(r.mine) : null,
      theirs: r.theirs ? reviewDto(r.theirs) : null,
      closesAt: r.closesAt?.toISOString() ?? null,
    },
  });
}

/** GET /api/v1/bookings/{id}/reviews: your review and, once published, the other side's. */
export const GET = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  return reviewsOf(user.id, (await params).id);
});

/** POST /api/v1/bookings/{id}/reviews `{ scores, comment }`: review a completed booking. */
export const POST = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  const { scores, comment } = parse(reviewBody, await bodyOf(request));
  if (!isUuid(id)) throw bookingError("not_found");
  const result = await submitReview(user.id, id, scores, comment);
  if (!result.ok) {
    if (result.error === "bad_scores") {
      throw new ApiError("validation_failed", "One score 1–5 per category.", {
        scores: ["bad_scores"],
      });
    }
    if (result.error === "not_found") throw bookingError("not_found");
    throw new ApiError("conflict", result.error, undefined, { reason: result.error });
  }
  sendNotificationsSoon();
  return reviewsOf(user.id, id);
});
