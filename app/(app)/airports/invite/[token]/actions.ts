"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { acceptInvite } from "@/lib/airport-teams/invites";
import { requireUser } from "@/lib/auth/session";
import type { FormState } from "@/lib/forms";

/** Join an airfield's team with an invitation (only as the invited address). */
export async function acceptInviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const user = await requireUser(`/airports/invite/${token}`);
  const result = await acceptInvite(user.id, token);
  if (!result.ok) {
    const t = await getTranslations("airports.errors");
    return { message: t(result.error) };
  }
  revalidatePath("/airports/manage");
  redirect(`/airports/manage/${encodeURIComponent(result.ident)}`);
}
