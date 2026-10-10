import "server-only";

import { isUuid } from "@/lib/aircraft/queries";
import { getFlightLog } from "@/lib/bookings/flight-log";
import { getLogChecks } from "@/lib/bookings/log-checks";
import type { Done } from "@/lib/bookings/outcome";
import { getBooking } from "@/lib/bookings/queries";
import { outcomeError } from "./booking-errors";
import { flightLogDto } from "./dto";
import { ApiError, json } from "./http";

// Flight log endpoints (BKG-7, BKG-12…15): find the log of a booking the user may see, run the
// shared operation, answer with the whole log as it is now.

const notFound = () => new ApiError("not_found", "No flight log for this booking.");

/** The booking and its flight log for the pilot or owner, or 404. */
export async function logOf(userId: string, bookingId: string) {
  const detail = isUuid(bookingId) ? await getBooking(userId, bookingId) : null;
  const data = detail ? await getFlightLog(userId, bookingId) : null;
  if (!detail || !data) throw notFound();
  return { detail, data };
}

/** The log as it is now. */
export async function logResponse(userId: string, bookingId: string, status = 200) {
  const { detail, data } = await logOf(userId, bookingId);
  const checks = await getLogChecks(userId, detail, data);
  return json({ data: flightLogDto(detail, data, checks, userId) }, { status });
}

/** Throw the API error of a failed operation. */
export function check(outcome: Done) {
  if (!outcome.ok) throw outcomeError(outcome);
}

export const idOr404 = (id: string) => {
  if (!isUuid(id)) throw notFound();
  return id;
};
