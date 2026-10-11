"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
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
import { strikeThrough } from "../actions";

/** Strike a certified entry through with a reason (LOG-2): it stays visible, no longer counts. */
export function StrikeThrough({ id }: { id: string }) {
  const t = useTranslations("logbook");
  const [state, formAction] = useActionState(strikeThrough, initialFormState);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-destructive">
          {t("detail.void")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("detail.voidTitle")}</DialogTitle>
          <DialogDescription>{t("detail.voidHint")}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <FormMessage state={state} />
          <input type="hidden" name="id" value={id} />
          <TextField
            name="reason"
            label={t("detail.voidReason")}
            defaultValue={state.values?.reason}
            errors={state.errors?.reason}
            maxLength={500}
            required
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("entry.cancel")}
              </Button>
            </DialogClose>
            <SubmitButton variant="destructive" pendingText={t("entry.saving")}>
              {t("detail.void")}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
