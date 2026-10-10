"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { getUnits } from "@/lib/aircraft/queries";
import { requireUser } from "@/lib/auth/session";
import { getBooking } from "@/lib/bookings/queries";
import {
  deleteUplift as removeUplift,
  saveUplift as storeUplift,
} from "@/lib/bookings/log-entries";
import { type FormState, formValues } from "@/lib/forms";
import { localizedFieldErrors } from "@/lib/i18n/server";
import { upliftSchema } from "@/lib/validation/flight-log";

/** Add or change fuel or oil added during the rental (BKG-13, BKG-14). */
export async function saveUplift(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/bookings");
  const t = await getTranslations("flightLog");
  const v = await getTranslations("validation");
  const raw = formValues(formData);
  const detail = await getBooking(user.id, raw.bookingId ?? "");
  if (!detail) return { message: t("errors.not_found") };
  const parsed = upliftSchema(await getUnits(user.id), detail.aircraft.oilUnit).safeParse(raw);
  if (!parsed.success) return { errors: await localizedFieldErrors(parsed.error), values: raw };
  const { logId, upliftId, ...values } = parsed.data;
  const outcome = await storeUplift(user.id, logId, upliftId ?? null, values);
  if (!outcome.ok) {
    if (outcome.error === "unknown_airfield") {
      return { errors: { airport: [v("airportUnknown")] }, values: raw };
    }
    return { message: t("errors.not_editable"), values: raw };
  }
  revalidatePath(`/bookings/${detail.booking.id}`, "layout");
  return { ok: true, message: t("upliftSaved") };
}

/** Remove fuel or oil added while the log is still editable. */
export async function deleteUplift(formData: FormData) {
  const user = await requireUser("/bookings");
  const upliftId = z.uuid().parse(formData.get("upliftId"));
  const logId = z.uuid().parse(formData.get("logId"));
  const bookingId = z.uuid().parse(formData.get("bookingId"));
  await removeUplift(user.id, logId, upliftId);
  revalidatePath(`/bookings/${bookingId}`, "layout");
}
