"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { confirmClaimCode, sendClaimCode } from "@/lib/airport-teams/claim-code";
import { fileClaim, withdrawClaim } from "@/lib/airport-teams/claims";
import { requireUser } from "@/lib/auth/session";
import { type FormState, formValues } from "@/lib/forms";
import { localizedFieldErrors } from "@/lib/i18n/server";
import { claimCodeSchema, claimSchema } from "@/lib/validation/airport-teams";

// Claims to run an airfield (APT-1). The database lets people file and withdraw only their own
// claims (RLS); the email code is checked by trusted code.

const claimId = z.object({ id: z.uuid() });

export async function fileClaimAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/airports/manage/claim");
  const t = await getTranslations("airports.errors");
  const raw = formValues(formData);
  const parsed = claimSchema.safeParse(raw);
  if (!parsed.success) return { errors: await localizedFieldErrors(parsed.error), values: raw };
  const d = parsed.data;
  const result = await fileClaim(user.id, {
    airportIdent: d.airport,
    position: d.position,
    note: d.note || null,
    proof: d.proof === "email" ? { email: d.email } : { documentId: d.documentId },
  });
  if (!result.ok) {
    const field = result.error === "free_email" ? "email" : "airport";
    return { errors: { [field]: [t(result.error)] }, values: raw };
  }
  revalidatePath("/airports/manage");
  redirect(
    `/airports/manage?filed=${result.status === "pending" ? "pending" : result.codeSent ? "unconfirmed" : "unsent"}`,
  );
}

export async function confirmCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/airports/manage");
  const t = await getTranslations("airports");
  const parsed = claimCodeSchema.safeParse(formValues(formData));
  if (!parsed.success) return { errors: { code: [t("errors.wrong_code")] } };
  const result = await confirmClaimCode(user.id, parsed.data.id, parsed.data.code);
  if (!result.ok) return { errors: { code: [t(`errors.${result.error}`)] } };
  revalidatePath("/airports/manage");
  return { ok: true, message: t("claimCard.confirmed") };
}

export async function resendCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/airports/manage");
  const t = await getTranslations("airports");
  const parsed = claimId.safeParse(formValues(formData));
  if (!parsed.success) return { message: t("errors.not_found") };
  const result = await sendClaimCode(user.id, parsed.data.id);
  revalidatePath("/airports/manage");
  return result.ok
    ? { ok: true, message: t("claimCard.codeSent") }
    : { message: t(`errors.${result.error}`) };
}

export async function withdrawClaimAction(formData: FormData) {
  const user = await requireUser("/airports/manage");
  const parsed = claimId.safeParse(formValues(formData));
  if (!parsed.success) return;
  await withdrawClaim(user.id, parsed.data.id);
  revalidatePath("/airports/manage");
}
