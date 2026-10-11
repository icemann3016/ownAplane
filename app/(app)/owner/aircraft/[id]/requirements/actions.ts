"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { saveRequirements as storeRequirements } from "@/lib/aircraft/manage-parts";
import { requireUser } from "@/lib/auth/session";
import { type FormState, formValues } from "@/lib/forms";
import { localizedFieldErrors } from "@/lib/i18n/server";
import { requirementsSchema } from "@/lib/validation/aircraft";

/** Save who may rent the user's aircraft (RAT-6, RAT-7). */
export async function saveRequirements(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/owner/aircraft");
  const t = await getTranslations("aircraft.edit");
  const raw = formValues(formData);
  const parsed = requirementsSchema.safeParse({
    ...raw,
    licenceTypes: formData.getAll("licenceTypes"),
    requiredRatings: formData.getAll("requiredRatings"),
  });
  const values = {
    ...raw,
    licenceTypes: formData.getAll("licenceTypes").join(","),
    requiredRatings: formData.getAll("requiredRatings").join(","),
  };
  if (!parsed.success) return { errors: await localizedFieldErrors(parsed.error), values };
  const { aircraftId, ...data } = parsed.data;

  const saved = await storeRequirements(user.id, aircraftId, data);
  const status = saved.ok ? saved.status : null;
  if (!status) return { message: t("notFound"), values };

  revalidatePath(`/owner/aircraft/${aircraftId}`, "layout");
  revalidatePath(`/aircraft/${aircraftId}`);
  // Last setup step: drafts go to the overview to publish.
  if (status === "draft") redirect(`/owner/aircraft/${aircraftId}`);
  return { ok: true, message: t("saved"), values };
}
