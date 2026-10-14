"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { initialFormState } from "@/lib/forms";
import { answerRequestAction } from "./actions";

/** The airfield's answer to a request (APT-4): approve (PPR number, conditions) or decline. */
export function AnswerForm({
  id,
  initial,
}: {
  id: string;
  initial: { decision: "approve" | "decline"; pprNumber: string; conditions: string; note: string };
}) {
  const t = useTranslations("airportRequests.answer");
  const [state, formAction] = useActionState(answerRequestAction, initialFormState);
  const v = state.values ?? {};
  const [decision, setDecision] = useState(v.decision ?? initial.decision);
  return (
    <form action={formAction} className="grid gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <fieldset className="flex flex-wrap gap-4">
        <legend className="sr-only">{t("decision")}</legend>
        {(["approve", "decline"] as const).map((d) => (
          <label key={d} className="flex items-center gap-2 text-sm font-medium">
            <input
              type="radio"
              name="decision"
              value={d}
              checked={decision === d}
              onChange={() => setDecision(d)}
              className="size-4 accent-primary"
            />
            {t(d)}
          </label>
        ))}
      </fieldset>
      {decision === "approve" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="pprNumber"
            label={t("pprNumber")}
            defaultValue={v.pprNumber ?? initial.pprNumber}
            errors={state.errors?.pprNumber}
            maxLength={40}
          />
          <TextField
            name="conditions"
            label={t("conditions")}
            placeholder={t("conditionsPlaceholder")}
            defaultValue={v.conditions ?? initial.conditions}
            errors={state.errors?.conditions}
            maxLength={500}
          />
        </div>
      )}
      <TextField
        name="note"
        label={decision === "decline" ? t("reason") : t("note")}
        defaultValue={v.note ?? initial.note}
        errors={state.errors?.note}
        maxLength={500}
      />
      <SubmitButton className="justify-self-start" pendingText={t("saving")}>
        {t("save")}
      </SubmitButton>
    </form>
  );
}
