"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { DocumentField, type UploadedDocument } from "@/components/document-field";
import { SelectField, TextField } from "@/components/forms/text-field";
import {
  CLASS_RATINGS,
  LICENCE_LABELS,
  LICENCE_TYPES,
  MEDICAL_CLASSES,
  PRIVILEGES,
  RATING_KINDS,
} from "@/lib/pilot/catalog";

// The fields of the credential form per kind (the scan upload of licences and medicals is in the
// dialog, so reading it can fill these in).

type Values = Record<string, string | undefined>;
type Errors = Record<string, string[] | undefined>;
type Options = { value: string; label: string }[];

export function LicenceFields({
  values: v,
  errors: e,
  countries,
}: {
  values: Values;
  errors: Errors;
  countries: Options;
}) {
  const t = useTranslations("pilot");
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="type"
          label={t("licences.type")}
          defaultValue={v.type || "ppl_a"}
          errors={e.type}
          options={LICENCE_TYPES.map((code) => ({
            value: code,
            label: LICENCE_LABELS[code] ?? t("licences.other"),
          }))}
        />
        <SelectField
          name="issuingState"
          label={t("fields.issuingState")}
          defaultValue={v.issuingState ?? ""}
          errors={e.issuingState}
          required
          options={[{ value: "", label: t("fields.chooseCountry") }, ...countries]}
        />
      </div>
      <TextField
        name="number"
        label={t("licences.number")}
        hint={t("licences.numberHint")}
        defaultValue={v.number}
        errors={e.number}
        maxLength={50}
        autoComplete="off"
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="issuedOn"
          type="date"
          label={t("licences.issuedOn")}
          defaultValue={v.issuedOn}
          errors={e.issuedOn}
        />
        <TextField
          name="expiresOn"
          type="date"
          label={t("licences.expiresOn")}
          hint={t("licences.expiresOnHint")}
          defaultValue={v.expiresOn}
          errors={e.expiresOn}
        />
      </div>
    </>
  );
}

export function MedicalFields({
  values: v,
  errors: e,
  countries,
}: {
  values: Values;
  errors: Errors;
  countries: Options;
}) {
  const t = useTranslations("pilot");
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="class"
          label={t("medical.class")}
          defaultValue={v.class || "class2"}
          errors={e.class}
          options={MEDICAL_CLASSES.map((c) => ({
            value: c,
            label: t(`medical.classes.${c}`),
          }))}
        />
        <SelectField
          name="issuingState"
          label={t("fields.issuingState")}
          defaultValue={v.issuingState ?? ""}
          errors={e.issuingState}
          required
          options={[{ value: "", label: t("fields.chooseCountry") }, ...countries]}
        />
      </div>
      <TextField
        name="validUntil"
        type="date"
        label={t("medical.validUntil")}
        hint={t("medical.validUntilHint")}
        defaultValue={v.validUntil}
        errors={e.validUntil}
        required
      />
    </>
  );
}

export function RatingFields({
  values: v,
  errors: e,
  document,
}: {
  values: Record<string, string | undefined>;
  errors: Record<string, string[] | undefined>;
  document?: UploadedDocument | null;
}) {
  const t = useTranslations("pilot");
  const [kind, setKind] = useState(v.kind ?? "class");
  // Keep the chosen code only while it fits the chosen kind.
  const code = v.kind === kind ? v.code : undefined;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="kind"
          label={t("ratings.kind")}
          value={kind}
          onChange={(ev) => setKind(ev.target.value)}
          errors={e.kind}
          options={RATING_KINDS.map((k) => ({ value: k, label: t(`ratings.kinds.${k}`) }))}
        />
        {kind === "class" && (
          <SelectField
            key="class"
            name="code"
            label={t("ratings.code")}
            defaultValue={code ?? "SEP_LAND"}
            errors={e.code}
            options={CLASS_RATINGS.map((c) => ({ value: c, label: t(`classRatings.${c}`) }))}
          />
        )}
        {kind === "privilege" && (
          <SelectField
            key="privilege"
            name="code"
            label={t("ratings.code")}
            defaultValue={code ?? "NIGHT"}
            errors={e.code}
            options={PRIVILEGES.map((p) => ({ value: p, label: t(`privileges.${p}`) }))}
          />
        )}
        {kind === "type" && (
          <TextField
            key="type"
            name="code"
            label={t("ratings.typeCode")}
            hint={t("ratings.typeCodeHint")}
            defaultValue={code}
            errors={e.code}
            maxLength={8}
            autoCapitalize="characters"
            autoComplete="off"
            required
          />
        )}
      </div>
      <TextField
        name="expiresOn"
        type="date"
        label={t("ratings.expiresOn")}
        hint={t("ratings.expiresOnHint")}
        defaultValue={v.expiresOn}
        errors={e.expiresOn}
      />
      <DocumentField
        name="documentId"
        label={t("fields.documentOptional")}
        hint={t("ratings.documentHint")}
        initial={document}
        errors={e.documentId}
      />
    </>
  );
}
