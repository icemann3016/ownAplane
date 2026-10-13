"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextAreaField } from "@/components/forms/text-field";
import { Input } from "@/components/ui/input";
import { WEEKDAYS } from "@/lib/airport-profile/catalog";
import { initialFormState } from "@/lib/forms";
import { intlLocale, type Locale } from "@/lib/i18n/config";
import { setHoursAction } from "../profile-actions";

type Day = { open: boolean; opens: string; closes: string };

/** Weekly opening hours in the airfield's local time, one period a day (APT-1). */
export function HoursForm({
  ident,
  timeZone,
  initial,
  note,
}: {
  ident: string;
  timeZone: string;
  initial: { weekday: number; opens: string; closes: string }[];
  note: string | null;
}) {
  const t = useTranslations("airports.hours");
  const locale = useLocale() as Locale;
  const weekday = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "long", timeZone: "UTC" });
  // 5 January 2026 was a Monday: ISO weekday d is 4 + d January.
  const dayName = (d: number) => weekday.format(new Date(Date.UTC(2026, 0, 4 + d)));
  const [state, formAction] = useActionState(setHoursAction, initialFormState);
  const [days, setDays] = useState<Record<number, Day>>(() =>
    Object.fromEntries(
      WEEKDAYS.map((d) => {
        const h = initial.find((x) => x.weekday === d);
        return [
          d,
          {
            open: Boolean(h),
            opens: h?.opens.slice(0, 5) ?? "08:00",
            closes: h?.closes.slice(0, 5) ?? "18:00",
          },
        ];
      }),
    ),
  );
  const set = (d: number, change: Partial<Day>) =>
    setDays((all) => ({ ...all, [d]: { ...all[d]!, ...change } }));
  const copyMonday = () =>
    setDays((all) => Object.fromEntries(WEEKDAYS.map((d) => [d, { ...all[1]! }])));
  return (
    <form action={formAction} className="grid gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="ident" value={ident} />
      <p className="text-sm text-muted-foreground">{t("localNote", { timeZone })}</p>
      <div className="grid gap-2">
        {WEEKDAYS.map((d) => {
          const day = days[d]!;
          const error = state.errors?.[`opens-${d}`]?.[0] ?? state.errors?.[`closes-${d}`]?.[0];
          return (
            <div key={d} className="grid gap-1">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex w-36 items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    name={`open-${d}`}
                    checked={day.open}
                    onChange={(e) => set(d, { open: e.target.checked })}
                    className="size-4 accent-primary"
                  />
                  {dayName(d)}
                </label>
                {day.open ? (
                  <span className="flex items-center gap-2">
                    <Input
                      type="time"
                      name={`opens-${d}`}
                      value={day.opens}
                      onChange={(e) => set(d, { opens: e.target.value })}
                      aria-label={t("opensLabel", { day: dayName(d) })}
                      aria-invalid={error ? true : undefined}
                      className="w-28"
                      required
                    />
                    <span aria-hidden>–</span>
                    <Input
                      type="time"
                      name={`closes-${d}`}
                      value={day.closes}
                      onChange={(e) => set(d, { closes: e.target.value })}
                      aria-label={t("closesLabel", { day: dayName(d) })}
                      aria-invalid={error ? true : undefined}
                      className="w-28"
                      required
                    />
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">{t("closed")}</span>
                )}
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          );
        })}
      </div>
      <button type="button" onClick={copyMonday} className="justify-self-start text-sm underline">
        {t("copyMonday")}
      </button>
      <TextAreaField
        name="note"
        label={t("note")}
        placeholder={t("notePlaceholder")}
        defaultValue={state.values?.note ?? note ?? ""}
        errors={state.errors?.note}
        maxLength={300}
        rows={2}
      />
      <SubmitButton className="justify-self-start" pendingText={t("saving")}>
        {t("save")}
      </SubmitButton>
    </form>
  );
}
