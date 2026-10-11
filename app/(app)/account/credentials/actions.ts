"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { type FormState, formValues } from "@/lib/forms";
import { localizedFieldErrors } from "@/lib/i18n/server";
import {
  deleteCredential as removeCredential,
  deleteTypeHours as removeTypeHours,
  saveCredential,
  saveExperience as storeExperience,
  saveTypeHours as storeTypeHours,
} from "@/lib/pilot/credential-ops";
import type { CredentialKind } from "@/lib/pilot/labels";
import {
  experienceSchema,
  licenceSchema,
  medicalSchema,
  ratingSchema,
  typeHoursSchema,
} from "@/lib/validation/pilot";

const PATH = "/account/credentials";

async function handleSave<S extends z.ZodType<{ id?: string; documentId: string | null }>>(
  kind: CredentialKind,
  schema: S,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser(PATH);
  const t = await getTranslations("pilot");
  const raw = formValues(formData);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { errors: await localizedFieldErrors(parsed.error), values: raw };

  const { id, ...data } = parsed.data;
  const result = await saveCredential(user.id, kind, id, data);
  if (!result.ok) {
    if (result.error === "documentInvalid") {
      const v = await getTranslations("validation");
      return { errors: { documentId: [v("documentInvalid")] }, values: raw };
    }
    return { message: t("errors.notFound"), values: raw };
  }
  revalidatePath(PATH);
  revalidatePath("/dashboard");
  const savedKey = { licence: "licences.saved", rating: "ratings.saved", medical: "medical.saved" }[
    kind
  ] as "licences.saved";
  return { ok: true, message: t(savedKey) };
}

export async function saveLicence(_prev: FormState, formData: FormData) {
  return handleSave("licence", licenceSchema, formData);
}

export async function saveRating(_prev: FormState, formData: FormData) {
  return handleSave("rating", ratingSchema, formData);
}

export async function saveMedical(_prev: FormState, formData: FormData) {
  return handleSave("medical", medicalSchema, formData);
}

const deleteSchema = z.object({
  kind: z.enum(["licence", "rating", "medical"]),
  id: z.uuid(),
});

/** Delete a credential and its document (if nothing else uses it). */
export async function deleteCredential(formData: FormData) {
  const user = await requireUser(PATH);
  const { kind, id } = deleteSchema.parse(formValues(formData));
  await removeCredential(user.id, kind, id);
  revalidatePath(PATH);
  revalidatePath("/dashboard");
}

export async function saveExperience(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(PATH);
  const t = await getTranslations("pilot.experience");
  const raw = formValues(formData);
  const parsed = experienceSchema.safeParse(raw);
  if (!parsed.success) return { errors: await localizedFieldErrors(parsed.error), values: raw };

  await storeExperience(user.id, parsed.data);
  revalidatePath(PATH);
  return { ok: true, message: t("saved"), values: raw };
}

export async function saveTypeHours(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(PATH);
  const raw = formValues(formData);
  const parsed = typeHoursSchema.safeParse(raw);
  if (!parsed.success) return { errors: await localizedFieldErrors(parsed.error), values: raw };

  await storeTypeHours(user.id, parsed.data.aircraftType, parsed.data.hours);
  revalidatePath(PATH);
  return { ok: true };
}

export async function deleteTypeHours(formData: FormData) {
  const user = await requireUser(PATH);
  const aircraftType = z
    .string()
    .regex(/^[A-Z0-9]{2,6}$/)
    .parse(formData.get("aircraftType"));
  await removeTypeHours(user.id, aircraftType);
  revalidatePath(PATH);
}
