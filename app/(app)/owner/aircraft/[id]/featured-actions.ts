"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { setFeatured } from "@/lib/aircraft/owner-ops";
import { requireUser } from "@/lib/auth/session";
import type { FormState } from "@/lib/forms";

const input = z.object({ id: z.uuid(), featured: z.enum(["true", "false"]) });

/** Feature a listed aircraft in search, or stop (SUB-10). */
export async function toggleFeatured(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/owner/aircraft");
  const t = await getTranslations("aircraft.featured");
  const parsed = input.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: t("failed") };
  const on = parsed.data.featured === "true";
  const outcome = await setFeatured(user.id, parsed.data.id, on);
  if (!outcome.ok) {
    if (outcome.error === "plan_limit")
      return { message: t("limit", { limit: outcome.limit ?? 0 }) };
    return { message: t("failed") };
  }
  revalidatePath(`/owner/aircraft/${parsed.data.id}`);
  revalidatePath("/search");
  return { ok: true, message: on ? t("on") : t("off") };
}
