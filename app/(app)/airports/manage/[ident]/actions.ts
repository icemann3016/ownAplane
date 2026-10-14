"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { cancelInvite, inviteMember } from "@/lib/airport-teams/invites";
import { removeMember, setMemberRole } from "@/lib/airport-teams/teams";
import { requireUser } from "@/lib/auth/session";
import { type FormState, formValues } from "@/lib/forms";
import { localizedFieldErrors } from "@/lib/i18n/server";
import { inviteSchema } from "@/lib/validation/airport-teams";

// An airfield's team (APT-1). The database decides who may change it (RLS: managers change
// roles, remove people and invite; anyone may leave; a team keeps a manager).

const memberInput = z.object({
  ident: z.string().min(1).max(20),
  userId: z.uuid(),
  role: z.enum(["manager", "staff"]).optional(),
});

const teamPath = (ident: string) => `/airports/manage/${encodeURIComponent(ident)}/team`;

export async function changeMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/airports/manage");
  const t = await getTranslations("airports");
  const parsed = memberInput.safeParse(formValues(formData));
  if (!parsed.success) return { message: t("errors.not_allowed") };
  const { ident, userId, role } = parsed.data;
  const result = role
    ? await setMemberRole(user.id, ident, userId, role)
    : await removeMember(user.id, ident, userId);
  if (!result.ok) return { message: t(`errors.${result.error}`) };
  revalidatePath(teamPath(ident));
  revalidatePath("/airports/manage");
  // Leaving the team: the page is no longer theirs.
  if (!role && userId === user.id) redirect("/airports/manage");
  return { ok: true, message: t(role ? "team.roleChanged" : "team.removed") };
}

export async function inviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/airports/manage");
  const t = await getTranslations("airports");
  const raw = formValues(formData);
  const parsed = inviteSchema.safeParse(raw);
  if (!parsed.success) return { errors: await localizedFieldErrors(parsed.error), values: raw };
  const { ident, email, role } = parsed.data;
  const result = await inviteMember(user.id, ident, email, role);
  if (!result.ok) {
    const key = result.error === "already_member" ? "invite_already_member" : result.error;
    return { message: t(`errors.${key}`), values: raw };
  }
  revalidatePath(teamPath(ident));
  return {
    ok: true,
    message: t(result.emailed ? "team.invited" : "team.invitedNotEmailed", { email }),
    secret: result.link,
  };
}

export async function cancelInviteAction(formData: FormData) {
  const user = await requireUser("/airports/manage");
  const parsed = z
    .object({ ident: z.string().min(1).max(20), id: z.uuid() })
    .safeParse(formValues(formData));
  if (!parsed.success) return;
  await cancelInvite(user.id, parsed.data.ident, parsed.data.id);
  revalidatePath(teamPath(parsed.data.ident));
}
