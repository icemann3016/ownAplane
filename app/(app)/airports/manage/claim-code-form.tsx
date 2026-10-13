"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { initialFormState } from "@/lib/forms";
import { confirmCodeAction, resendCodeAction } from "./actions";

/** Enter the code sent to the airport email of a claim, or ask for a new one. */
export function ClaimCodeForm({ id, email }: { id: string; email: string }) {
  const t = useTranslations("airports.claimCard");
  const [state, confirm] = useActionState(confirmCodeAction, initialFormState);
  const [resent, resend] = useActionState(resendCodeAction, initialFormState);
  return (
    <div className="grid gap-3">
      <p>{t("enterCode", { email })}</p>
      <FormMessage state={state.ok ? state : resent} />
      <form action={confirm} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={id} />
        <TextField
          name="code"
          id={`code-${id}`}
          label={t("code")}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          className="w-32 font-mono"
          errors={state.errors?.code}
          required
        />
        <SubmitButton size="sm" pendingText={t("confirming")}>
          {t("confirm")}
        </SubmitButton>
      </form>
      <form action={resend}>
        <input type="hidden" name="id" value={id} />
        <SubmitButton variant="link" size="sm" className="h-auto px-0" pendingText={t("resending")}>
          {t("resend")}
        </SubmitButton>
      </form>
    </div>
  );
}
