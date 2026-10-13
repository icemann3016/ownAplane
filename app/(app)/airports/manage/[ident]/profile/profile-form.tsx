"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import { CheckboxField } from "@/components/forms/checkbox-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { SelectField, TextAreaField, TextField } from "@/components/forms/text-field";
import { CURRENCIES } from "@/lib/aircraft/catalog";
import { initialFormState } from "@/lib/forms";
import { updateProfileAction } from "../profile-actions";

export type ProfileValues = {
  description: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  pprRequired: boolean;
  pprNoticeHours: number | null;
  currency: string;
};

/** An airfield's details for pilots: description, PPR, contacts, currency (APT-1). */
export function ProfileForm({ ident, initial }: { ident: string; initial: ProfileValues }) {
  const t = useTranslations("airports");
  const [state, formAction] = useActionState(updateProfileAction, initialFormState);
  const [ppr, setPpr] = useState(initial.pprRequired);
  const v = state.values ?? {};
  const text = (key: keyof ProfileValues) => v[key] ?? String(initial[key] ?? "");
  return (
    <form action={formAction} className="grid gap-5">
      <FormMessage state={state} />
      <input type="hidden" name="ident" value={ident} />
      <TextAreaField
        name="description"
        label={t("profile.description")}
        hint={t("profile.descriptionHint")}
        defaultValue={text("description")}
        errors={state.errors?.description}
        maxLength={2000}
        rows={5}
      />
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">{t("profile.ppr")}</legend>
        <CheckboxField
          name="pprRequired"
          label={t("profile.pprRequired")}
          checked={ppr}
          onChange={(e) => setPpr(e.target.checked)}
        />
        {ppr && (
          <TextField
            name="pprNoticeHours"
            type="number"
            inputMode="numeric"
            min={0}
            max={720}
            label={t("profile.pprNotice")}
            hint={t("profile.pprNoticeHint")}
            defaultValue={text("pprNoticeHours")}
            errors={state.errors?.pprNoticeHours}
            className="w-32"
          />
        )}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="phone"
          type="tel"
          label={t("profile.phone")}
          defaultValue={text("phone")}
          errors={state.errors?.phone}
          maxLength={40}
        />
        <TextField
          name="email"
          type="email"
          label={t("profile.email")}
          defaultValue={text("email")}
          errors={state.errors?.email}
          maxLength={200}
        />
        <TextField
          name="website"
          type="url"
          label={t("profile.website")}
          placeholder="https://"
          defaultValue={text("website")}
          errors={state.errors?.website}
          maxLength={300}
        />
        <SelectField
          name="currency"
          label={t("profile.currency")}
          hint={t("profile.currencyHint")}
          defaultValue={text("currency")}
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
        />
      </div>
      <p className="text-sm text-muted-foreground">{t("profile.publicNote")}</p>
      <SubmitButton className="justify-self-start" pendingText={t("profile.saving")}>
        {t("profile.save")}
      </SubmitButton>
    </form>
  );
}
