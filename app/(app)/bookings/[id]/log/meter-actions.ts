"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { asUser } from "@/lib/db/rls";
import { meterGapReason } from "@/lib/db/schema";
import { type FormState, formValues } from "@/lib/forms";

const schema = z.object({
  bookingId: z.uuid(),
  logId: z.uuid(),
  reason: z.union([z.enum(meterGapReason.enumValues), z.literal("")]),
});

/** The owner explains why the meters moved before this rental (or clears it). */
export async function explainMeterGap(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/bookings");
  const t = await getTranslations("flightLog.meters");
  const parsed = schema.safeParse(formValues(formData));
  if (!parsed.success) return { message: t("failed") };
  const { bookingId, logId, reason } = parsed.data;
  try {
    await asUser(user.id, (tx) =>
      tx.execute(
        sql`select public.explain_meter_gap(${logId}::uuid, ${reason || null}::public.meter_gap_reason)`,
      ),
    );
  } catch (e) {
    const err = e as { cause?: { code?: string } };
    if (err.cause?.code === "P0001") return { message: t("failed") };
    throw e;
  }
  revalidatePath(`/bookings/${bookingId}/log`);
  return { ok: true, message: t("saved") };
}
