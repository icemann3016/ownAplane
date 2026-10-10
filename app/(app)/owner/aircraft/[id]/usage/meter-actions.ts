"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { asUser } from "@/lib/db/rls";
import { meterReadings } from "@/lib/db/schema";
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
  try {
    await asUser(user.id, (tx) =>
      tx.insert(meterReadings).values({ aircraftId, readAt, hobbs, tach, note }),
    );
  } catch (e) {
    const err = e as { cause?: { code?: string; message?: string } };
    if (err.cause?.message === "reading_in_future") {
      return { errors: { readAt: [t("inFuture")] }, values: raw };
    }
    if (err.cause?.code === "42501") return { message: t("notAllowed"), values: raw };
    throw e;
  }
  revalidatePath(`/owner/aircraft/${aircraftId}/usage`);
  return { ok: true, message: t("added") };
}

const deleteSchema = z.object({ aircraftId: z.uuid(), id: z.uuid() });

/** Remove a reading recorded by mistake. */
export async function deleteMeterReading(formData: FormData) {
  const user = await requireUser("/owner/aircraft");
  const { aircraftId, id } = deleteSchema.parse(formValues(formData));
  await asUser(user.id, (tx) =>
    tx
      .delete(meterReadings)
      .where(and(eq(meterReadings.id, id), eq(meterReadings.aircraftId, aircraftId))),
  );
  revalidatePath(`/owner/aircraft/${aircraftId}/usage`);
}
