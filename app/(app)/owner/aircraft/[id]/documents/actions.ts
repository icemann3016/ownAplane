"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  deleteAircraftDocument as removeDocument,
  saveAircraftDocument as storeDocument,
} from "@/lib/aircraft/manage-parts";
import { requireUser } from "@/lib/auth/session";
import { type FormState, formValues } from "@/lib/forms";
import { localizedFieldErrors } from "@/lib/i18n/server";
import { aircraftDocumentSchema } from "@/lib/validation/aircraft";

function refresh(aircraftId: string) {
  revalidatePath(`/owner/aircraft/${aircraftId}`, "layout");
  revalidatePath("/owner/aircraft");
  revalidatePath("/admin/verifications");
}

/** Add or change a document of the user's aircraft. RLS checks the aircraft and the upload. */
export async function saveAircraftDocument(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser("/owner/aircraft");
  const t = await getTranslations("aircraft.documents");
  const raw = formValues(formData);
  const parsed = aircraftDocumentSchema.safeParse(raw);
  if (!parsed.success) return { errors: await localizedFieldErrors(parsed.error), values: raw };
  const { id, aircraftId, kind, title, expiresOn, documentId } = parsed.data;

  const saved = await storeDocument(user.id, aircraftId, id ?? null, {
    kind,
    title,
    expiresOn,
    documentId,
  });
  if (!saved.ok) {
    if (saved.error === "add_renewal") return { message: t("addRenewal"), values: raw };
    if (saved.error === "document_invalid") {
      const v = await getTranslations("validation");
      return { errors: { documentId: [v("documentInvalid")] }, values: raw };
    }
    return { message: t("notFound"), values: raw };
  }
  refresh(aircraftId);
  return { ok: true, message: t("saved") };
}

const deleteSchema = z.object({ aircraftId: z.uuid(), id: z.uuid() });

/** Delete an aircraft document and its file (if nothing else uses it). */
export async function deleteAircraftDocument(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser("/owner/aircraft");
  const t = await getTranslations("aircraft.documents");
  const { aircraftId, id } = deleteSchema.parse(formValues(formData));
  const outcome = await removeDocument(user.id, aircraftId, id);
  if (!outcome.ok && outcome.error === "cant_delete_listed") {
    return { message: t("cantDeleteListed") };
  }
  refresh(aircraftId);
  return { ok: true };
}
