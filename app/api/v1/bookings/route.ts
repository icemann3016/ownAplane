import { requireApiUser } from "@/lib/api/auth";
import { bookingError } from "@/lib/api/booking-errors";
import { bookingDto, bookingSummaryDto } from "@/lib/api/dto";
import { eligibilityReasons } from "@/lib/api/eligibility";
import { ApiError, apiRoute, bodyOf, json, parse } from "@/lib/api/http";
import { bookingRequestBody, toBookingInput } from "@/lib/api/schemas";
import { getMyEligibility } from "@/lib/aircraft/eligibility";
import { getVisibleAircraft } from "@/lib/aircraft/public";
import { getBooking, listBookings } from "@/lib/bookings/queries";
import { flightAirfields, requestBooking } from "@/lib/bookings/request";
import { sendNotificationsSoon } from "@/lib/notifications/soon";

/** GET /api/v1/bookings: the signed-in user's bookings as pilot and as owner, newest first. */
export const GET = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  const rows = await listBookings(user.id);
  return json({ data: rows.map(bookingSummaryDto), nextCursor: null });
});

/**
 * POST /api/v1/bookings: request a booking as the signed-in pilot (BKG-1), like the website.
 * The owner answers within 24 hours (or it's accepted at once with instant booking). 403
 * `forbidden` with `details.reasons` when the pilot doesn't meet the requirements.
 */
export const POST = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  const body = parse(bookingRequestBody, await bodyOf(request));
  const input = toBookingInput(body);
  sendNotificationsSoon();
  const outcome = await requestBooking(user.id, input);
  if (!outcome.ok) {
    if (outcome.error === "not_eligible") {
      const failures = await getMyEligibility(
        user.id,
        input.aircraftId,
        outcome.period,
        flightAirfields(input),
      );
      const type = (await getVisibleAircraft(user.id, input.aircraftId))?.aircraft.typeDesignator;
      throw new ApiError("forbidden", "The pilot doesn't meet the requirements.", undefined, {
        reason: "not_eligible",
        reasons: await eligibilityReasons(user.id, failures, type ?? ""),
      });
    }
    throw bookingError(outcome.error, outcome.detail);
  }
  const booking = await getBooking(user.id, outcome.id);
  return json({ data: bookingDto(booking!, user.id) }, { status: 201 });
});
