"use client";

import { useActionState, useState } from "react";
import { PencilIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { DocumentField, type UploadedDocument } from "@/components/document-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { type FormState, initialFormState } from "@/lib/forms";
import type { CredentialKind } from "@/lib/pilot/labels";
import { saveLicence, saveMedical, saveRating } from "./actions";
import { LicenceFields, MedicalFields, RatingFields } from "./credential-fields";
import { ScanReader } from "./scan-reader";

export type Country = { code: string; name: string };

const actions = { licence: saveLicence, rating: saveRating, medical: saveMedical };
const section = { licence: "licences", rating: "ratings", medical: "medical" } as const;

/** Add or edit a licence, rating or medical in a dialog. */
export function CredentialDialog({
  kind,
  values,
  document,
  countries,
  wasVerified,
  label,
  canRead = false,
}: {
  kind: CredentialKind;
  /** Current values when editing (dates as YYYY-MM-DD). */
  values?: Record<string, string>;
  document?: UploadedDocument | null;
  countries: Country[];
  wasVerified?: boolean;
  /** Accessible name of the edit button, e.g. "Edit PPL(A)". */
  label?: string;
  /** Scans can be read to fill in the form (VER-9). */
  canRead?: boolean;
}) {
  const t = useTranslations(`pilot.${section[kind]}`);
  const tp = useTranslations("pilot");
  const [open, setOpen] = useState(false);
  const editing = Boolean(values?.id);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="ghost" size="sm" aria-label={label}>
            <PencilIcon aria-hidden /> {tp("edit")}
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <PlusIcon aria-hidden /> {t("add")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? t("editTitle") : t("addTitle")}</DialogTitle>
          <DialogDescription>{t("dialogDescription")}</DialogDescription>
        </DialogHeader>
        <CredentialForm
          kind={kind}
          values={values}
          document={document}
          countries={countries}
          wasVerified={wasVerified}
          canRead={canRead}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function CredentialForm({
  kind,
  values: initial,
  document,
  countries,
  wasVerified,
  canRead,
  onSaved,
}: {
  kind: CredentialKind;
  values?: Record<string, string>;
  document?: UploadedDocument | null;
  countries: Country[];
  wasVerified?: boolean;
  canRead: boolean;
  onSaved: () => void;
}) {
  const t = useTranslations("pilot");
  const [state, formAction] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await actions[kind](prev, formData);
    if (result.ok) onSaved();
    return result;
  }, initialFormState);
  // What was read from the scan; the fields are drawn again (key) to show it.
  const [read, setRead] = useState<{ values: Record<string, string>; version: number }>({
    values: {},
    version: 0,
  });
  const [documentId, setDocumentId] = useState(document?.id ?? null);
  const filled = Object.fromEntries(Object.entries(read.values).filter(([, value]) => value));
  const v = { ...initial, ...filled, ...state.values };
  const e = state.errors ?? {};
  const countryOptions = countries.map((c) => ({ value: c.code, label: c.name }));
  const scanned = kind === "licence" || kind === "medical";

  return (
    <form action={formAction} className="grid gap-4">
      <FormMessage state={state} />
      {wasVerified && (
        <Alert>
          <TriangleAlertIcon />
          <AlertDescription>{t("editResetsReview")}</AlertDescription>
        </Alert>
      )}
      {v.id && <input type="hidden" name="id" value={v.id} />}

      {scanned && (
        <>
          <DocumentField
            name="documentId"
            label={t("fields.document")}
            hint={t(kind === "licence" ? "licences.documentHint" : "medical.documentHint")}
            required
            initial={document}
            errors={e.documentId}
            onChange={(doc) => setDocumentId(doc.id)}
          />
          {canRead && (
            <ScanReader
              kind={kind}
              documentId={documentId}
              onRead={(values) => setRead((r) => ({ values, version: r.version + 1 }))}
            />
          )}
        </>
      )}
      <div key={read.version} className="grid gap-4">
        {kind === "licence" && <LicenceFields values={v} errors={e} countries={countryOptions} />}
        {kind === "medical" && <MedicalFields values={v} errors={e} countries={countryOptions} />}
        {kind === "rating" && <RatingFields values={v} errors={e} document={document} />}
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {t("cancel")}
          </Button>
        </DialogClose>
        <SubmitButton pendingText={t("saving")}>{t("save")}</SubmitButton>
      </DialogFooter>
    </form>
  );
}
