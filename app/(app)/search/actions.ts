"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { getMyPlan } from "@/lib/billing/plan";
import { PLANS } from "@/lib/billing/plans";
import { type FormState, formValues } from "@/lib/forms";
import { MAX_SAVED_SEARCHES, saveSearch } from "@/lib/saved/searches";

const schema = z.object({
  name: z.string().trim().min(1, "nameRequired").max(80, "nameMax"),
  query: z.string().max(1000),
  alerts: z
    .string()
    .optional()
    .transform((v) => v === "on"),
});

/** Save the current search, with or without alerts (SRC-6). */
export async function saveSearchAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = formValues(formData);
  const user = await requireUser(`/search${raw.query ? `?${raw.query}` : ""}`);
  const t = await getTranslations("saved.searches");
  const v = await getTranslations("validation");
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { errors: { name: [v("nameRequired")] }, values: raw };
  }
  const result = await saveSearch(user.id, parsed.data);
  if (!result.ok) {
    const { plan } = await getMyPlan(user.id);
    const limit = PLANS[plan].savedSearches;
    return {
      message: limit < MAX_SAVED_SEARCHES ? t("tooManyPlan", { limit }) : t("tooMany"),
      values: raw,
    };
  }
  revalidatePath("/saved");
  return { ok: true, message: t("savedMessage") };
}
