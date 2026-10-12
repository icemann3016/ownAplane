"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { feedErrorKey } from "@/lib/calendar-sync/feed-errors";
import { deletePartnerKey, storePartnerKey } from "@/lib/calendar-sync/partner-credentials";
import { PARTNER_INFO, PARTNERS } from "@/lib/calendar-sync/partner-list";
import { checkPartnerKey } from "@/lib/calendar-sync/partners";
import { syncConnection } from "@/lib/calendar-sync/sync";
import { asUser } from "@/lib/db/rls";
import { aircraft, calendarConnections } from "@/lib/db/schema";
import type { FormState } from "@/lib/forms";

// Connected services (SYN-7): the owner's API keys for partners. A key is checked with the
// partner, then stored encrypted; it never goes back to the browser, not even after an error.

const input = z.object({
  partner: z.enum(PARTNERS),
  apiKey: z
    .string()
    .trim()
    .regex(/^\S{8,500}$/),
});

/** The user's connections to a partner (RLS: their own aircraft only). */
const ownConnections = (userId: string, partner: string) =>
  asUser(userId, (tx) =>
    tx
      .select({
        id: calendarConnections.id,
        inbound: calendarConnections.inbound,
        feedUrl: calendarConnections.feedUrl,
        partner: calendarConnections.partner,
      })
      .from(calendarConnections)
      .innerJoin(aircraft, eq(aircraft.id, calendarConnections.aircraftId))
      .where(and(eq(aircraft.ownerId, userId), eq(calendarConnections.partner, partner))),
  );

export async function savePartnerKeyAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser("/account/connections");
  const t = await getTranslations("account.connections");
  const parsed = input.safeParse({
    partner: formData.get("partner"),
    apiKey: formData.get("apiKey") ?? "",
  });
  if (!parsed.success) return { errors: { apiKey: [t("keyInvalid")] } };
  const { partner, apiKey } = parsed.data;
  const name = PARTNER_INFO[partner].name;
  const check = await checkPartnerKey(partner, apiKey);
  if (!check.ok) {
    const reasons = await getTranslations("calendarSync.feedErrors");
    return {
      errors: {
        apiKey: [
          check.error === "key_rejected"
            ? t("keyRefused", { partner: name })
            : t("checkFailed", { partner: name, reason: reasons(feedErrorKey(check.error)) }),
        ],
      },
    };
  }
  await storePartnerKey(user.id, partner, apiKey);
  // Read the owner's connections to this partner again, now with the new key.
  for (const conn of await ownConnections(user.id, partner)) await syncConnection(conn);
  revalidatePath("/account/connections");
  revalidatePath("/owner/aircraft", "layout");
  return { ok: true, message: t("saved", { partner: name }) };
}

export async function removePartnerKeyAction(formData: FormData) {
  const user = await requireUser("/account/connections");
  const partner = input.shape.partner.safeParse(formData.get("partner"));
  if (!partner.success) return;
  await deletePartnerKey(user.id, partner.data);
  revalidatePath("/account/connections");
  revalidatePath("/owner/aircraft", "layout");
}
