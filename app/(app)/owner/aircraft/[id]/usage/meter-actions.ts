"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  addMeterReading as storeReading,
  deleteMeterReading as removeReading,
} from "@/lib/aircraft/owner-ops";
import { requireUser } from "@/lib/auth/session";
import { zonedToUtc } from "@/lib/domain/time";
import { type FormState, formValues } from "@/lib/forms";
import { localizedFieldErrors } from "@/lib/i18n/server";
import { meterReadingSchema } from "@/lib/validation/aircraft";

// Meter readings between rentals (BKG-7): the starting point for the next rental's meter check.
// RLS lets only the aircraft's owner add or remove them.

/** Record the aircraft's Hobbs/tach, e.g. after flying outside ownAplane. */
export async function addMeterReading(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/owner/aircraft");
  const t = await getTranslations("usage.meters");
  const v = await getTranslations("validation");
  const raw = formValues(formData);
  const parsed = meterReadingSchema.safeParse(raw);
  if (!parsed.success) return { errors: await localizedFieldErrors(parsed.error), values: raw };
  const { aircraftId, hobbs, tach, note } = parsed.data;
  const readAt = zonedToUtc(parsed.data.readAt, "UTC");
  if (!readAt) return { errors: { readAt: [v("dateTimeInvalid")] }, values: raw };
  const saved = await storeReading(user.id, aircraftId, { readAt, hobbs, tach, note });
  if (!saved.ok) {
    if (saved.error === "reading_in_future") {
      return { errors: { readAt: [t("inFuture")] }, values: raw };
    }
    return { message: t("notAllowed"), values: raw };
  }
  revalidatePath(`/owner/aircraft/${aircraftId}/usage`);
  return { ok: true, message: t("added") };
}

const deleteSchema = z.object({ aircraftId: z.uuid(), id: z.uuid() });

/** Remove a reading recorded by mistake. */
export async function deleteMeterReading(formData: FormData) {
  const user = await requireUser("/owner/aircraft");
  const { aircraftId, id } = deleteSchema.parse(formValues(formData));
  await removeReading(user.id, aircraftId, id);
  revalidatePath(`/owner/aircraft/${aircraftId}/usage`);
}
