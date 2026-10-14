"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { initialFormState } from "@/lib/forms";
import { cancelRequestAction } from "./actions";

/** The pilot cancels the request; the airfield's team is told. */
export function CancelForm({ id }: { id: string }) {
  const t = useTranslations("airportRequests.detail");
  const [state, formAction] = useActionState(cancelRequestAction, initialFormState);
  return (
    <form action={formAction} className="grid gap-2">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="outline" className="justify-self-start" pendingText={t("cancelling")}>
        {t("cancel")}
      </SubmitButton>
    </form>
  );
}
