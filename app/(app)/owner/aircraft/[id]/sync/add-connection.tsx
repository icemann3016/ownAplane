"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import { CopyField } from "@/components/copy-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { initialFormState } from "@/lib/forms";
import { CONNECTION_KINDS } from "@/lib/validation/calendar-sync";
import { addConnection } from "./actions";

/** Connect another booking system (SYN-1, SYN-4): how its bookings reach us. */
export function AddConnection({ aircraftId }: { aircraftId: string }) {
  const t = useTranslations("calendarSync");
  const [state, formAction] = useActionState(addConnection, initialFormState);
  const v = state.values ?? {};
  const [kind, setKind] = useState(v.inbound ?? "push");
  const needsLink = kind === "ical" || kind === "json";
  return (
    <form action={formAction} className="grid gap-4">
      <FormMessage state={state} />
      {state.secret && (
        <CopyField
          label={t("apiKey.shown")}
          value={state.secret}
          hint={t("apiKey.shownHint", { header: "Authorization: Bearer oap_…" })}
        />
      )}
      <input type="hidden" name="aircraftId" value={aircraftId} />
      <TextField
        name="name"
        label={t("add.name")}
        placeholder={t("add.namePlaceholder")}
        defaultValue={v.name}
        errors={state.errors?.name}
        maxLength={80}
        required
      />
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t("add.how")}</legend>
        {CONNECTION_KINDS.map((k) => (
          <label
            key={k}
            className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[:checked]:border-primary"
          >
            <input
              type="radio"
              name="inbound"
              value={k}
              checked={kind === k}
              onChange={() => setKind(k)}
              className="mt-1"
            />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">{t(`kinds.${k}.label`)}</span>
              <span className="text-sm text-muted-foreground">{t(`kinds.${k}.hint`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {needsLink && (
        <TextField
          name="feedUrl"
          type="url"
          inputMode="url"
          label={t(kind === "ical" ? "add.icalUrl" : "add.jsonUrl")}
          hint={t("add.urlHint")}
          placeholder="https://"
          defaultValue={v.feedUrl}
          errors={state.errors?.feedUrl}
          required
        />
      )}
      <SubmitButton className="justify-self-start" pendingText={t("add.connecting")}>
        {t("add.submit")}
      </SubmitButton>
    </form>
  );
}
