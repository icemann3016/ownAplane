"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { getMyPlan } from "@/lib/billing/plan";
import { PLANS } from "@/lib/billing/plans";
import { feedErrorKey } from "@/lib/calendar-sync/feed-errors";
import { exportFields, importFields } from "@/lib/calendar-sync/fields";
import { newApiKey } from "@/lib/calendar-sync/keys";
import { keyHint, savePartnerKey } from "@/lib/calendar-sync/partners";
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

/**
 * Connect another system; push connections get an API key, shown once; a partner's key is kept
 * where only the sync code reads it (SYN-7) and never sent back to the form.
 */
export async function addConnection(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/owner/aircraft");
  const t = await getTranslations("calendarSync");
  const { apiKey: _apiKey, ...raw } = formValues(formData);
  const parsed = connectionSchema.safeParse(formValues(formData));
  if (!parsed.success) return { errors: await localizedFieldErrors(parsed.error), values: raw };
  const { aircraftId, name, inbound, feedUrl, partner, apiKey } = parsed.data;
  // A calendar link only (for Google or Outlook) comes with a paid plan (SUB-10); syncing with
  // other booking systems, which prevents double bookings, is on every plan.
  if (inbound === "none" && !PLANS[(await getMyPlan(user.id)).plan].calendarLink) {
    return { message: t("errors.planNeeded"), values: raw };
  }
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
          partner,
          apiKeyHash: key?.hash ?? null,
          apiKeyHint: key?.hint ?? (apiKey ? keyHint(apiKey) : null),
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
  // The insert above checked (RLS) that the user owns the aircraft.
  if (created && apiKey) await savePartnerKey(created.id, apiKey);
  refresh(aircraftId);
  if (key) return { ok: true, message: t("added.push"), secret: key.key };
  if (created && (inbound === "ical" || inbound === "json" || inbound === "partner")) {
    sendNotificationsSoon();
    const result = await syncConnection(created);
    refresh(aircraftId);
    return result.ok
      ? { ok: true, message: t("added.synced", { count: result.count }) }
      : {
          message: t(inbound === "partner" ? "added.partnerFailed" : "added.failed", {
            reason: t(`feedErrors.${feedErrorKey(result.error)}`),
          }),
        };
  }
  return { ok: true, message: t("added.none") };
}

/** Read a link or partner connection now. */
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
    : { message: t(`feedErrors.${feedErrorKey(result.error)}`) };
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

/** What this connection exchanges besides the times (export and import fields). */
export async function saveDataFields(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/owner/aircraft");
  const t = await getTranslations("calendarSync");
  const conn = await ownConnection(user.id, formValues(formData));
  if (!conn) return { message: t("errors.not_found") };
  const strings = (name: string) => formData.getAll(name).map(String);
  await asUser(user.id, (tx) =>
    tx
      .update(calendarConnections)
      .set({
        exportFields: exportFields(strings("export")),
        // An export-only connection takes nothing.
        importFields: conn.inbound === "none" ? [] : importFields(strings("import")),
      })
      .where(eq(calendarConnections.id, conn.id)),
  );
  refresh(conn.aircraftId);
  return { ok: true, message: t("data.saved") };
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
