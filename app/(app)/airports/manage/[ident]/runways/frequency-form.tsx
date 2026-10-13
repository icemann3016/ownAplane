"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { initialFormState } from "@/lib/forms";
import { addFrequencyAction } from "../profile-actions";

export function FrequencyForm({ ident }: { ident: string }) {
  const t = useTranslations("airports.runways");
  const [state, formAction] = useActionState(addFrequencyAction, initialFormState);
  const v = state.ok ? {} : (state.values ?? {});
  return (
    <form action={formAction} className="grid gap-3" key={state.ok ? state.message : undefined}>
      <FormMessage state={state} />
      <input type="hidden" name="ident" value={ident} />
      <div className="grid gap-3 sm:grid-cols-[8rem_9rem_1fr]">
        <TextField
          name="type"
          label={t("type")}
          placeholder="TWR"
          defaultValue={v.type}
          errors={state.errors?.type}
          maxLength={12}
          required
        />
        <TextField
          name="mhz"
          inputMode="decimal"
          label={t("mhz")}
          placeholder="118.100"
          defaultValue={v.mhz}
          errors={state.errors?.mhz}
          maxLength={7}
          required
        />
        <TextField
          name="description"
          label={t("description")}
          placeholder={t("descriptionPlaceholder")}
          defaultValue={v.description}
          errors={state.errors?.description}
          maxLength={80}
        />
      </div>
      <SubmitButton size="sm" className="justify-self-start" pendingText={t("saving")}>
        {t("addFrequency")}
      </SubmitButton>
    </form>
  );
}
