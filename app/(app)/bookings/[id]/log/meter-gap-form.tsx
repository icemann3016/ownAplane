"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { SelectField } from "@/components/forms/text-field";
import type { MeterGapReason } from "@/lib/db/schema";
import { initialFormState } from "@/lib/forms";
import { explainMeterGap } from "./meter-actions";

const REASONS = ["outside", "maintenance", "meter_replaced", "other"] as const;

/** The owner's explanation of the meters moving before a rental. */
export function MeterGapForm({
  bookingId,
  logId,
  reason,
}: {
  bookingId: string;
  logId: string;
  reason: MeterGapReason | null;
}) {
  const t = useTranslations("flightLog.meters");
  const [state, formAction] = useActionState(explainMeterGap, initialFormState);
  return (
    <form action={formAction} className="mt-2 grid gap-2 sm:flex sm:items-end">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="logId" value={logId} />
      <SelectField
        id="meter-gap-reason"
        name="reason"
        label={t("reasonLabel")}
        defaultValue={reason ?? ""}
        options={[
          { value: "", label: t("notExplained") },
          ...REASONS.map((r) => ({ value: r, label: t(`reasons.${r}`) })),
        ]}
      />
      <SubmitButton variant="outline" size="sm" pendingText={t("saving")}>
        {t("save")}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
