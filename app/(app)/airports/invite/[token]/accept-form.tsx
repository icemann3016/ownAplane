"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { initialFormState } from "@/lib/forms";
import { acceptInviteAction } from "./actions";

export function AcceptForm({ token }: { token: string }) {
  const t = useTranslations("airports.join");
  const [state, formAction] = useActionState(acceptInviteAction, initialFormState);
  return (
    <form action={formAction} className="grid gap-3">
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <SubmitButton className="justify-self-start" pendingText={t("accepting")}>
        {t("accept")}
      </SubmitButton>
    </form>
  );
}
