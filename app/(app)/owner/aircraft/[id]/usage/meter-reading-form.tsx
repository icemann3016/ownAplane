"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { initialFormState } from "@/lib/forms";
import { addMeterReading } from "./meter-actions";

/** Record the aircraft's meters (UTC time, defaults to now). */
export function MeterReadingForm({ aircraftId, now }: { aircraftId: string; now: string }) {
  const t = useTranslations("usage.meters");
  const [state, formAction] = useActionState(addMeterReading, initialFormState);
  // After a successful save the form starts empty again.
  const v: Record<string, string | undefined> = state.ok ? {} : (state.values ?? {});
  const e = state.errors ?? {};
  return (
    <form action={formAction} className="grid gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="aircraftId" value={aircraftId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          name="readAt"
          type="datetime-local"
          label={t("readAt")}
          defaultValue={v.readAt ?? now}
          errors={e.readAt}
          required
        />
        <TextField
          name="hobbs"
          inputMode="decimal"
          label={t("hobbs")}
          defaultValue={v.hobbs}
          errors={e.hobbs}
        />
        <TextField
          name="tach"
          inputMode="decimal"
          label={t("tach")}
          defaultValue={v.tach}
          errors={e.tach}
        />
      </div>
      <TextField
        name="note"
        label={t("note")}
        placeholder={t("notePlaceholder")}
        defaultValue={v.note}
        errors={e.note}
        maxLength={200}
      />
      <SubmitButton className="justify-self-start" pendingText={t("saving")}>
        {t("save")}
      </SubmitButton>
    </form>
  );
}
