"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { initialFormState } from "@/lib/forms";
import { certify } from "./actions";
import { FIELD_COLUMN } from "./entry-label";

export type DraftRow = { id: string; label: string; source: string; missing: string[] };

/** Tick drafts and certify them (LOG-2): after that they can't be changed. */
export function CertifyForm({ drafts }: { drafts: DraftRow[] }) {
  const t = useTranslations("logbook");
  const [state, formAction] = useActionState(certify, initialFormState);
  return (
    <form action={formAction} className="grid gap-3">
      <FormMessage state={state} />
      <ul className="grid divide-y">
        {drafts.map((d) => (
          <li key={d.id} className="flex flex-wrap items-start gap-3 py-2">
            <input
              type="checkbox"
              name="ids"
              value={d.id}
              id={`certify-${d.id}`}
              defaultChecked={d.missing.length === 0}
              disabled={d.missing.length > 0}
              className="mt-1 size-4"
              aria-label={t("drafts.select", { name: d.label })}
            />
            <div className="grid min-w-0 flex-1 gap-0.5 text-sm">
              <label htmlFor={`certify-${d.id}`} className="font-medium">
                {d.label}
              </label>
              {d.source !== "manual" && (
                <span className="text-xs text-muted-foreground">
                  {t(`source.${d.source}` as "source.scan")}
                </span>
              )}
              {d.missing.length > 0 && (
                <span className="text-xs text-destructive">
                  {t("drafts.missing", {
                    fields: d.missing
                      .map((f) => t(`columns.${FIELD_COLUMN[f] ?? "total"}` as "columns.total"))
                      .join(", "),
                  })}
                </span>
              )}
            </div>
            <Link href={`/logbook/${d.id}`} className="text-sm underline-offset-4 hover:underline">
              {t("detail.open")}
            </Link>
          </li>
        ))}
      </ul>
      <SubmitButton className="justify-self-start" pendingText={t("entry.saving")}>
        {t("drafts.certify")}
      </SubmitButton>
    </form>
  );
}
