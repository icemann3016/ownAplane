"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { cancelBooking, respondToBooking } from "@/lib/bookings/respond";
import { zonedToUtc } from "@/lib/domain/time";
import { type FormState, formValues } from "@/lib/forms";
import { localizedFieldErrors } from "@/lib/i18n/server";
import { bookingResponseSchema } from "@/lib/validation/booking";
import { sendNotificationsSoon } from "@/lib/notifications/soon";

/** The owner accepts, declines or suggests another time (BKG-3). */
export async function answerBooking(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/bookings");
  const t = await getTranslations("booking.respond");
  const raw = formValues(formData);
  const parsed = bookingResponseSchema.safeParse(raw);
  if (!parsed.success) return { errors: await localizedFieldErrors(parsed.error), values: raw };
  const { bookingId, decision, note } = parsed.data;

  let proposal: { from: Date; to: Date } | null = null;
  if (decision === "propose") {
    const zone = "UTC";
    const from = zonedToUtc(parsed.data.proposeFrom!, zone);
    const to = zonedToUtc(parsed.data.proposeTo!, zone);
    if (!from || !to || to <= from) {
      const v = await getTranslations("validation");
      return { errors: { proposeTo: [v("endBeforeStart")] }, values: raw };
    }
    proposal = { from, to };
  }

  sendNotificationsSoon();
  const outcome = await respondToBooking(
    user.id,
    bookingId,
    decision === "accept" ? "accept" : "decline",
    note || null,
    proposal,
  );
  if (!outcome.ok) {
    const known = [
      "not_found",
      "not_open",
      "pilot_not_eligible",
      "bad_proposal",
      "aircraft_grounded",
      "booked_elsewhere",
    ];
    return {
      message: t(
        `errors.${known.includes(outcome.error) ? outcome.error : "failed"}` as "errors.failed",
      ),
      values: raw,
    };
  }
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/bookings");
  return { ok: true, message: t(`done.${decision}`) };
}

const cancelSchema = z.object({
  bookingId: z.uuid(),
  reason: z.string().trim().min(1, "reasonRequired").max(500, "textTooLong"),
});

/** Cancel a booking (pilot or owner), with a reason (BKG-6). */
export async function cancelBookingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser("/bookings");
  const t = await getTranslations("booking.cancel");
  const raw = formValues(formData);
  const parsed = cancelSchema.safeParse(raw);
  if (!parsed.success) return { errors: await localizedFieldErrors(parsed.error), values: raw };
  sendNotificationsSoon();
  const outcome = await cancelBooking(user.id, parsed.data.bookingId, parsed.data.reason);
  if (!outcome.ok) {
    const known = ["not_found", "not_cancellable", "reason_required"];
    return {
      message: t(
        `errors.${known.includes(outcome.error) ? outcome.error : "failed"}` as "errors.failed",
      ),
      values: raw,
    };
  }
  revalidatePath(`/bookings/${parsed.data.bookingId}`);
  revalidatePath("/bookings");
  return { ok: true, message: outcome.late ? t("doneLate") : t("done") };
}
