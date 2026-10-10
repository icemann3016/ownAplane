import "server-only";

import type { Fail } from "@/lib/bookings/outcome";

import { ApiError } from "./http";

// Booking outcomes (lib/bookings) → API errors. `details.reason` is the stable code apps
// switch on; the message is for developers.

const FIELDS: Record<string, string> = {
  passenger_recency: "recencyConfirmed",
  note_required: "note",
  leg_checks: "_",
  checks_failed: "_",
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
  "not_editable",
  "no_legs",
  "not_submitted",
  "missing_meters",
  "too_early",
]);

export function bookingError(reason: string, detail?: string): ApiError {
  const details = { reason, ...(detail ? { detail } : {}) };
  if (reason === "not_found") return new ApiError("not_found", "No booking with this id.");
  const field = FIELDS[reason];
  if (field) return new ApiError("validation_failed", reason, { [field]: [reason] }, details);
  if (CONFLICTS.has(reason)) return new ApiError("conflict", reason, undefined, details);
  return new ApiError("bad_request", reason, undefined, details);
}

/** A lib outcome (lib/bookings/outcome.ts) as an API error, with the leg's fields to fix. */
export function outcomeError(fail: Fail): ApiError {
  if (fail.error === "leg_order") {
    const fields = Object.fromEntries(
      (fail.issues ?? []).map((i) => [
        i.field,
        [`${i.rule === "after" ? "after" : "not_before"}:${i.other}`],
      ]),
    );
    return new ApiError(
      "validation_failed",
      "Leg times must be in the order they happen.",
      fields,
      {
        reason: "leg_order",
      },
    );
  }
  if (fail.error === "unknown_airfield") {
    return new ApiError(
      "validation_failed",
      "Unknown airfield.",
      { [fail.field ?? "airport"]: ["unknown_airfield"] },
      { reason: fail.error },
    );
  }
  return bookingError(fail.error);
}
