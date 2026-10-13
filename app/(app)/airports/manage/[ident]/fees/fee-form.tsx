"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { SelectField, TextField } from "@/components/forms/text-field";
import { FEE_KINDS, FEE_UNITS } from "@/lib/airport-profile/catalog";
import { initialFormState } from "@/lib/forms";
import { addFeeAction } from "../profile-actions";

export function FeeForm({ ident, currency }: { ident: string; currency: string }) {
  const t = useTranslations("airports.fees");
  const [state, formAction] = useActionState(addFeeAction, initialFormState);
  const v = state.ok ? {} : (state.values ?? {});
  return (
    <form action={formAction} className="grid gap-3" key={state.ok ? state.message : undefined}>
      <FormMessage state={state} />
      <input type="hidden" name="ident" value={ident} />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          name="kind"
          label={t("kind")}
          defaultValue={v.kind ?? "landing"}
          options={FEE_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
        />
        <TextField
          name="label"
          label={t("label")}
          placeholder={t("labelPlaceholder")}
          defaultValue={v.label}
          errors={state.errors?.label}
          maxLength={80}
        />
        <TextField
          name="amount"
          inputMode="decimal"
          label={t("amount", { currency })}
          defaultValue={v.amount}
          errors={state.errors?.amount}
          maxLength={9}
          required
        />
        <SelectField
          name="unit"
          label={t("unit")}
          defaultValue={v.unit ?? "landing"}
          options={FEE_UNITS.map((u) => ({ value: u, label: t(`units.${u}`) }))}
        />
        <TextField
          name="maxMtomKg"
          type="number"
          inputMode="numeric"
          min={1}
          label={t("maxMtom")}
          hint={t("maxMtomHint")}
          defaultValue={v.maxMtomKg}
          errors={state.errors?.maxMtomKg}
        />
      </div>
      <SubmitButton size="sm" className="justify-self-start" pendingText={t("saving")}>
        {t("add")}
      </SubmitButton>
    </form>
  );
}
