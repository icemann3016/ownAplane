"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/forms/form-message";
import { SelectField, TextField } from "@/components/forms/text-field";
import { CATEGORIES, FUEL_TYPES } from "@/lib/aircraft/catalog";
import type { UnitSystem } from "@/lib/domain/units";
import { initialFormState } from "@/lib/forms";
import { createAircraft, saveDetails } from "./actions";
import { SectionFooter } from "./section-footer";

/** Registration, type and performance (LST-1): the first step of a new listing. */
export function DetailsForm({
  values: initial,
  units,
  isDraft,
}: {
  values?: Record<string, string>;
  units: UnitSystem;
  isDraft: boolean;
}) {
  const t = useTranslations("aircraft");
  const creating = !initial?.id;
  const [state, formAction] = useActionState(
    creating ? createAircraft : saveDetails,
    initialFormState,
  );
  const v = { ...initial, ...state.values };
  const e = state.errors ?? {};
  const volume = units === "imperial" ? t("units.usgalPerHour") : t("units.litresPerHour");
  const mass = units === "imperial" ? t("units.lb") : t("units.kg");

  return (
    <form action={formAction} className="grid gap-4">
      <FormMessage state={state} />
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="registration"
          label={t("fields.registration")}
          hint={t("fields.registrationHint")}
          defaultValue={v.registration}
          errors={e.registration}
          maxLength={12}
          autoCapitalize="characters"
          autoComplete="off"
          required
        />
        <SelectField
          name="category"
          label={t("fields.category")}
          defaultValue={v.category ?? "aeroplane"}
          errors={e.category}
          options={CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))}
        />
        <TextField
          name="manufacturer"
          label={t("fields.manufacturer")}
          placeholder="Cessna"
          defaultValue={v.manufacturer}
          errors={e.manufacturer}
          maxLength={60}
          required
        />
        <TextField
          name="model"
          label={t("fields.model")}
          placeholder="172S Skyhawk SP"
          defaultValue={v.model}
          errors={e.model}
          maxLength={60}
          required
        />
        <TextField
          name="typeDesignator"
          label={t("fields.typeDesignator")}
          hint={t("fields.typeDesignatorHint")}
          placeholder="C172"
          defaultValue={v.typeDesignator}
          errors={e.typeDesignator}
          maxLength={4}
          autoCapitalize="characters"
          autoComplete="off"
          required
        />
        <TextField
          name="year"
          label={t("fields.year")}
          type="number"
          inputMode="numeric"
          min={1903}
          defaultValue={v.year}
          errors={e.year}
        />
        <TextField
          name="seats"
          label={t("fields.seats")}
          type="number"
          inputMode="numeric"
          min={1}
          max={20}
          defaultValue={v.seats}
          errors={e.seats}
          required
        />
        <TextField
          name="engine"
          label={t("fields.engine")}
          placeholder="Lycoming IO-360-L2A, 180 hp"
          defaultValue={v.engine}
          errors={e.engine}
          maxLength={80}
        />
      </div>

      <h2 className="pt-2 text-base font-semibold">{t("fields.performance")}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="fuelType"
          label={t("fields.fuelType")}
          defaultValue={v.fuelType ?? "avgas_100ll"}
          errors={e.fuelType}
          options={FUEL_TYPES.map((f) => ({ value: f, label: t(`fuelTypes.${f}`) }))}
        />
        <TextField
          name="fuelBurn"
          label={t("fields.fuelBurn", { unit: volume })}
          inputMode="decimal"
          defaultValue={v.fuelBurn}
          errors={e.fuelBurn}
        />
        <TextField
          name="cruiseKt"
          label={t("fields.cruiseKt")}
          type="number"
          inputMode="numeric"
          min={1}
          defaultValue={v.cruiseKt}
          errors={e.cruiseKt}
        />
        <TextField
          name="usefulLoad"
          label={t("fields.usefulLoad", { unit: mass })}
          type="number"
          inputMode="numeric"
          min={1}
          defaultValue={v.usefulLoad}
          errors={e.usefulLoad}
        />
        <TextField
          name="mtom"
          label={t("fields.mtom", { unit: mass })}
          type="number"
          inputMode="numeric"
          min={1}
          hint={t("fields.mtomHint")}
          defaultValue={v.mtom}
          errors={e.mtom}
        />
        <TextField
          name="enduranceH"
          label={t("fields.enduranceH")}
          inputMode="decimal"
          defaultValue={v.enduranceH}
          errors={e.enduranceH}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t("fields.unitsHint")}</p>
      <SectionFooter continues={isDraft} />
    </form>
  );
}
