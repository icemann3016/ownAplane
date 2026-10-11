"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { type FormState, formValues } from "@/lib/forms";
import { readLogbookSpread } from "@/lib/ocr/logbook-read";

// Reading a scanned logbook spread into drafts (LOG-6).

const id = z.uuid();

export async function readSpread(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/logbook/scan");
  const t = await getTranslations("logbook.scan");
  const raw = formValues(formData);
  const left = id.safeParse(raw.left);
  if (!left.success) return { errors: { left: [t("leftRequired")] }, values: raw };
  const right = id.safeParse(raw.right);
  const read = await readLogbookSpread(user.id, left.data, right.success ? right.data : null);
  if (!read.ok) return { message: t(`errors.${read.error}`), values: raw };
  revalidatePath("/logbook", "layout");
  redirect(`/logbook/scan/${read.spreadId}`);
}
