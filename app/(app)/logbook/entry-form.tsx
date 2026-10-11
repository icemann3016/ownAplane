"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextAreaField, TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import { initialFormState } from "@/lib/forms";
import { entryHints } from "@/lib/logbook/checks";
import { parseDuration } from "@/lib/logbook/duration";
import { saveEntry } from "./actions";

type Kind = "flight" | "fstd" | "brought_forward";

/** Add or change a logbook draft, or a correction (LOG-1…3). Durations "1:25", times UTC. */
export function EntryForm({
  kind,
  values: initial,
  id,
  corrects,
}: {
  kind: Kind;
  values: Record<string, string>;
  id?: string;
  corrects?: string;
}) {
  const t = useTranslations("logbook");
  const [state, formAction] = useActionState(saveEntry, initialFormState);
  const [live, setLive] = useState<Record<string, string>>({});
  const v: Record<string, string | undefined> = { ...initial, ...state.values };
  const e = state.errors ?? {};
  const num = (name: string) => {
    const raw = live[name] ?? v[name] ?? "";
    const n = name.startsWith("landings") ? Number(raw || "0") : parseDuration(raw);
    return n == null || Number.isNaN(n) ? null : n;
  };
  const hints =
    kind === "flight"
      ? entryHints({
          kind,
          seMinutes: num("seMinutes"),
          meMinutes: num("meMinutes"),
          mpMinutes: num("mpMinutes"),
          totalMinutes: num("totalMinutes"),
          nightMinutes: num("nightMinutes"),
          ifrMinutes: num("ifrMinutes"),
          picMinutes: num("picMinutes"),
          copilotMinutes: num("copilotMinutes"),
          dualMinutes: num("dualMinutes"),
          instructorMinutes: num("instructorMinutes"),
          landingsDay: num("landingsDay"),
          landingsNight: num("landingsNight"),
        })
      : [];

  const field = (name: string, label: string, extra: Record<string, unknown> = {}) => (
    <TextField
      name={name}
      label={label}
      defaultValue={v[name]}
      errors={e[name]}
      onChange={(ev) => setLive((l) => ({ ...l, [name]: ev.target.value }))}
      {...extra}
    />
  );
  const duration = (name: string, label: string) =>
    field(name, label, { inputMode: "decimal", placeholder: "0:00", autoComplete: "off" });
  const count = (name: string, label: string) =>
    field(name, label, { inputMode: "numeric", type: "number", min: 0, max: 32000 });

  return (
    <form action={formAction} className="grid gap-6">
      <FormMessage state={state} />
      <input type="hidden" name="kind" value={kind} />
      {id && <input type="hidden" name="id" value={id} />}
      {corrects && <input type="hidden" name="corrects" value={corrects} />}
      <p className="text-xs text-muted-foreground">{t("entry.durationHint")}</p>

      <div className="grid gap-4 sm:grid-cols-3">
        {field("date", t("columns.date"), { type: "date", required: true })}
      </div>

      {kind === "flight" && (
        <>
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-medium">
              {t("columns.departure")} / {t("columns.arrival")}
            </legend>
            {field("departurePlace", `${t("columns.departure")} – ${t("columns.place")}`, {
              hint: t("entry.placeHint"),
              maxLength: 60,
            })}
            {field("departureTime", `${t("columns.departure")} – ${t("columns.time")}`, {
              type: "time",
            })}
            {field("arrivalPlace", `${t("columns.arrival")} – ${t("columns.place")}`, {
              hint: t("entry.placeHint"),
              maxLength: 60,
            })}
            {field("arrivalTime", `${t("columns.arrival")} – ${t("columns.time")}`, {
              type: "time",
            })}
          </fieldset>
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-medium">{t("columns.aircraft")}</legend>
            {field("aircraftType", t("columns.type"), { hint: t("entry.typeHint"), maxLength: 60 })}
            {field("registration", t("columns.registration"), {
              maxLength: 20,
              autoCapitalize: "characters",
            })}
          </fieldset>
        </>
      )}

      {kind === "fstd" ? (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium">{t("columns.fstd")}</legend>
          {field("fstdType", t("columns.fstdType"), { maxLength: 60 })}
          {duration("fstdMinutes", t("columns.fstdTime"))}
        </fieldset>
      ) : (
        <>
          <fieldset className="grid gap-4 sm:grid-cols-4">
            <legend className="mb-2 text-sm font-medium">{t("columns.total")}</legend>
            {duration("seMinutes", `${t("columns.singlePilot")} ${t("columns.se")}`)}
            {duration("meMinutes", `${t("columns.singlePilot")} ${t("columns.me")}`)}
            {duration("mpMinutes", t("columns.mp"))}
            {duration("totalMinutes", t("columns.total"))}
          </fieldset>
          {kind === "flight" && field("picName", t("columns.picName"), { maxLength: 100 })}
          <fieldset className="grid gap-4 sm:grid-cols-4">
            <legend className="mb-2 text-sm font-medium">
              {t("columns.landings")} · {t("columns.conditionTime")}
            </legend>
            {count("landingsDay", `${t("columns.landings")} ${t("columns.day")}`)}
            {count("landingsNight", `${t("columns.landings")} ${t("columns.night")}`)}
            {duration("nightMinutes", t("columns.night"))}
            {duration("ifrMinutes", t("columns.ifr"))}
          </fieldset>
          <fieldset className="grid gap-4 sm:grid-cols-4">
            <legend className="mb-2 text-sm font-medium">{t("columns.functionTime")}</legend>
            {duration("picMinutes", t("columns.pic"))}
            {duration("copilotMinutes", t("columns.copilot"))}
            {duration("dualMinutes", t("columns.dual"))}
            {duration("instructorMinutes", t("columns.instructor"))}
          </fieldset>
          {kind === "brought_forward" && duration("fstdMinutes", t("columns.fstd"))}
        </>
      )}

      <TextAreaField
        name="remarks"
        label={t("columns.remarks")}
        defaultValue={v.remarks}
        errors={e.remarks}
        maxLength={1000}
        rows={2}
      />

      {hints.length > 0 && (
        <ul className="grid gap-1 text-sm text-amber-700 dark:text-amber-400" aria-live="polite">
          {hints.map((h) => (
            <li key={h}>{t(`entry.hints.${h}`)}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingText={t("entry.saving")}>{t("entry.save")}</SubmitButton>
        <Button asChild variant="ghost">
          <Link href="/logbook">{t("entry.cancel")}</Link>
        </Button>
      </div>
    </form>
  );
}
