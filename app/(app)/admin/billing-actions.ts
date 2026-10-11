"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  type BillingAdminResult,
  giveCredits,
  grantPlan,
  revokeGrant,
  setBeta,
  setFoundingCutoff,
} from "@/lib/admin/billing";
import { requireAdmin } from "@/lib/auth/session";
import type { FormState } from "@/lib/forms";

// Plans and credits for admins (SUB-7, SUB-9), logged in the audit log. Admins only.

const day = z.union([z.iso.date(), z.literal("")]).transform((v) => v || null);
const note = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => v || null);

const schemas = {
  grant: z.object({
    userId: z.uuid(),
    plan: z.enum(["pilot", "owner", "fleet"]),
    endsOn: day,
    note,
  }),
  revoke: z.object({ grantId: z.uuid() }),
  credits: z.object({
    userId: z.uuid(),
    credits: z.coerce.number().int().min(1).max(10_000),
    note,
  }),
  beta: z.object({ beta: z.enum(["on", "end"]) }),
  cutoff: z.object({ cutoff: day }),
};

async function done(result: BillingAdminResult, key: string): Promise<FormState> {
  const t = await getTranslations("admin.billing");
  if (!result.ok) return { message: t(`errors.${result.error}`) };
  revalidatePath("/admin", "layout");
  revalidatePath("/account/billing");
  return { ok: true, message: t(`done.${key}` as "done.grant") };
}

export async function billingAdmin(_prev: FormState, formData: FormData): Promise<FormState> {
  const { userId: adminId } = await requireAdmin("/admin/billing");
  const t = await getTranslations("admin.billing");
  const raw = Object.fromEntries(formData);
  const op = String(raw.op);
  if (op === "grant") {
    const p = schemas.grant.safeParse(raw);
    if (!p.success) return { message: t("errors.invalid") };
    return done(
      await grantPlan(adminId, p.data.userId, p.data.plan, p.data.endsOn, p.data.note),
      op,
    );
  }
  if (op === "revoke") {
    const p = schemas.revoke.safeParse(raw);
    if (!p.success) return { message: t("errors.invalid") };
    return done(await revokeGrant(adminId, p.data.grantId), op);
  }
  if (op === "credits") {
    const p = schemas.credits.safeParse(raw);
    if (!p.success) return { message: t("errors.invalid") };
    return done(await giveCredits(adminId, p.data.userId, p.data.credits, p.data.note), op);
  }
  if (op === "beta") {
    const p = schemas.beta.safeParse(raw);
    if (!p.success) return { message: t("errors.invalid") };
    return done(await setBeta(adminId, p.data.beta === "on"), `beta_${p.data.beta}`);
  }
  if (op === "cutoff") {
    const p = schemas.cutoff.safeParse(raw);
    if (!p.success) return { message: t("errors.invalid") };
    return done(await setFoundingCutoff(adminId, p.data.cutoff), op);
  }
  return { message: t("errors.invalid") };
}
