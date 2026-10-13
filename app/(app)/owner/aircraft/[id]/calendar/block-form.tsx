"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { SelectField, TextField } from "@/components/forms/text-field";
import { initialFormState } from "@/lib/forms";
import { addCalendarBlock } from "./actions";

const KINDS = ["owner_use", "maintenance"] as const;

/** Block time on the calendar, in UTC; dates picked on the calendar arrive as `initial`. */
export function BlockForm({
  aircraftId,
  initial,
}: {
  aircraftId: string;
  initial: { from?: string; to?: string };
}) {
  const t = useTranslations("aircraft.calendar");
  const [state, formAction] = useActionState(addCalendarBlock, initialFormState);
  // After a successful save the form starts empty again.
  const v: Record<string, string | undefined> = state.ok ? {} : (state.values ?? initial);
  const e = state.errors ?? {};

  return (
    // Picking other dates on the calendar remounts the form with them.
    <form key={`${initial.from}-${initial.to}`} action={formAction} className="grid gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="aircraftId" value={aircraftId} />
      <SelectField
        name="kind"
        label={t("kind")}
        defaultValue={v.kind ?? "owner_use"}
        errors={e.kind}
        options={KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="from"
          type="datetime-local"
          label={t("from")}
          defaultValue={v.from}
          errors={e.from}
          required
        />
        <TextField
          name="to"
          type="datetime-local"
          label={t("to")}
          defaultValue={v.to}
          errors={e.to}
          required
        />
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">{t("localHint")}</p>
      <TextField
        name="note"
        label={t("note")}
        placeholder={t("notePlaceholder")}
        defaultValue={v.note}
        errors={e.note}
        maxLength={200}
      />
      <SubmitButton className="justify-self-start" pendingText={t("adding")}>
        {t("add")}
      </SubmitButton>
    </form>
  );
}
