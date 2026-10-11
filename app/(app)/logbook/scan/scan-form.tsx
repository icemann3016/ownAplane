"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { DocumentField } from "@/components/document-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { initialFormState } from "@/lib/forms";
import { readSpread } from "./actions";

/** Upload the left and right page (or one photo of both) and let the AI read them (LOG-6). */
export function ScanForm() {
  const t = useTranslations("logbook.scan");
  const [state, formAction] = useActionState(readSpread, initialFormState);
  return (
    <form action={formAction} className="grid gap-4">
      <FormMessage state={state} />
      <DocumentField name="left" label={t("left")} required errors={state.errors?.left} />
      <DocumentField name="right" label={t("right")} hint={t("rightHint")} />
      <p className="text-xs text-muted-foreground">{t("note")}</p>
      <SubmitButton className="justify-self-start" pendingText={t("reading")}>
        {t("read")}
      </SubmitButton>
    </form>
  );
}
