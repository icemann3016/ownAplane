"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { SelectField, TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import { FUEL_TYPES } from "@/lib/aircraft/catalog";
import {
  BY_WEIGHT,
  DEFAULT_UNIT,
  SERVICE_CATEGORIES,
  SERVICE_UNITS,
  type ServiceCategory,
} from "@/lib/airport-profile/catalog";
import type { AirportService } from "@/lib/db/schema";
import { initialFormState } from "@/lib/forms";
import { addServiceAction, updateServiceAction } from "../profile-actions";

/** Add a service with its price, or change one (managers). */
export function ServiceForm({
  ident,
  currency,
  editing,
  cancelHref,
}: {
  ident: string;
  currency: string;
  editing: AirportService | null;
  cancelHref: string;
}) {
  const t = useTranslations("airports.catalog");
  const ta = useTranslations("aircraft");
  const [state, formAction] = useActionState(
    editing ? updateServiceAction : addServiceAction,
    initialFormState,
  );
  const v = state.ok ? {} : (state.values ?? {});
  const initial = (key: keyof AirportService) =>
    v[key] ?? (editing?.[key] === null || editing?.[key] === undefined ? "" : String(editing[key]));
  const [category, setCategory] = useState<ServiceCategory>(
    (v.category as ServiceCategory) ?? editing?.category ?? "landing",
  );
  const [unit, setUnit] = useState(v.unit ?? editing?.unit ?? DEFAULT_UNIT[category]);

  return (
    <form action={formAction} className="grid gap-4" key={state.ok ? state.message : undefined}>
      <FormMessage state={state} />
      <input type="hidden" name="ident" value={ident} />
      {editing && <input type="hidden" name="id" value={editing.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="category"
          label={t("category")}
          value={category}
          onChange={(e) => {
            const next = e.target.value as ServiceCategory;
            setCategory(next);
            setUnit(DEFAULT_UNIT[next]);
          }}
          options={SERVICE_CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))}
        />
        {category === "fuel" && (
          <SelectField
            name="fuelType"
            label={t("fuelType")}
            defaultValue={initial("fuelType") || FUEL_TYPES[0]}
            errors={state.errors?.fuelType}
            options={FUEL_TYPES.map((f) => ({ value: f, label: ta(`fuelTypes.${f}`) }))}
          />
        )}
        <TextField
          name="label"
          label={category === "other" ? t("name") : t("nameOptional")}
          placeholder={t(`placeholders.${category}`)}
          defaultValue={initial("label")}
          errors={state.errors?.label}
          maxLength={80}
          required={category === "other"}
        />
        {BY_WEIGHT.includes(category) && (
          <TextField
            name="maxMtomKg"
            type="number"
            inputMode="numeric"
            min={1}
            label={t("maxMtom")}
            hint={t("maxMtomHint")}
            defaultValue={initial("maxMtomKg")}
            errors={state.errors?.maxMtomKg}
          />
        )}
        <TextField
          name="price"
          inputMode="decimal"
          label={t("price", { currency })}
          hint={t("priceHint")}
          defaultValue={initial("price")}
          errors={state.errors?.price}
          maxLength={10}
        />
        <SelectField
          name="unit"
          label={t("unit")}
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          options={SERVICE_UNITS.map((u) => ({ value: u, label: t(`units.${u}`) }))}
        />
        <div className="sm:col-span-2">
          <TextField
            name="note"
            label={t("note")}
            placeholder={t("notePlaceholder")}
            defaultValue={initial("note")}
            errors={state.errors?.note}
            maxLength={200}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <SubmitButton size="sm" pendingText={t("saving")}>
          {editing ? t("save") : t("add")}
        </SubmitButton>
        {editing && (
          <Button asChild variant="ghost" size="sm">
            <Link href={cancelHref}>{t("cancel")}</Link>
          </Button>
        )}
      </div>
    </form>
  );
}
