"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getMyEligibility } from "@/lib/aircraft/eligibility";
import { eligibilityText } from "@/lib/aircraft/eligibility-text";
import { getVisibleAircraft } from "@/lib/aircraft/public";
import { requireUser } from "@/lib/auth/session";
import { flightAirfields, requestBooking } from "@/lib/bookings/request";
import { type FormState, formValues } from "@/lib/forms";
import { localizedFieldErrors } from "@/lib/i18n/server";
import type { PilotTranslate } from "@/lib/pilot/labels";
import { bookingRequestSchema } from "@/lib/validation/booking";
import { sendNotificationsSoon } from "@/lib/notifications/soon";

/** Send a booking request (BKG-1). On success, go to the booking. */
export async function submitBookingRequest(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = formValues(formData);
  const user = await requireUser(`/aircraft/${raw.aircraftId ?? ""}/book`);
  const t = await getTranslations("booking.errors");
  const stops = formData.getAll("stops").map(String);
  const values = { ...raw, stops: stops.join(",") };
  const parsed = bookingRequestSchema.safeParse({ ...raw, stops });
  if (!parsed.success) return { errors: await localizedFieldErrors(parsed.error), values };

  sendNotificationsSoon();
  const outcome = await requestBooking(user.id, parsed.data);
  if (outcome.ok) redirect(`/bookings/${outcome.id}`);

  const v = await getTranslations("validation");
  switch (outcome.error) {
    case "not_eligible": {
      const failures = await getMyEligibility(
        user.id,
        parsed.data.aircraftId,
        outcome.period,
        flightAirfields(parsed.data),
      );
      const te = (await getTranslations("aircraft.eligibility")) as unknown as (
        key: string,
        values?: Record<string, string | number>,
      ) => string;
      const tp = (await getTranslations("pilot")) as unknown as PilotTranslate;
      const type = (await getVisibleAircraft(user.id, parsed.data.aircraftId))?.aircraft
        .typeDesignator;
      return {
        message: t("not_eligible"),
        errors: {
          eligibility: failures
            .filter((f) => f.blocking)
            .map((f) => eligibilityText(f, te, tp, type ?? "")),
        },
        values,
      };
    }
    case "too_many_passengers":
      return {
        errors: { passengers: [t("too_many_passengers", { max: outcome.detail ?? "0" })] },
        values,
      };
    case "lapl_passengers":
      return { errors: { passengers: [t("lapl_passengers")] }, values };
    case "period_in_past":
    case "period_length":
      return { errors: { from: [t(outcome.error)] }, values };
    case "endBeforeStart":
    case "dateTimeInvalid":
      return { errors: { [outcome.field ?? "to"]: [v(outcome.error)] }, values };
    case "unknown_airfield":
      return { errors: { departure: [v("airportUnknown")] }, values };
    case "not_free":
    case "aircraft_unavailable":
      return { message: t(outcome.error), values };
    default:
      return { message: t("failed"), values };
  }
}
