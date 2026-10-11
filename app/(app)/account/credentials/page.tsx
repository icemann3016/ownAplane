import type { Metadata } from "next";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  ClockIcon,
  FileTextIcon,
  PlaneIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { AccountTabs } from "@/components/account/account-tabs";
import { CreditsNote } from "@/components/billing/credits-note";
import { SubmitButton } from "@/components/forms/submit-button";
import { ExpiryText, StatusBadge } from "@/components/pilot/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/session";
import type { VerificationStatus } from "@/lib/db/schema";
import { intlLocale } from "@/lib/i18n/config";
import { getLogbookExperience } from "@/lib/logbook/experience";
import { isOcrConfigured } from "@/lib/ocr";
import { countryName, ISSUING_STATES } from "@/lib/pilot/catalog";
import { credentialItems, getPilotCredentials } from "@/lib/pilot/credentials";
import { type CredentialKind, credentialLabel, type PilotTranslate } from "@/lib/pilot/labels";
import { pilotSummary } from "@/lib/pilot/summary";
import { expiryState } from "@/lib/pilot/validity";
import { setRole } from "../actions";
import { type Country, CredentialDialog } from "./credential-dialog";
import { DeleteCredential } from "./delete-credential";
import { ExperienceForm, TypeHours } from "./experience-form";
import { LogbookExperience } from "./logbook-experience";

// Reading a scan with the AI (scan-actions.ts) can take a while.
export const maxDuration = 60;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pilot");
  return { title: t("title") };
}

type Row = {
  id: string;
  kind: CredentialKind;
  name: string;
  details: string[];
  status: VerificationStatus;
  rejectionReason: string | null;
  expiresOn: string | null;
  document: { id: string; filename: string } | null;
  values: Record<string, string>;
};

