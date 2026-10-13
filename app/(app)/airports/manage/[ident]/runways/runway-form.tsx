"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { CheckboxField } from "@/components/forms/checkbox-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { SelectField, TextField } from "@/components/forms/text-field";
import { RUNWAY_SURFACES } from "@/lib/airport-profile/catalog";
import { initialFormState } from "@/lib/forms";
import { addRunwayAction } from "../profile-actions";

export function RunwayForm({ ident }: { ident: string }) {
  const t = useTranslations("airports.runways");
  const [state, formAction] = useActionState(addRunwayAction, initialFormState);
  const v = state.ok ? {} : (state.values ?? {});
  return (
    <form action={formAction} className="grid gap-3" key={state.ok ? state.message : undefined}>
      <FormMessage state={state} />
      <input type="hidden" name="ident" value={ident} />
      <div className="grid gap-3 sm:grid-cols-4">
        <TextField
          name="designator"
          label={t("designator")}
          placeholder="09/27"
          defaultValue={v.designator}
          errors={state.errors?.designator}
          maxLength={20}
          required
        />
        <TextField
          name="lengthM"
          type="number"
          inputMode="numeric"
          min={1}
          max={10000}
          label={t("lengthM")}
          defaultValue={v.lengthM}
          errors={state.errors?.lengthM}
        />
        <TextField
          name="widthM"
          type="number"
          inputMode="numeric"
          min={1}
          max={200}
          label={t("widthM")}
          defaultValue={v.widthM}
          errors={state.errors?.widthM}
        />
        <SelectField
          name="surface"
          label={t("surface")}
          defaultValue={v.surface ?? "asphalt"}
          options={RUNWAY_SURFACES.map((s) => ({ value: s, label: t(`surfaces.${s}`) }))}
        />
      </div>
      <CheckboxField name="lighted" label={t("lighted")} />
      <SubmitButton size="sm" className="justify-self-start" pendingText={t("saving")}>
        {t("addRunway")}
      </SubmitButton>
    </form>
  );
}
