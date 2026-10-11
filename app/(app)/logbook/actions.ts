"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { type FormState, formValues } from "@/lib/forms";
import { localizedFieldErrors } from "@/lib/i18n/server";
import {
  certifyEntries,
  createEntry,
  deleteEntry as removeEntry,
  updateEntry,
  voidEntry,
} from "@/lib/logbook/ops";
import { logbookEntrySchema } from "@/lib/validation/logbook";

// The logbook's forms (LOG-1…3): parse and translate here; the work is in lib/logbook (shared
// with the API).

const PATH = "/logbook";
const id = z.uuid();

const KNOWN_ERRORS = [
  "incomplete",
  "date_in_future",
  "already_corrected",
  "not_editable",
  "bad_correction",
  "reason_required",
  "not_found",
];

async function message(error: string) {
  const t = await getTranslations("logbook.errors");
  return t((KNOWN_ERRORS.includes(error) ? error : "failed") as "failed");
}

/** Add a draft, change one, or add a correction of a certified entry. */
export async function saveEntry(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(PATH);
  const raw = formValues(formData);
  const parsed = logbookEntrySchema.safeParse(raw);
  if (!parsed.success) return { errors: await localizedFieldErrors(parsed.error), values: raw };
  const entryId = id.safeParse(raw.id);
  const corrects = id.safeParse(raw.corrects);
  const outcome = entryId.success
    ? await updateEntry(user.id, entryId.data, parsed.data)
    : await createEntry(user.id, parsed.data, corrects.success ? corrects.data : null);
  if (!outcome.ok) return { message: await message(outcome.error), values: raw };
  revalidatePath(PATH, "layout");
  redirect(PATH);
}

export async function deleteDraft(formData: FormData) {
  const user = await requireUser(PATH);
  await removeEntry(user.id, id.parse(formData.get("id")));
  revalidatePath(PATH, "layout");
  redirect(PATH);
}

/** Certify the ticked drafts (all or nothing). */
export async function certify(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(PATH);
  const t = await getTranslations("logbook.drafts");
  const ids = formData
    .getAll("ids")
    .map(String)
    .filter((v) => id.safeParse(v).success);
  if (!ids.length) return { message: t("noneSelected") };
  const outcome = await certifyEntries(user.id, ids);
  if (!outcome.ok) return { message: await message(outcome.error) };
  revalidatePath(PATH, "layout");
  // The drafts card may be gone now: the page says how many were certified.
  redirect(`${PATH}?certified=${outcome.count}`);
}

/** Strike a certified entry through, with the reason. */
export async function strikeThrough(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(PATH);
  const raw = formValues(formData);
  const entryId = id.safeParse(raw.id);
  if (!entryId.success) return { message: await message("not_found") };
  const outcome = await voidEntry(user.id, entryId.data, raw.reason ?? "");
  if (!outcome.ok) {
    if (outcome.error === "reason_required") {
      return { errors: { reason: [await message("reason_required")] }, values: raw };
    }
    return { message: await message(outcome.error), values: raw };
  }
  revalidatePath(PATH, "layout");
  return { ok: true };
}
