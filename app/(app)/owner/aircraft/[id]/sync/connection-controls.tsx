"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { CopyField } from "@/components/copy-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { initialFormState } from "@/lib/forms";
import { replaceApiKey, syncNow } from "./actions";

type Ids = { aircraftId: string; id: string };

const Hidden = ({ aircraftId, id }: Ids) => (
  <>
    <input type="hidden" name="aircraftId" value={aircraftId} />
    <input type="hidden" name="id" value={id} />
  </>
);

/** Read an iCal/JSON link now. */
export function SyncNow(ids: Ids) {
  const t = useTranslations("calendarSync");
  const [state, formAction] = useActionState(syncNow, initialFormState);
  return (
    <form action={formAction} className="grid gap-2">
      <Hidden {...ids} />
      <SubmitButton
        variant="outline"
        size="sm"
        className="justify-self-start"
        pendingText={t("syncing")}
      >
        {t("syncNow")}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

/** Replace a push connection's API key; the new key is shown once. */
export function ReplaceKey(ids: Ids) {
  const t = useTranslations("calendarSync");
  const [state, formAction] = useActionState(replaceApiKey, initialFormState);
  return (
    <form action={formAction} className="grid gap-2">
      <Hidden {...ids} />
      {state.secret ? (
        <CopyField
          label={t("apiKey.shown")}
          value={state.secret}
          hint={t("apiKey.shownHint", { header: "Authorization: Bearer oap_…" })}
        />
      ) : (
        <SubmitButton
          variant="outline"
          size="sm"
          className="justify-self-start"
          pendingText={t("working")}
        >
          {t("apiKey.replace")}
        </SubmitButton>
      )}
      {!state.secret && <FormMessage state={state} />}
    </form>
  );
}

/** A button that asks before running a server action (disconnect, reset a link). */
export function ConfirmAction({
  ids,
  action,
  button,
  title,
  text,
  confirm,
  destructive = false,
}: {
  ids: Ids;
  action: (formData: FormData) => Promise<void>;
  button: string;
  title: string;
  text: string;
  confirm: string;
  destructive?: boolean;
}) {
  const t = useTranslations("calendarSync");
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={destructive ? "text-destructive" : undefined}
        >
          {button}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{text}</DialogDescription>
        </DialogHeader>
        <form action={action}>
          <Hidden {...ids} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("cancel")}
              </Button>
            </DialogClose>
            <SubmitButton
              variant={destructive ? "destructive" : "default"}
              pendingText={t("working")}
            >
              {confirm}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
