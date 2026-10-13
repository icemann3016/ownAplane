"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { CopyField } from "@/components/copy-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { SelectField, TextField } from "@/components/forms/text-field";
import { initialFormState } from "@/lib/forms";
import { inviteAction } from "./actions";

/** A manager invites someone to the team by email; the link is also shown once. */
export function InviteForm({ ident }: { ident: string }) {
  const t = useTranslations("airports");
  const [state, formAction] = useActionState(inviteAction, initialFormState);
  const v = state.ok ? {} : (state.values ?? {});
  return (
    <form action={formAction} className="grid gap-4">
      <FormMessage state={state} />
      {state.secret && (
        <CopyField
          label={t("team.inviteLink")}
          value={state.secret}
          hint={t("team.inviteLinkHint")}
        />
      )}
      <input type="hidden" name="ident" value={ident} />
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <TextField
          name="email"
          type="email"
          label={t("team.inviteEmail")}
          defaultValue={v.email}
          errors={state.errors?.email}
          autoComplete="off"
          maxLength={200}
          required
        />
        <SelectField
          name="role"
          label={t("team.inviteRole")}
          defaultValue={v.role ?? "staff"}
          options={(["staff", "manager"] as const).map((r) => ({
            value: r,
            label: t(`roles.${r}`),
          }))}
        />
      </div>
      <SubmitButton className="justify-self-start" pendingText={t("team.inviting")}>
        {t("team.inviteSubmit")}
      </SubmitButton>
    </form>
  );
}
