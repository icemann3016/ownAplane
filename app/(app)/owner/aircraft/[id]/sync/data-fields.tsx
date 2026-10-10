"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  EXPORT_FIELDS,
  IMPORT_FIELDS,
  PERSONAL_EXPORT_FIELDS,
  type ExportField,
  type ImportField,
} from "@/lib/calendar-sync/fields";
import { initialFormState } from "@/lib/forms";
import { saveDataFields } from "./actions";

/**
 * What a connection exchanges with the other system besides the times (SYN-3, SYN-4): what is
 * sent (iCal link, busy-times API) and what is taken (pushes and links). Nothing by default.
 */
export function DataFields({
  aircraftId,
  id,
  inbound,
  exported,
  imported,
}: {
  aircraftId: string;
  id: string;
  inbound: string;
  exported: ExportField[];
  imported: ImportField[];
}) {
  const t = useTranslations("calendarSync.data");
  const [state, formAction] = useActionState(saveDataFields, initialFormState);
  const takes = inbound !== "none";
  const sent = [t("times"), ...exported.map((f) => t(`export.${f}.label`))].join(", ");
  const taken = [t("times"), ...imported.map((f) => t(`import.${f}.label`))].join(", ");
  const box = (name: "export" | "import", field: string, checked: boolean, warn = false) => (
    <label key={field} className="flex items-start gap-3">
      <input type="checkbox" name={name} value={field} defaultChecked={checked} className="mt-1" />
      <span className="grid gap-0.5">
        <span className="text-sm font-medium">
          {t(`${name}.${field}.label` as "export.type.label")}
        </span>
        <span className={warn ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {t(`${name}.${field}.hint` as "export.type.hint")}
        </span>
      </span>
    </label>
  );

  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">{t("title")}</summary>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("current", { sent, taken: takes ? taken : t("nothing") })}
      </p>
      <form action={formAction} className="mt-4 grid gap-5">
        <input type="hidden" name="aircraftId" value={aircraftId} />
        <input type="hidden" name="id" value={id} />
        {/* Remounted after a save, so the boxes show what was stored. */}
        <div key={`${exported.join()}|${imported.join()}`} className="grid gap-5">
          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-semibold">{t("send")}</legend>
            <p className="text-sm text-muted-foreground">{t("sendHint")}</p>
            <label className="flex items-start gap-3 opacity-80">
              <input type="checkbox" checked disabled className="mt-1" />
              <span className="text-sm">{t("alwaysSent")}</span>
            </label>
            {EXPORT_FIELDS.map((f) =>
              box("export", f, exported.includes(f), PERSONAL_EXPORT_FIELDS.includes(f)),
            )}
          </fieldset>
          {takes && (
            <fieldset className="grid gap-3">
              <legend className="mb-1 text-sm font-semibold">{t("take")}</legend>
              <p className="text-sm text-muted-foreground">{t("takeHint")}</p>
              <label className="flex items-start gap-3 opacity-80">
                <input type="checkbox" checked disabled className="mt-1" />
                <span className="text-sm">{t("alwaysTaken")}</span>
              </label>
              {IMPORT_FIELDS.map((f) => box("import", f, imported.includes(f)))}
            </fieldset>
          )}
        </div>
        <FormMessage state={state} />
        <SubmitButton
          variant="outline"
          size="sm"
          className="justify-self-start"
          pendingText={t("saving")}
        >
          {t("save")}
        </SubmitButton>
      </form>
    </details>
  );
}
