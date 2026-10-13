"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { initialFormState } from "@/lib/forms";
import { changeMemberAction } from "./actions";

/** A manager's buttons for one member (role, remove), or "Leave the team" on one's own row. */
export function MemberActions({
  ident,
  userId,
  name,
  role,
  self,
  manager,
}: {
  ident: string;
  userId: string;
  name: string;
  role: "manager" | "staff";
  /** This row is the viewer. */
  self: boolean;
  /** The viewer is a manager. */
  manager: boolean;
}) {
  const t = useTranslations("airports.team");
  const [state, formAction] = useActionState(changeMemberAction, initialFormState);
  if (!self && !manager) return null;
  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="ident" value={ident} />
      <input type="hidden" name="userId" value={userId} />
      <div className="flex flex-wrap gap-2">
        {manager && !self && (
          <SubmitButton
            variant="outline"
            size="sm"
            name="role"
            value={role === "manager" ? "staff" : "manager"}
            pendingText={t("saving")}
          >
            {role === "manager" ? t("makeStaff") : t("makeManager")}
          </SubmitButton>
        )}
        <SubmitButton
          variant="ghost"
          size="sm"
          className="text-destructive"
          pendingText={t("saving")}
          aria-label={self ? undefined : t("removeLabel", { name })}
        >
          {self ? t("leave") : t("remove")}
        </SubmitButton>
      </div>
      {state.message && !state.ok && <FormMessage state={state} />}
    </form>
  );
}
