"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { feedErrorKey } from "@/lib/calendar-sync/feed-errors";
import { keyHint, savePartnerKey } from "@/lib/calendar-sync/partners";
import { syncConnection } from "@/lib/calendar-sync/sync";
import { asUser } from "@/lib/db/rls";
import { calendarConnections } from "@/lib/db/schema";
import type { FormState } from "@/lib/forms";
import { sendNotificationsSoon } from "@/lib/notifications/soon";
import { partnerKeySchema } from "@/lib/validation/calendar-sync";

// A partner connection's API key (SYN-7): the owner pastes a new one (e.g. after the partner
// replaced it). The key never goes back to the browser.

const input = z.object({ aircraftId: z.uuid(), id: z.uuid(), apiKey: partnerKeySchema });

/** Replace the key, then read the partner's bookings with it. */
export async function replacePartnerKey(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/owner/aircraft");
  const t = await getTranslations("calendarSync");
  const parsed = input.safeParse({
    aircraftId: formData.get("aircraftId"),
    id: formData.get("id"),
    apiKey: formData.get("apiKey") ?? "",
  });
  if (!parsed.success) {
    const v = await getTranslations("validation");
    return { errors: { apiKey: [v("partnerKeyInvalid")] } };
  }
  const { aircraftId, id, apiKey } = parsed.data;
  // RLS: only the aircraft's owner updates the connection; then trusted code keeps the key.
  const [conn] = await asUser(user.id, (tx) =>
    tx
      .update(calendarConnections)
      .set({ apiKeyHint: keyHint(apiKey) })
      .where(
        and(
          eq(calendarConnections.id, id),
          eq(calendarConnections.aircraftId, aircraftId),
          eq(calendarConnections.inbound, "partner"),
        ),
      )
      .returning(),
  );
  if (!conn) return { message: t("errors.not_found") };
  await savePartnerKey(conn.id, apiKey);
  sendNotificationsSoon();
  const result = await syncConnection(conn);
  revalidatePath(`/owner/aircraft/${aircraftId}/sync`);
  revalidatePath(`/owner/aircraft/${aircraftId}/calendar`);
  return result.ok
    ? { ok: true, message: t("partnerKey.saved", { count: result.count }) }
    : {
        message: t("partnerKey.failed", { reason: t(`feedErrors.${feedErrorKey(result.error)}`) }),
      };
}