export default async function PilotPage() {
  const { userId, roles } = await requireProfile("/account/credentials");
  const t = await getTranslations("pilot");
  const locale = await getLocale();
  const tl = t as unknown as PilotTranslate;

  if (!roles.includes("pilot")) {
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10">
        <AccountTabs />
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <Card>
          <CardHeader>
            <PlaneIcon className="size-5 text-primary" aria-hidden />
            <CardTitle as="h2">{t("notPilotTitle")}</CardTitle>
            <CardDescription>{t("notPilotText")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={setRole}>
              <input type="hidden" name="role" value="pilot" />
              <input type="hidden" name="enable" value="true" />
              <SubmitButton>{t("switchOn")}</SubmitButton>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const creds = await getPilotCredentials(userId);
  const canRead = isOcrConfigured();
  const fromLogbook = await getLogbookExperience(userId);
  const summary = pilotSummary(credentialItems(creds));
  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const formatDate = (d: string) => dateFormat.format(new Date(`${d}T00:00:00Z`));
  const countries: Country[] = ISSUING_STATES.map((code) => ({
    code,
    name: countryName(code, locale),
  })).sort((a, b) => a.name.localeCompare(b.name, locale));
  const doc = (id: string | null) => (id ? (creds.documentsById.get(id) ?? null) : null);
  const str = (v: string | null) => v ?? "";

  const licences: Row[] = creds.licences.map((l) => ({
    id: l.id,
    kind: "licence",
    name: credentialLabel({ kind: "licence", type: l.type }, tl),
    details: [countryName(l.issuingState, locale), l.number],
    status: l.status,
    rejectionReason: l.rejectionReason,
    expiresOn: l.expiresOn,
    document: doc(l.documentId),
    values: {
      id: l.id,
      type: l.type,
      issuingState: l.issuingState,
      number: l.number,
      issuedOn: str(l.issuedOn),
      expiresOn: str(l.expiresOn),
    },
  }));
  const ratings: Row[] = creds.ratings.map((r) => ({
    id: r.id,
    kind: "rating",
    name: credentialLabel({ kind: "rating", ratingKind: r.kind, code: r.code }, tl),
    details: [t(`ratings.kinds.${r.kind}`)],
    status: r.status,
    rejectionReason: r.rejectionReason,
    expiresOn: r.expiresOn,
    document: doc(r.documentId),
    values: { id: r.id, kind: r.kind, code: r.code, expiresOn: str(r.expiresOn) },
  }));
  const meds: Row[] = creds.medicals.map((m) => ({
    id: m.id,
    kind: "medical",
    name: credentialLabel({ kind: "medical", class: m.class }, tl),
    details: [countryName(m.issuingState, locale)],
    status: m.status,
    rejectionReason: m.rejectionReason,
    expiresOn: m.validUntil,
    document: doc(m.documentId),
    values: {
      id: m.id,
      class: m.class,
      issuingState: m.issuingState,
      validUntil: m.validUntil,
    },
  }));

  const expiryLabel = (row: Row) => {
    const state = expiryState(row.expiresOn);
    if (!row.expiresOn) return { state, text: t("expiry.none") };
    return {
      state,
      text: t(`expiry.${state}` as "expiry.valid", { date: formatDate(row.expiresOn) }),
    };
  };

  const sections = [
    { kind: "licence" as const, key: "licences" as const, rows: licences },
    { kind: "medical" as const, key: "medical" as const, rows: meds },
    { kind: "rating" as const, key: "ratings" as const, rows: ratings },
  ];

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10">
      <AccountTabs />
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
        {canRead && <CreditsNote userId={userId} />}
      </div>

      <SummaryAlert summary={summary} t={t} />

      {sections.map(({ kind, key, rows }) => (
        <Card key={kind}>
          <CardHeader className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1.5">
              <CardTitle as="h2">{t(`${key}.title`)}</CardTitle>
              <CardDescription>{t(`${key}.description`)}</CardDescription>
            </div>
            <CredentialDialog kind={kind} countries={countries} canRead={canRead} />
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t(`${key}.empty`)}</p>
            ) : (
              <ul className="grid divide-y">
                {rows.map((row) => {
                  const expiry = expiryLabel(row);
                  return (
                    <li key={row.id} className="grid gap-2 py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{row.name}</h3>
                        <StatusBadge status={row.status} label={t(`status.${row.status}`)} />
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        {row.details.map((d) => (
                          <span key={d}>{d}</span>
                        ))}
                        <ExpiryText state={expiry.state} text={expiry.text} />
                        {row.document && (
                          <a
                            href={`/api/documents/${row.document.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline"
                          >
                            <FileTextIcon className="size-3.5" aria-hidden />
                            {t("viewDocument")}
                          </a>
                        )}
                      </div>
                      {row.status === "rejected" && row.rejectionReason && (
                        <p className="text-sm text-destructive">
                          {t("rejectedBecause", { reason: row.rejectionReason })}
                        </p>
                      )}
                      <div className="-ml-3 flex gap-1">
                        <CredentialDialog
                          kind={row.kind}
                          values={row.values}
                          document={row.document}
                          countries={countries}
                          wasVerified={row.status === "verified"}
                          label={t("editLabel", { name: row.name })}
                          canRead={canRead}
                        />
                        <DeleteCredential kind={row.kind} id={row.id} name={row.name} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("experience.title")}</CardTitle>
          <CardDescription>{t("experience.description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <LogbookExperience experience={fromLogbook} />
          <ExperienceForm
            totalHours={String(creds.experience?.totalHours ?? "")}
            picHours={String(creds.experience?.picHours ?? "")}
            last90DaysHours={String(creds.experience?.last90DaysHours ?? "")}
            birthDate={creds.experience?.birthDate ?? ""}
          />
          <TypeHours
            rows={creds.typeHours.map((r) => ({ aircraftType: r.aircraftType, hours: r.hours }))}
          />
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t("privacy")}
      </p>
    </div>
  );
}

function SummaryAlert({
  summary,
  t,
}: {
  summary: ReturnType<typeof pilotSummary>;
  t: Awaited<ReturnType<typeof getTranslations<"pilot">>>;
}) {
  const lines: string[] = [];
  if (summary.expired.length) lines.push(t("summary.expired", { count: summary.expired.length }));
  if (summary.expiring.length) {
    lines.push(t("summary.expiring", { count: summary.expiring.length }));
  }
  if (summary.rejected) lines.push(t("summary.rejected", { count: summary.rejected }));
  if (summary.pending) lines.push(t("summary.pending", { count: summary.pending }));

  if (summary.verified) {
    return (
      <Alert variant={lines.length ? "default" : "success"}>
        <CircleCheckIcon className="text-success" />
        <AlertTitle>{t("summary.verifiedTitle")}</AlertTitle>
        <AlertDescription>
          <p>{t("summary.verified")}</p>
          {lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </AlertDescription>
      </Alert>
    );
  }
  const attention = summary.expired.length > 0 || summary.rejected > 0;
  return (
    <Alert>
      {attention ? (
        <CircleAlertIcon className="text-destructive" />
      ) : (
        <ClockIcon className="text-muted-foreground" />
      )}
      <AlertTitle>{t("summary.notVerifiedTitle")}</AlertTitle>
      <AlertDescription>
        <p>{t("summary.missing")}</p>
        {lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </AlertDescription>
    </Alert>
  );
}
