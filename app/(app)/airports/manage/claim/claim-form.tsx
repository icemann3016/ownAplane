"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import { AirportPicker } from "@/components/airport-picker";
import { DocumentField } from "@/components/document-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextAreaField, TextField } from "@/components/forms/text-field";
import { initialFormState } from "@/lib/forms";
import { fileClaimAction } from "../actions";

const PROOFS = ["document", "email"] as const;

/** Claim an airfield: which one, the person's position and their proof (APT-1). */
export function ClaimForm() {
  const t = useTranslations("airports.claim");
  const [state, formAction] = useActionState(fileClaimAction, initialFormState);
  const v = state.values ?? {};
  const [proof, setProof] = useState<(typeof PROOFS)[number]>(
    v.proof === "email" ? "email" : "document",
  );
  return (
    <form action={formAction} className="grid gap-5">
      <FormMessage state={state} />
      <AirportPicker name="airport" label={t("airport")} errors={state.errors?.airport} />
      <TextField
        name="position"
        label={t("position")}
        placeholder={t("positionPlaceholder")}
        defaultValue={v.position}
        errors={state.errors?.position}
        maxLength={80}
        required
      />
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t("proof")}</legend>
        {PROOFS.map((p) => (
          <label
            key={p}
            className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[:checked]:border-primary"
          >
            <input
              type="radio"
              name="proof"
              value={p}
              checked={proof === p}
              onChange={() => setProof(p)}
              className="mt-1"
            />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">{t(`proofs.${p}.label`)}</span>
              <span className="text-sm text-muted-foreground">{t(`proofs.${p}.hint`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {proof === "document" ? (
        <DocumentField
          name="documentId"
          label={t("document")}
          errors={state.errors?.documentId}
          required
        />
      ) : (
        <TextField
          name="email"
          type="email"
          label={t("email")}
          placeholder="ops@your-airport.com"
          defaultValue={v.email}
          errors={state.errors?.email}
          autoComplete="email"
          maxLength={200}
          required
        />
      )}
      <TextAreaField
        name="note"
        label={t("note")}
        defaultValue={v.note}
        errors={state.errors?.note}
        maxLength={500}
        rows={3}
      />
      <p className="text-sm text-muted-foreground">{t("privacy")}</p>
      <SubmitButton className="justify-self-start" pendingText={t("submitting")}>
        {t("submit")}
      </SubmitButton>
    </form>
  );
}
