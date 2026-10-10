"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { addRemark as storeRemark, deleteRemark as removeRemark } from "@/lib/bookings/log-entries";
import { type FormState, formValues } from "@/lib/forms";
import { localizedFieldErrors } from "@/lib/i18n/server";
import { remarkSchema } from "@/lib/validation/flight-log";

/** The pilot adds a remark or PIREP to the log (BKG-15). */
export async function addRemark(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/bookings");
  const t = await getTranslations("flightLog");
  const v = await getTranslations("validation");
  const raw = formValues(formData);
  const bookingId = z.uuid().safeParse(raw.bookingId);
  if (!bookingId.success) return { message: t("errors.not_found") };
  const parsed = remarkSchema.safeParse(raw);
  if (!parsed.success) return { errors: await localizedFieldErrors(parsed.error), values: raw };
  const { logId, kind, airport, body } = parsed.data;
  const outcome = await storeRemark(user.id, logId, { kind, airport: airport || null, body });
  if (!outcome.ok) {
    if (outcome.error === "unknown_airfield") {
      return { errors: { airport: [v("airportUnknown")] }, values: raw };
    }
    return { message: t("errors.not_editable"), values: raw };
  }
  revalidatePath(`/bookings/${bookingId.data}`, "layout");
  return { ok: true, message: t("remarkSaved") };
}

/** The pilot removes a remark while the log is editable (not once it's a known item). */
export async function deleteRemark(formData: FormData) {
  const user = await requireUser("/bookings");
  const remarkId = z.uuid().parse(formData.get("remarkId"));
  const logId = z.uuid().parse(formData.get("logId"));
  const bookingId = z.uuid().parse(formData.get("bookingId"));
  await removeRemark(user.id, logId, remarkId);
  revalidatePath(`/bookings/${bookingId}`, "layout");
}
