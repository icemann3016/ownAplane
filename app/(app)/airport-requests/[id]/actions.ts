"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { answerAirportRequest, cancelAirportRequest } from "@/lib/airport-requests/ops";
import { requireUser } from "@/lib/auth/session";
import { type FormState, formValues } from "@/lib/forms";
import { localizedFieldErrors } from "@/lib/i18n/server";
import { sendNotificationsSoon } from "@/lib/notifications/soon";
import { requestAnswerSchema } from "@/lib/validation/airport-request";

const idOf = (formData: FormData) => z.uuid().safeParse(formData.get("id"));

/** The pilot cancels their request. */
export async function cancelRequestAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = idOf(formData);
  const user = await requireUser("/airport-requests");
  const t = await getTranslations("airportRequests");
  if (!id.success) return { message: t("errors.not_allowed") };
  sendNotificationsSoon();
  const result = await cancelAirportRequest(user.id, id.data);
  if (!result.ok) return { message: t(`errors.${result.error}`) };
  revalidatePath(`/airport-requests/${id.data}`);
  revalidatePath("/airport-requests");
  return { ok: true, message: t("detail.cancelled") };
}

/** The airfield's team approves (with a PPR number and conditions) or declines. */
export async function answerRequestAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = idOf(formData);
  const user = await requireUser("/airports/manage");
  const t = await getTranslations("airportRequests");
  const raw = formValues(formData);
  if (!id.success) return { message: t("errors.not_allowed"), values: raw };
  const parsed = requestAnswerSchema.safeParse(raw);
  if (!parsed.success) return { errors: await localizedFieldErrors(parsed.error), values: raw };
  sendNotificationsSoon();
  const result = await answerAirportRequest(user.id, id.data, parsed.data);
  if (!result.ok) return { message: t(`errors.${result.error}`), values: raw };
  revalidatePath(`/airport-requests/${id.data}`);
  revalidatePath("/airports/manage", "layout");
  return { ok: true, message: t("answer.saved"), values: raw };
}
