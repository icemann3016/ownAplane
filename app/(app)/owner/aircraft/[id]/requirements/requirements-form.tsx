"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import { CheckboxField } from "@/components/forms/checkbox-field";
import { FormMessage } from "@/components/forms/form-message";
import { SelectField, TextField } from "@/components/forms/text-field";
import { initialFormState } from "@/lib/forms";
import { CLASS_RATINGS, LICENCE_LABELS, LICENCE_TYPES, PRIVILEGES } from "@/lib/pilot/catalog";
import { SectionFooter } from "../../section-footer";
import { saveRequirements } from "./actions";

/** Who may rent the aircraft (RAT-6, RAT-7). Empty = no requirement. */
export function RequirementsForm({
  aircraftId,
  values,
  isDraft,
  instantIncluded,
}: {
  aircraftId: string;
  /** licenceTypes and requiredRatings comma separated. */
  values: Record<string, string>;
  isDraft: boolean;
  /** Instant booking needs a paid plan (SUB-10); the setting is kept either way. */
  instantIncluded: boolean;
}) {
  const t = useTranslations("aircraft.requirements");
  const tp = useTranslations("pilot");
  const [state, formAction] = useActionState(saveRequirements, initialFormState);
  const v = state.values ?? values;
  const e = state.errors ?? {};
  const licences = new Set((v.licenceTypes ?? "").split(",").filter(Boolean));
  const ratings = new Set((v.requiredRatings ?? "").split(",").filter(Boolean));
  const [allowUnrated, setAllowUnrated] = useState(v.allowUnrated === "on");

  return (
    <form action={formAction} className="grid gap-5">
      <FormMessage state={state} />
      <input type="hidden" name="aircraftId" value={aircraftId} />

      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-semibold">{t("ratingTitle")}</legend>
        <SelectField
          name="minPilotRating"
          label={t("minPilotRating")}
          hint={t("minPilotRatingHint")}
          defaultValue={v.minPilotRating ?? ""}
          errors={e.minPilotRating}
          options={[
            { value: "", label: t("anyRating") },
            ...["3", "3.5", "4", "4.5"].map((r) => ({
              value: r,
              label: t("atLeast", { rating: r }),
            })),
          ]}
        />
        <CheckboxField
          name="allowUnrated"
          label={t("allowUnrated")}
          hint={t("allowUnratedHint")}
          checked={allowUnrated}
          onChange={(ev) => setAllowUnrated(ev.target.checked)}
        />
        {allowUnrated && (
          <div className="pl-6">
            <CheckboxField
              name="unratedNeedsCheckout"
              label={t("unratedNeedsCheckout")}
              defaultChecked={v.unratedNeedsCheckout === "on"}
            />
          </div>
        )}
        <CheckboxField
          name="checkoutFirstRental"
          label={t("checkoutFirstRental")}
          hint={t("checkoutFirstRentalHint")}
          defaultChecked={v.checkoutFirstRental === "on"}
        />
        <CheckboxField
          name="instantBooking"
          label={t("instantBooking")}
          hint={
            instantIncluded
              ? t("instantBookingHint")
              : `${t("instantBookingHint")} ${t("instantBookingPlan")}`
          }
          defaultChecked={v.instantBooking === "on"}
        />
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-semibold">{t("licenceTitle")}</legend>
        <p className="text-xs text-muted-foreground">{t("licenceHint")}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {LICENCE_TYPES.map((code) => (
            <CheckboxField
              key={code}
              id={`licence-${code}`}
              name="licenceTypes"
              value={code}
              label={LICENCE_LABELS[code] ?? tp("licences.other")}
              defaultChecked={licences.has(code)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-semibold">{t("ratingsTitle")}</legend>
        <p className="text-xs text-muted-foreground">{t("ratingsHint")}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {CLASS_RATINGS.map((code) => (
            <CheckboxField
              key={code}
              id={`rating-${code}`}
              name="requiredRatings"
              value={code}
              label={tp(`classRatings.${code}`)}
              defaultChecked={ratings.has(code)}
            />
          ))}
          {PRIVILEGES.map((code) => (
            <CheckboxField
              key={code}
              id={`rating-${code}`}
              name="requiredRatings"
              value={code}
              label={tp(`privileges.${code}`)}
              defaultChecked={ratings.has(code)}
            />
          ))}
        </div>
        <TextField
          name="typeRating"
          label={t("typeRating")}
          hint={t("typeRatingHint")}
          defaultValue={v.typeRating}
          errors={e.typeRating}
          maxLength={6}
          autoCapitalize="characters"
          autoComplete="off"
        />
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-semibold">{t("experienceTitle")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["minTotalHours", "minTypeHours", "min90DaysHours"] as const).map((name) => (
            <TextField
              key={name}
              name={name}
              label={t(name)}
              inputMode="decimal"
              defaultValue={v[name]}
              errors={e[name]}
            />
          ))}
          <TextField
            name="minAge"
            label={t("minAge")}
            type="number"
            inputMode="numeric"
            min={16}
            max={99}
            defaultValue={v.minAge}
            errors={e.minAge}
          />
        </div>
      </fieldset>
      <p className="text-xs text-muted-foreground">{t("nightIfrNote")}</p>
      <SectionFooter continues={isDraft} />
    </form>
  );
}
