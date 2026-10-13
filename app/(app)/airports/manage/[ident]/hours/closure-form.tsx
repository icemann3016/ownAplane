"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { initialFormState } from "@/lib/forms";
import { addClosureAction } from "../profile-actions";

/** Close the airfield for some days (local dates). */
export function ClosureForm({ ident }: { ident: string }) {
  const t = useTranslations("airports.hours");
  const [state, formAction] = useActionState(addClosureAction, initialFormState);
  const v = state.ok ? {} : (state.values ?? {});
  return (
    <form action={formAction} className="grid gap-3" key={state.ok ? state.message : undefined}>
      <FormMessage state={state} />
      <input type="hidden" name="ident" value={ident} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          name="startsOn"
          type="date"
          label={t("closedFrom")}
          defaultValue={v.startsOn}
          errors={state.errors?.startsOn}
          required
        />
        <TextField
          name="endsOn"
          type="date"
          label={t("closedUntil")}
          defaultValue={v.endsOn}
          errors={state.errors?.endsOn}
          required
        />
      </div>
      <TextField
        name="note"
        label={t("closureNote")}
        placeholder={t("closureNotePlaceholder")}
        defaultValue={v.note}
        errors={state.errors?.note}
        maxLength={200}
      />
      <SubmitButton size="sm" className="justify-self-start" pendingText={t("saving")}>
        {t("addClosure")}
      </SubmitButton>
    </form>
  );
}
