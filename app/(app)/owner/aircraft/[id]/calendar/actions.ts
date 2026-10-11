"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  addCalendarBlock as storeBlock,
  deleteCalendarBlock as removeBlock,
} from "@/lib/aircraft/owner-ops";
import { requireUser } from "@/lib/auth/session";
import { zonedToUtc } from "@/lib/domain/time";
import { type FormState, formValues } from "@/lib/forms";
import { localizedFieldErrors } from "@/lib/i18n/server";
import { sendNotificationsSoon } from "@/lib/notifications/soon";
import { calendarBlockSchema } from "@/lib/validation/aircraft";

function refresh(aircraftId: string) {
  revalidatePath(`/owner/aircraft/${aircraftId}/calendar`);
  revalidatePath(`/aircraft/${aircraftId}`);
}

/** Block time on the user's aircraft (own use, maintenance, unavailable). SRC-5 */
export async function addCalendarBlock(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/owner/aircraft");
  const t = await getTranslations("aircraft.calendar");
  const raw = formValues(formData);
  const parsed = calendarBlockSchema.safeParse(raw);
  if (!parsed.success) return { errors: await localizedFieldErrors(parsed.error), values: raw };
  const { aircraftId, kind, note } = parsed.data;

  // Times are entered in UTC (aviation convention).
  const timeZone = "UTC";
  const from = zonedToUtc(parsed.data.from, timeZone);
  const to = zonedToUtc(parsed.data.to, timeZone);
  const v = await getTranslations("validation");
  if (!from) return { errors: { from: [v("dateTimeInvalid")] }, values: raw };
  if (!to || to <= from) return { errors: { to: [v("endBeforeStart")] }, values: raw };

  const saved = await storeBlock(user.id, aircraftId, { kind, from, to, note });
  if (!saved.ok) {
    if (saved.error === "overlaps") return { message: t("overlaps"), values: raw };
    if (saved.error === "too_long") return { errors: { to: [t("tooLong")] }, values: raw };
    return { message: t("notFound"), values: raw };
  }
  refresh(aircraftId);
  sendNotificationsSoon(); // webhooks to connected systems (SYN-6)
  return { ok: true, message: t("added") };
}

const deleteSchema = z.object({ aircraftId: z.uuid(), id: z.uuid() });

/** Remove one of the owner's blocks (bookings are released by the booking flow). */
export async function deleteCalendarBlock(formData: FormData) {
  const user = await requireUser("/owner/aircraft");
  const { aircraftId, id } = deleteSchema.parse(formValues(formData));
  await removeBlock(user.id, aircraftId, id);
  refresh(aircraftId);
  sendNotificationsSoon(); // webhooks to connected systems (SYN-6)
}
