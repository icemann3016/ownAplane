"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CircleAlertIcon, PlusIcon, XIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { AirportPicker, type PickerAirport } from "@/components/airport-picker";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { SelectField, TextAreaField, TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import { estimatePrice } from "@/lib/domain/pricing";
import { addDays } from "@/lib/domain/time";
import { initialFormState } from "@/lib/forms";
import { intlLocale, type Locale } from "@/lib/i18n/config";
import { BOOKING_PURPOSES, MAX_STOPS } from "@/lib/validation/booking";
import { submitBookingRequest } from "./actions";

export type BookingAircraft = {
  id: string;
  seats: number;
  pricePerHour: number;
  weekendPricePerHour: number | null;
  minHoursPerDay: number | null;
  priceBasis: "wet" | "dry";
  fuelBurnLph: number | null;
  currency: string;
};

/** Local days a rental touches, from the form's local date-times. */
function localDays(from: string, to: string): number {
  const first = from.slice(0, 10);
  const last = to.slice(11) === "00:00" ? addDays(to.slice(0, 10), -1) : to.slice(0, 10);
  let days = 1;
  for (let d = first; d < last; d = addDays(d, 1)) days++;
  return days;
}

/** Request a booking (BKG-1) with a live price estimate (BKG-2). */
export function BookingForm({
  aircraft: a,
  base,
  initial,
}: {
  aircraft: BookingAircraft;
  /** The aircraft's base: default departure and arrival. */
  base: PickerAirport | null;
  initial: { from?: string; to?: string };
}) {
  const t = useTranslations("booking.form");
  const locale = useLocale() as Locale;
  const [state, formAction] = useActionState(submitBookingRequest, initialFormState);
  const v = state.values ?? {};
  const e = state.errors ?? {};
  const [from, setFrom] = useState(v.from ?? initial.from ?? "");
  const [to, setTo] = useState(v.to ?? initial.to ?? "");
  const [hours, setHours] = useState(v.plannedHours ?? "1");
  const [stops, setStops] = useState(0);

  const planned = Number(hours.replace(",", "."));
  const valid = from && to && to > from && planned > 0;
  const weekday = from ? new Date(`${from.slice(0, 10)}T00:00:00Z`).getUTCDay() : 1;
  const estimate = valid
    ? estimatePrice({
        ...a,
        plannedHours: planned,
        days: localDays(from, to),
        weekend: weekday === 0 || weekday === 6,
      })
    : null;
  const money = new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: a.currency,
  });

  return (
    <form action={formAction} className="grid gap-5">
      <FormMessage state={state} />
      {e.eligibility?.length ? (
        <div className="grid gap-2" role="alert">
          <ul className="grid list-disc gap-1 pl-5 text-sm text-destructive">
            {e.eligibility.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <Link
            href="/account/credentials"
            className="justify-self-start text-sm font-medium underline underline-offset-4"
          >
            {t("updateCredentials")}
          </Link>
        </div>
      ) : null}
      <input type="hidden" name="aircraftId" value={a.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="from"
          type="datetime-local"
          label={t("from")}
          defaultValue={from}
          onChange={(ev) => setFrom(ev.target.value)}
          errors={e.from}
          required
        />
        <TextField
          name="to"
          type="datetime-local"
          label={t("to")}
          defaultValue={to}
          onChange={(ev) => setTo(ev.target.value)}
          errors={e.to}
          required
        />
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">{t("timesHint")}</p>

      <fieldset className="grid gap-4">
        <legend className="mb-2 text-sm font-semibold">{t("route")}</legend>
        <AirportPicker
          name="departure"
          label={t("departure")}
          defaultAirport={base}
          errors={e.departure}
        />
        {Array.from({ length: stops }, (_, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="flex-1">
              <AirportPicker name="stops" label={t("stop", { number: i + 1 })} />
            </div>
            {i === stops - 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setStops(stops - 1)}
                aria-label={t("removeStop")}
              >
                <XIcon aria-hidden />
              </Button>
            )}
          </div>
        ))}
        {stops < MAX_STOPS && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() => setStops(stops + 1)}
          >
            <PlusIcon aria-hidden /> {t("addStop")}
          </Button>
        )}
        <AirportPicker
          name="arrival"
          label={t("arrival")}
          hint={t("arrivalHint")}
          defaultAirport={base}
          errors={e.arrival}
        />
        <p className="text-xs text-muted-foreground">{t("airfieldsHint")}</p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          name="purpose"
          label={t("purpose")}
          defaultValue={v.purpose ?? "local"}
          errors={e.purpose}
          options={BOOKING_PURPOSES.map((p) => ({ value: p, label: t(`purposes.${p}`) }))}
        />
        <TextField
          name="passengers"
          type="number"
          inputMode="numeric"
          min={0}
          max={a.seats - 1}
          label={t("passengers")}
          hint={t("passengersHint")}
          defaultValue={v.passengers ?? "0"}
          errors={e.passengers}
          required
        />
        <TextField
          name="plannedHours"
          inputMode="decimal"
          label={t("plannedHours")}
          defaultValue={hours}
          onChange={(ev) => setHours(ev.target.value)}
          errors={e.plannedHours}
          required
        />
      </div>
      <TextAreaField
        name="message"
        label={t("message")}
        placeholder={t("messagePlaceholder")}
        defaultValue={v.message}
        errors={e.message}
        maxLength={1000}
        rows={3}
      />

      <div className="grid gap-1 rounded-md border bg-muted/40 p-4 text-sm" aria-live="polite">
        <p className="font-medium">{t("estimate")}</p>
        {estimate ? (
          <>
            <p className="text-2xl font-semibold">{money.format(estimate.amount)}</p>
            <p className="text-muted-foreground">
              {t("estimateDetail", {
                hours: estimate.billedHours,
                rate: money.format(estimate.rate),
              })}
            </p>
            {estimate.fuelLitres !== null && (
              <p className="text-muted-foreground">
                {t("fuelNotIncluded", { litres: estimate.fuelLitres })}
              </p>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">{t("estimateEmpty")}</p>
        )}
        <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
          <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t("payDirectly")}
        </p>
      </div>

      <SubmitButton className="justify-self-start" pendingText={t("sending")}>
        {t("send")}
      </SubmitButton>
    </form>
  );
}
