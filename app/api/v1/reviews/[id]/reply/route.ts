import { isUuid } from "@/lib/aircraft/queries";
import { requireApiUser } from "@/lib/api/auth";
import { ApiError, apiRoute, bodyOf, json, parse } from "@/lib/api/http";
import { replyBody, reviewDto } from "@/lib/api/reviews";
import { sendNotificationsSoon } from "@/lib/notifications/soon";
import { getBookingReviews } from "@/lib/reviews/queries";
import { replyToReview } from "@/lib/reviews/write";
import { getDb } from "@/lib/db";
import { reviews } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type Context = RouteContext<"/api/v1/reviews/[id]/reply">;

/** POST /api/v1/reviews/{id}/reply `{ text }`: the owner's one public reply (RAT-5). */
export const POST = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  const { text } = parse(replyBody, await bodyOf(request));
  if (!isUuid(id)) throw new ApiError("not_found", "No review with this id.");
  const result = await replyToReview(user.id, id, text);
  if (!result.ok) {
    if (result.error === "not_found") throw new ApiError("not_found", "No review with this id.");
    throw new ApiError("conflict", result.error, undefined, { reason: result.error });
  }
  sendNotificationsSoon();
  // The reply is the owner's own: read the review back through their booking (RLS).
  const [row] = await getDb()
    .select({ bookingId: reviews.bookingId })
    .from(reviews)
    .where(eq(reviews.id, id));
  const { theirs } = await getBookingReviews(user.id, row!.bookingId);
  return json({ data: theirs ? reviewDto(theirs) : null });
});
