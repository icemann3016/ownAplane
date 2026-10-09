"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { newApiKey } from "@/lib/calendar-sync/keys";
import { syncConnection } from "@/lib/calendar-sync/sync";
import { sendNotificationsSoon } from "@/lib/notifications/soon";
import { asUser } from "@/lib/db/rls";
import { calendarConnections } from "@/lib/db/schema";
import { type FormState, formValues } from "@/lib/forms";
import { localizedFieldErrors } from "@/lib/i18n/server";
import { connectionSchema } from "@/lib/validation/calendar-sync";

// Calendar sync with other booking systems (SYN-1…5). The database checks that the user owns the
// aircraft (RLS); reading feeds and writing busy times is trusted sync code.

const ids = z.object({ aircraftId: z.uuid(), id: z.uuid() });

function pgError(e: unknown) {
  const err = e as { cause?: { code?: string; message?: string } };
  return { code: err.cause?.code, message: err.cause?.message };
}

function refresh(aircraftId: string) {
  revalidatePath(`/owner/aircraft/${aircraftId}/sync`);
  revalidatePath(`/owner/aircraft/${aircraftId}/calendar`);
  revalidatePath(`/aircraft/${aircraftId}`);
}

/** The user's own connection (RLS), for actions on it. */
async function ownConnection(userId: string, raw: Record<string, string>) {
  const parsed = ids.safeParse(raw);
  if (!parsed.success) return null;
  const [row] = await asUser(userId, (tx) =>
    tx
      .select()
      .from(calendarConnections)
      .where(
        and(
          eq(calendarConnections.id, parsed.data.id),
          eq(calendarConnections.aircraftId, parsed.data.aircraftId),
        ),
      ),
  );
  return row ?? null;
}

/** Connect another system; push connections get an API key, shown once. */
export async function addConnection(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/owner/aircraft");
  const t = await getTranslations("calendarSync");
  const raw = formValues(formData);
  const parsed = connectionSchema.safeParse(raw);
  if (!parsed.success) return { errors: await localizedFieldErrors(parsed.error), values: raw };
  const { aircraftId, name, inbound, feedUrl } = parsed.data;
  const key = inbound === "push" ? newApiKey() : null;
  let created;
  try {
    [created] = await asUser(user.id, (tx) =>
      tx
        .insert(calendarConnections)
        .values({
          aircraftId,
          name,
          inbound,
          feedUrl,
          apiKeyHash: key?.hash ?? null,
          apiKeyHint: key?.hint ?? null,
        })
        .returning(),
    );
  } catch (e) {
    const { code, message } = pgError(e);
    if (code === "P0001" && message === "too_many_connections") {
      return { message: t("errors.too_many"), values: raw };
    }
    if (code === "42501") return { message: t("errors.not_allowed"), values: raw };
    throw e;
  }
  refresh(aircraftId);
  if (key) return { ok: true, message: t("added.push"), secret: key.key };
  if (created && (inbound === "ical" || inbound === "json")) {
    sendNotificationsSoon();
    const result = await syncConnection(created);
    refresh(aircraftId);
    return result.ok
      ? { ok: true, message: t("added.synced", { count: result.count }) }
      : { message: t("added.failed", { reason: t(`feedErrors.${feedError(result.error)}`) }) };
  }
  return { ok: true, message: t("added.none") };
}

const FEED_ERRORS = [
  "url_invalid",
  "address_blocked",
  "unreachable",
  "http_error",
  "too_large",
  "ical_invalid",
  "json_invalid",
] as const;
const feedError = (code: string) =>
  (FEED_ERRORS as readonly string[]).includes(code)
    ? (code as (typeof FEED_ERRORS)[number])
    : "failed";

/** Read an iCal/JSON connection now. */
export async function syncNow(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/owner/aircraft");
  const t = await getTranslations("calendarSync");
  const conn = await ownConnection(user.id, formValues(formData));
  if (!conn) return { message: t("errors.not_found") };
  sendNotificationsSoon();
  const result = await syncConnection(conn);
  refresh(conn.aircraftId);
  return result.ok
    ? { ok: true, message: t("synced", { count: result.count }) }
    : { message: t(`feedErrors.${feedError(result.error)}`) };
}

/** A new API key for a push connection; the old one stops working at once. */
export async function replaceApiKey(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/owner/aircraft");
  const t = await getTranslations("calendarSync");
  const conn = await ownConnection(user.id, formValues(formData));
  if (!conn || conn.inbound !== "push") return { message: t("errors.not_found") };
  const key = newApiKey();
  await asUser(user.id, (tx) =>
    tx
      .update(calendarConnections)
      .set({ apiKeyHash: key.hash, apiKeyHint: key.hint })
      .where(eq(calendarConnections.id, conn.id)),
  );
  refresh(conn.aircraftId);
  return { ok: true, message: t("keyReplaced"), secret: key.key };
}

/** A new private iCal link; the old one stops working at once. */
export async function resetExportLink(formData: FormData) {
  const user = await requireUser("/owner/aircraft");
  const conn = await ownConnection(user.id, formValues(formData));
  if (!conn) return;
  const { randomBytes } = await import("node:crypto");
  await asUser(user.id, (tx) =>
    tx
      .update(calendarConnections)
      .set({ exportToken: randomBytes(32).toString("hex") })
      .where(eq(calendarConnections.id, conn.id)),
  );
  refresh(conn.aircraftId);
}

/** Disconnect: its busy times are removed with it (the time becomes free here). */
export async function removeConnection(formData: FormData) {
  const user = await requireUser("/owner/aircraft");
  const conn = await ownConnection(user.id, formValues(formData));
  if (!conn) return;
  await asUser(user.id, (tx) =>
    tx.delete(calendarConnections).where(eq(calendarConnections.id, conn.id)),
  );
  refresh(conn.aircraftId);
}
