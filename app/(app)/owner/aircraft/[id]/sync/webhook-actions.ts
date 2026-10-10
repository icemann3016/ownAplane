"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { newWebhookSecret } from "@/lib/calendar-sync/signature";
import { sendTestWebhook } from "@/lib/calendar-sync/webhooks";
import { asUser } from "@/lib/db/rls";
import { calendarConnections } from "@/lib/db/schema";
import { type FormState, formValues } from "@/lib/forms";
import { webhookUrlSchema } from "@/lib/validation/calendar-sync";

// Webhooks to a connected system (SYN-6). RLS: only the aircraft's owner changes a connection.

const ids = z.object({ aircraftId: z.uuid(), id: z.uuid() });

async function update(
  userId: string,
  raw: Record<string, string>,
  values: { webhookUrl: string | null; webhookSecret?: string | null },
) {
  const parsed = ids.safeParse(raw);
  if (!parsed.success) return null;
  const [row] = await asUser(userId, (tx) =>
    tx
      .update(calendarConnections)
      .set(values)
      .where(
        and(
          eq(calendarConnections.id, parsed.data.id),
          eq(calendarConnections.aircraftId, parsed.data.aircraftId),
        ),
      )
      .returning({ id: calendarConnections.id, secret: calendarConnections.webhookSecret }),
  );
  if (row) revalidatePath(`/owner/aircraft/${parsed.data.aircraftId}/sync`);
  return row ?? null;
}

/** Set or change where changes are sent; a secret is made the first time. */
export async function saveWebhook(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/owner/aircraft");
  const t = await getTranslations("calendarSync.webhook");
  const raw = formValues(formData);
  const url = webhookUrlSchema.safeParse(raw.url);
  if (!url.success) return { errors: { url: [t("urlInvalid")] }, values: raw };
  const row = await update(user.id, raw, {
    webhookUrl: url.data,
    ...(raw.hasSecret === "1" ? {} : { webhookSecret: newWebhookSecret() }),
  });
  return row ? { ok: true, message: t("saved") } : { message: t("notFound"), values: raw };
}

/** A new signing secret; the old one stops working at once. */
export async function replaceWebhookSecret(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser("/owner/aircraft");
  const t = await getTranslations("calendarSync.webhook");
  const raw = formValues(formData);
  const parsed = ids.safeParse(raw);
  if (!parsed.success) return { message: t("notFound") };
  const [row] = await asUser(user.id, (tx) =>
    tx
      .update(calendarConnections)
      .set({ webhookSecret: newWebhookSecret() })
      .where(
        and(
          eq(calendarConnections.id, parsed.data.id),
          eq(calendarConnections.aircraftId, parsed.data.aircraftId),
        ),
      )
      .returning({ id: calendarConnections.id }),
  );
  if (!row) return { message: t("notFound") };
  revalidatePath(`/owner/aircraft/${parsed.data.aircraftId}/sync`);
  return { ok: true, message: t("secretReplaced") };
}

/** Stop sending changes to this system. */
export async function removeWebhook(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/owner/aircraft");
  const t = await getTranslations("calendarSync.webhook");
  const row = await update(user.id, formValues(formData), {
    webhookUrl: null,
    webhookSecret: null,
  });
  return row ? { ok: true, message: t("removed") } : { message: t("notFound") };
}

const ERRORS = new Set([
  "url_invalid",
  "address_blocked",
  "unreachable",
  "no_webhook",
  "not_found",
]);

/** Send a signed test call now and say how it went. */
export async function testWebhook(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/owner/aircraft");
  const t = await getTranslations("calendarSync.webhook");
  const parsed = ids.safeParse(formValues(formData));
  if (!parsed.success) return { message: t("notFound") };
  // The owner's own connection (RLS) before the trusted send.
  const [own] = await asUser(user.id, (tx) =>
    tx
      .select({ id: calendarConnections.id })
      .from(calendarConnections)
      .where(eq(calendarConnections.id, parsed.data.id)),
  );
  if (!own) return { message: t("notFound") };
  const result = await sendTestWebhook(own.id);
  revalidatePath(`/owner/aircraft/${parsed.data.aircraftId}/sync`);
  if (result.ok) return { ok: true, message: t("testOk") };
  const status = result.error.startsWith("http_") ? result.error.slice(5) : null;
  return {
    message: status
      ? t("errors.http", { status })
      : t(
          `errors.${ERRORS.has(result.error) ? result.error : "unreachable"}` as "errors.unreachable",
        ),
  };
}
