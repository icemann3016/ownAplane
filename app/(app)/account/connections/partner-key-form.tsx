"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import type { Partner } from "@/lib/calendar-sync/partner-list";
import { initialFormState } from "@/lib/forms";
import { savePartnerKeyAction } from "./actions";

/**
 * Enter a partner's API key (SYN-7). Write-only: never filled in or shown again. It isn't a
 * password field (so browsers don't offer to save it), autocomplete and password managers are
 * off, and the text is masked where the browser supports it.
 */
export function PartnerKeyForm({ partner, hasKey }: { partner: Partner; hasKey: boolean }) {
  const t = useTranslations("account.connections");
  const [state, formAction] = useActionState(savePartnerKeyAction, initialFormState);
  return (
    <form action={formAction} autoComplete="off" className="grid gap-3">
      <FormMessage state={state} />
      <input type="hidden" name="partner" value={partner} />
      <TextField
        name="apiKey"
        id={`apiKey-${partner}`}
        type="text"
        label={hasKey ? t("newKey") : t("key")}
        hint={t("keyHint")}
        errors={state.errors?.apiKey}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-1p-ignore=""
        data-lpignore="true"
        data-bwignore=""
        data-form-type="other"
        className="font-mono [-webkit-text-security:disc]"
        required
      />
      <SubmitButton className="justify-self-start" pendingText={t("checking")}>
        {hasKey ? t("replace") : t("save")}
      </SubmitButton>
    </form>
  );
}
