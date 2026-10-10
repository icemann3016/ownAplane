"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { asUser } from "@/lib/db/rls";
import { aircraft, calendarEntries } from "@/lib/db/schema";
import { toRange, zonedToUtc } from "@/lib/domain/time";
import { type FormState, formValues } from "@/lib/forms";
import { localizedFieldErrors } from "@/lib/i18n/server";
import { sendNotificationsSoon } from "@/lib/notifications/soon";
import { calendarBlockSchema } from "@/lib/validation/aircraft";

/** Postgres error code of a failed query (drizzle wraps the driver error). */
function pgCode(e: unknown): string | undefined {
  const err = e as { code?: string; cause?: { code?: string } };
  return err.cause?.code ?? err.code;
}

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

  const home = await asUser(user.id, async (tx) => {
    const [row] = await tx
      .select({ ident: aircraft.homeAirportIdent })
      .from(aircraft)
      .where(and(eq(aircraft.id, aircraftId), eq(aircraft.ownerId, user.id)));
    return row;
  });
  if (!home) return { message: t("notFound"), values: raw };
  // Times are entered in UTC (aviation convention).
  const timeZone = "UTC";
  const from = zonedToUtc(parsed.data.from, timeZone);
  const to = zonedToUtc(parsed.data.to, timeZone);
  const v = await getTranslations("validation");
  if (!from) return { errors: { from: [v("dateTimeInvalid")] }, values: raw };
  if (!to || to <= from) return { errors: { to: [v("endBeforeStart")] }, values: raw };

  try {
    await asUser(user.id, (tx) =>
      tx.insert(calendarEntries).values({ aircraftId, kind, note, period: toRange(from, to) }),
    );
  } catch (e) {
    const code = pgCode(e);
    if (code === "23P01") return { message: t("overlaps"), values: raw };
    if (code === "23514") return { errors: { to: [t("tooLong")] }, values: raw };
    throw e;
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
  await asUser(user.id, (tx) =>
    tx
      .delete(calendarEntries)
      .where(
        and(
          eq(calendarEntries.id, id),
          eq(calendarEntries.aircraftId, aircraftId),
          ne(calendarEntries.kind, "booking"),
        ),
      ),
  );
  refresh(aircraftId);
  sendNotificationsSoon(); // webhooks to connected systems (SYN-6)
}
