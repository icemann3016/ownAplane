import "server-only";

import { ApiError } from "./http";

// Booking outcomes (lib/bookings) → API errors. `details.reason` is the stable code apps
// switch on; the message is for developers.

const FIELDS: Record<string, string> = {
  too_many_passengers: "passengers",
  lapl_passengers: "passengers",
  period_in_past: "from",
  period_length: "to",
  endBeforeStart: "to",
  dateTimeInvalid: "from",
  unknown_airfield: "departure",
  bad_proposal: "proposal",
  reason_required: "reason",
};

const CONFLICTS = new Set([
  "not_free",
  "booked_elsewhere",
  "aircraft_grounded",
  "aircraft_unavailable",
  "not_open",
  "not_accepted",
  "not_cancellable",
  "pilot_not_eligible",
]);

export function bookingError(reason: string, detail?: string): ApiError {
  const details = { reason, ...(detail ? { detail } : {}) };
  if (reason === "not_found") return new ApiError("not_found", "No booking with this id.");
  const field = FIELDS[reason];
  if (field) return new ApiError("validation_failed", reason, { [field]: [reason] }, details);
  if (CONFLICTS.has(reason)) return new ApiError("conflict", reason, undefined, details);
  return new ApiError("bad_request", reason, undefined, details);
}
