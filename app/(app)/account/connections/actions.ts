"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { feedErrorKey } from "@/lib/calendar-sync/feed-errors";
import { deletePartnerKey, storePartnerKey } from "@/lib/calendar-sync/partner-credentials";
import { type Partner, PARTNER_INFO, PARTNERS } from "@/lib/calendar-sync/partner-list";
import {
  checkPartnerKey,
  type PartnerSyncResult,
  removePartnerConnections,
  syncPartnerAccount,
} from "@/lib/calendar-sync/partners";
import type { FormState } from "@/lib/forms";
import { sendNotificationsSoon } from "@/lib/notifications/soon";

// Connected services (SYN-7): the owner's API keys for partners. A key is checked with the
// partner, then stored encrypted; it never goes back to the browser, not even after an error.
// With a key, the partner is read for all the owner's aircraft: no setup per aircraft.

const partnerSchema = z.enum(PARTNERS);
const input = z.object({
  partner: partnerSchema,
  apiKey: z
    .string()
    .trim()
    .regex(/^\S{8,500}$/),
});

function refresh() {
  revalidatePath("/account/connections");
  revalidatePath("/owner/aircraft", "layout");
  revalidatePath("/aircraft", "layout");
}

/** What a read found, for the owner: which aircraft got bookings, which registrations didn't match. */
async function summary(partner: Partner, result: PartnerSyncResult): Promise<FormState> {
  const t = await getTranslations("account.connections");
  const name = PARTNER_INFO[partner].name;
  if (!result.ok) {
    const reasons = await getTranslations("calendarSync.feedErrors");
    return {
      message: t("syncFailed", { partner: name, reason: reasons(feedErrorKey(result.error)) }),
    };
  }
  const lines = [
    result.aircraft.length
      ? t("syncedAircraft", {
          list: result.aircraft
            .map((a) => t("aircraftCount", { registration: a.registration, count: a.count }))
            .join(", "),
        })
      : t("syncedNothing", { partner: name }),
  ];
  if (result.unmatched.length) {
    lines.push(t("unmatched", { partner: name, registrations: result.unmatched.join(", ") }));
  }
  return { ok: true, message: lines.join(" ") };
}

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
  sendNotificationsSoon();
  const result = await summary(partner, await syncPartnerAccount(user.id, partner));
  refresh();
  return { ...result, message: `${t("saved", { partner: name })} ${result.message ?? ""}`.trim() };
}

/** Read the partner again now, for all the owner's aircraft. */
export async function syncPartnerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/account/connections");
  const partner = partnerSchema.safeParse(formData.get("partner"));
  if (!partner.success) return {};
  sendNotificationsSoon();
  const result = await summary(partner.data, await syncPartnerAccount(user.id, partner.data));
  refresh();
  return result;
}

/** Remove the key: the partner's busy times leave the owner's aircraft with their connections. */
export async function removePartnerKeyAction(formData: FormData) {
  const user = await requireUser("/account/connections");
  const partner = partnerSchema.safeParse(formData.get("partner"));
  if (!partner.success) return;
  await deletePartnerKey(user.id, partner.data);
  await removePartnerConnections(user.id, partner.data);
  refresh();
}
