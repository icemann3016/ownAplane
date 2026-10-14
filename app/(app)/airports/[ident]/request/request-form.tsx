"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import { AirportPicker, type PickerAirport } from "@/components/airport-picker";
import { CheckboxField } from "@/components/forms/checkbox-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { SelectField, TextAreaField, TextField } from "@/components/forms/text-field";
import type { ServiceOption } from "@/lib/airport-requests/estimate";
import type { RequestPrefill } from "@/lib/airport-requests/prefill";
import { initialFormState } from "@/lib/forms";
import { REQUEST_PURPOSES } from "@/lib/validation/airport-request";
import { sendRequestAction } from "./actions";
import { ServicePicker } from "./service-picker";

export type RequestFormInitial = Partial<RequestPrefill> & {
  fromAirport: PickerAirport | null;
  toAirport: PickerAirport | null;
};

const asDate = (v: string) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? new Date(`${v}:00Z`) : null;

/** A pilot's request to arrive at or depart from an airfield, with its services (APT-2/3). */
export function RequestForm({
  ident,
  currency,
  options,
  initial,
}: {
  ident: string;
  currency: string;
  options: ServiceOption[];
  initial: RequestFormInitial;
}) {
  const t = useTranslations("airportRequests.form");
  const [state, formAction] = useActionState(sendRequestAction, initialFormState);
  const v = state.values ?? {};
  const e = state.errors ?? {};
  const [arriving, setArriving] = useState(initial.arriving ?? true);
  const [departing, setDeparting] = useState(initial.departing ?? false);
  const [arrivalAt, setArrivalAt] = useState(v.arrivalAt ?? initial.arrivalAt ?? "");
  const [departureAt, setDepartureAt] = useState(v.departureAt ?? initial.departureAt ?? "");
  const [mtom, setMtom] = useState(v.mtomKg ?? (initial.mtomKg ? String(initial.mtomKg) : ""));
  const [pob, setPob] = useState(v.pob ?? String(initial.pob ?? 1));
  const mtomKg = /^\d+$/.test(mtom) ? Number(mtom) : null;

  return (
    <form action={formAction} className="grid gap-6">
      <FormMessage state={state} />
      <input type="hidden" name="ident" value={ident} />
      {initial.bookingId && <input type="hidden" name="bookingId" value={initial.bookingId} />}

      <fieldset className="grid gap-4">
        <legend className="mb-2 font-semibold">{t("aircraft")}</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            name="registration"
            label={t("registration")}
            defaultValue={v.registration ?? initial.registration}
            errors={e.registration}
            autoCapitalize="characters"
            maxLength={10}
            required
          />
          <TextField
            name="aircraftType"
            label={t("aircraftType")}
            placeholder="C172"
            defaultValue={v.aircraftType ?? initial.aircraftType}
            errors={e.aircraftType}
            autoCapitalize="characters"
            maxLength={4}
          />
          <TextField
            name="mtomKg"
            type="number"
            inputMode="numeric"
            min={100}
            label={t("mtom")}
            hint={t("mtomHint")}
            value={mtom}
            onChange={(ev) => setMtom(ev.target.value)}
            errors={e.mtomKg}
          />
        </div>
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-2 font-semibold">{t("when")}</legend>
        <p className="-mt-2 text-sm text-muted-foreground">{t("whenText")}</p>
        <CheckboxField
          name="arriving"
          label={t("arriving")}
          checked={arriving}
          onChange={(ev) => setArriving(ev.target.checked)}
          errors={e.arriving}
        />
        {arriving && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="arrivalAt"
              type="datetime-local"
              label={t("arrivalAt")}
              value={arrivalAt}
              onChange={(ev) => setArrivalAt(ev.target.value)}
              errors={e.arrivalAt}
              required
            />
            <AirportPicker
              name="fromIdent"
              label={t("from")}
              defaultAirport={initial.fromAirport}
              errors={e.fromIdent}
            />
          </div>
        )}
        <CheckboxField
          name="departing"
          label={t("departing")}
          checked={departing}
          onChange={(ev) => setDeparting(ev.target.checked)}
        />
        {departing && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="departureAt"
              type="datetime-local"
              label={t("departureAt")}
              value={departureAt}
              onChange={(ev) => setDepartureAt(ev.target.value)}
              errors={e.departureAt}
              required
            />
            <AirportPicker
              name="toIdent"
              label={t("to")}
              defaultAirport={initial.toAirport}
              errors={e.toIdent}
            />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="pob"
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            label={t("pob")}
            value={pob}
            onChange={(ev) => setPob(ev.target.value)}
            errors={e.pob}
            required
          />
          <SelectField
            name="purpose"
            label={t("purpose")}
            defaultValue={v.purpose ?? "private"}
            options={REQUEST_PURPOSES.map((p) => ({ value: p, label: t(`purposes.${p}`) }))}
          />
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-2 font-semibold">{t("services")}</legend>
        <p className="-mt-2 text-sm text-muted-foreground">{t("servicesText")}</p>
        <ServicePicker
          options={options}
          mtomKg={mtomKg}
          currency={currency}
          arriving={arriving}
          trip={{
            arrivalAt: arriving ? asDate(arrivalAt) : null,
            departureAt: departing ? asDate(departureAt) : null,
            pob: Number(pob) || 1,
          }}
        />
        <TextAreaField
          name="other"
          label={t("other")}
          hint={t("otherHint")}
          defaultValue={v.other}
          errors={e.other}
          maxLength={1000}
          rows={3}
        />
      </fieldset>

      <p className="rounded-md border p-3 text-sm text-muted-foreground">{t("statement")}</p>
      <SubmitButton className="justify-self-start" pendingText={t("sending")}>
        {t("send")}
      </SubmitButton>
    </form>
  );
}
