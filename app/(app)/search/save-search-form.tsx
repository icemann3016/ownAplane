"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { BookmarkPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import { initialFormState } from "@/lib/forms";
import { saveSearchAction } from "./actions";

/** "Save this search" with a name and alerts for new matches (SRC-6). */
export function SaveSearchForm({ query, suggestedName }: { query: string; suggestedName: string }) {
  const t = useTranslations("saved.searches");
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(saveSearchAction, initialFormState);
  if (state.ok) {
    return (
      <p className="text-sm" role="status">
        {state.message}{" "}
        <Link href="/saved" className="underline">
          {t("openSaved")}
        </Link>
      </p>
    );
  }
  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <BookmarkPlusIcon aria-hidden /> {t("save")}
      </Button>
    );
  }
  const v = state.values ?? {};
  return (
    <form action={formAction} className="grid w-full gap-3 rounded-md border p-3 sm:max-w-md">
      <FormMessage state={state} />
      <input type="hidden" name="query" value={query} />
      <TextField
        name="name"
        label={t("name")}
        defaultValue={v.name ?? suggestedName}
        errors={state.errors?.name}
        maxLength={80}
        required
      />
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="alerts" defaultChecked className="mt-1" />
        <span>{t("alertsLabel")}</span>
      </label>
      <div className="flex gap-2">
        <SubmitButton size="sm" pendingText={t("saving")}>
          {t("confirm")}
        </SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
