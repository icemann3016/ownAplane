import { isUuid } from "@/lib/aircraft/queries";
import { defectBody } from "@/lib/api/aircraft-ops";
import { requireApiUser } from "@/lib/api/auth";
import { ApiError, apiRoute, bodyOf, json, parse } from "@/lib/api/http";
import { reportDefect } from "@/lib/bookings/defects";
import { getBooking } from "@/lib/bookings/queries";

type Context = RouteContext<"/api/v1/bookings/[id]/defects">;

/**
 * POST /api/v1/bookings/{id}/defects `{ severity, description, photoId }`: the pilot (of an
 * accepted, running or completed booking) or the owner reports a defect; the owner is emailed at
 * once (BKG-8). Answers with the new defect's id.
 */
export const POST = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  const detail = isUuid(id) ? await getBooking(user.id, id) : null;
  if (!detail) throw new ApiError("not_found", "No booking with this id.");
  const input = parse(defectBody, await bodyOf(request));
  const result = await reportDefect(user.id, {
    ...input,
    aircraftId: detail.booking.aircraftId,
    bookingId: id,
  });
  if (!result.ok) {
    if (result.error === "bad_photo") {
      throw new ApiError("validation_failed", "Some fields are invalid.", {
        photoId: ["Not one of your uploads."],
      });
    }
    throw new ApiError("conflict", "This booking can't take a defect report.", undefined, {
      reason: result.error,
    });
  }
  return json({ data: { id: result.id } }, { status: 201 });
});
