"use client";

import { useActionState, useState } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextAreaField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import { initialFormState } from "@/lib/forms";
import type { CredentialKind } from "@/lib/pilot/labels";
import { review } from "../actions";

const REASON = { pilot: "reason", owner: "reasonOwner", claimant: "reasonClaimant" } as const;
const CONFIRM_REJECT = {
  pilot: "confirmReject",
  owner: "confirmRejectOwner",
  claimant: "confirmRejectClaimant",
} as const;

/**
 * Verify / reject buttons for one credential, aircraft document or airport claim. Rejecting asks
 * for a reason for the pilot, owner or claimant.
 */
export function ReviewForm({
  kind,
  id,
  version,
  name,
  status,
  recipient = "pilot",
}: {
  kind: CredentialKind | "aircraftDocument" | "airportClaim";
  id: string;
  /** updated_at the admin is looking at (ISO). */
  version: string;
  name: string;
  status: "pending" | "verified" | "rejected";
  /** Who is told about a rejection. */
  recipient?: "pilot" | "owner" | "claimant";
}) {
  const t = useTranslations("admin.review");
  const [state, formAction] = useActionState(review, initialFormState);
  const [rejecting, setRejecting] = useState(false);

  return (
    <form action={formAction} className="grid gap-3">
      <FormMessage state={state} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      {rejecting ? (
        <>
          <input type="hidden" name="decision" value="reject" />
          <TextAreaField
            name="reason"
            id={`reason-${id}`}
            label={t(REASON[recipient])}
            placeholder={t("reasonPlaceholder")}
            maxLength={500}
            rows={3}
            required
            autoFocus
            defaultValue={state.values?.reason}
            errors={state.errors?.reason}
          />
          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="destructive" size="sm" pendingText={t("rejecting")}>
              <XIcon aria-hidden /> {t(CONFIRM_REJECT[recipient])}
            </SubmitButton>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRejecting(false)}>
              {t("cancel")}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          {status !== "verified" && (
            <SubmitButton
              name="decision"
              value="verify"
              size="sm"
              pendingText={t("verifying")}
              aria-label={t("verifyLabel", { name })}
            >
              <CheckIcon aria-hidden /> {t("verify")}
            </SubmitButton>
          )}
          {status !== "rejected" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRejecting(true)}
              aria-label={t("rejectLabel", { name })}
            >
              <XIcon aria-hidden /> {status === "verified" ? t("revoke") : t("reject")}
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
