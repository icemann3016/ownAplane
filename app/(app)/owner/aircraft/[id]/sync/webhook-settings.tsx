"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { CopyField } from "@/components/copy-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { type FormState, initialFormState } from "@/lib/forms";
import { removeWebhook, replaceWebhookSecret, saveWebhook, testWebhook } from "./webhook-actions";

type Ids = { aircraftId: string; id: string };

/** A small form that runs one webhook action and shows its message. */
function ActionButton({
  ids,
  action,
  label,
  pending,
  destructive,
}: {
  ids: Ids;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  label: string;
  pending: string;
  destructive?: boolean;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="aircraftId" value={ids.aircraftId} />
      <input type="hidden" name="id" value={ids.id} />
      <SubmitButton
        variant="outline"
        size="sm"
        className={destructive ? "justify-self-start text-destructive" : "justify-self-start"}
        pendingText={pending}
      >
        {label}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

/**
 * Tell the connected system about changes to our busy times (SYN-6): its address, our signing
 * secret, the last delivery, and a test call.
 */
export function WebhookSettings({
  ids,
  url,
  secret,
  status,
}: {
  ids: Ids;
  url: string | null;
  secret: string | null;
  /** What happened last, already in words. */
  status: string;
}) {
  const t = useTranslations("calendarSync.webhook");
  const [state, formAction] = useActionState(saveWebhook, initialFormState);
  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">{t("title")}</summary>
      <div className="mt-2 grid gap-4">
        <p className="text-sm text-muted-foreground">{t("text")}</p>
        <form action={formAction} className="grid gap-2">
          <input type="hidden" name="aircraftId" value={ids.aircraftId} />
          <input type="hidden" name="id" value={ids.id} />
          <input type="hidden" name="hasSecret" value={secret ? "1" : "0"} />
          <TextField
            name="url"
            type="url"
            label={t("url")}
            placeholder="https://"
            defaultValue={state.values?.url ?? url ?? ""}
            errors={state.errors?.url}
            required
          />
          <SubmitButton
            variant="outline"
            size="sm"
            className="justify-self-start"
            pendingText={t("saving")}
          >
            {t("save")}
          </SubmitButton>
          <FormMessage state={state} />
        </form>
        {url && secret && (
          <>
            <CopyField label={t("secret")} value={secret} hint={t("secretHint")} />
            <p className="text-sm">{status}</p>
            <div className="flex flex-wrap items-start gap-2">
              <ActionButton
                ids={ids}
                action={testWebhook}
                label={t("test")}
                pending={t("testing")}
              />
              <ActionButton
                ids={ids}
                action={replaceWebhookSecret}
                label={t("replaceSecret")}
                pending={t("saving")}
              />
              <ActionButton
                ids={ids}
                action={removeWebhook}
                label={t("remove")}
                pending={t("saving")}
                destructive
              />
            </div>
          </>
        )}
      </div>
    </details>
  );
}
