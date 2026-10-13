import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  FileTextIcon,
  MailCheckIcon,
  ShieldAlertIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isUuid } from "@/lib/aircraft/queries";
import { getClaimForReview } from "@/lib/airport-teams/claim-review";
import { emailDomain } from "@/lib/airport-teams/proof";
import { requireAdmin } from "@/lib/auth/session";
import { intlLocale, type Locale } from "@/lib/i18n/config";
import { ReviewForm } from "../../[userId]/review-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.airportClaim");
  return { title: t("metaTitle") };
}

/** Admin: does this person represent the airfield they claim (APT-1)? */
export default async function ReviewAirportClaimPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdmin(`/admin/verifications/airports/${id}`);
  if (!isUuid(id)) notFound();
  // The claimant's email is private auth data: trusted admin code (getClaimForReview).
  const found = await getClaimForReview(id);
  if (!found) notFound();
  const { claim, claimant, airport, document } = found;

  const t = await getTranslations("admin.airportClaim");
  const ta = await getTranslations("airports");
  const locale = (await getLocale()) as Locale;
  const when = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  const label = `${airport.icaoCode ?? airport.ident} ${airport.name}`;

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-6 px-4 py-10">
      <Button variant="ghost" size="sm" className="-ml-3 justify-self-start" asChild>
        <Link href="/admin/verifications">
          <ArrowLeftIcon aria-hidden /> {t("back")}
        </Link>
      </Button>
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title", { airport: label })}
          </h1>
          <Badge variant="outline">{ta(`claimStatus.${claim.status}`)}</Badge>
        </div>
        <p className="text-muted-foreground">
          {[airport.municipality, airport.country].filter(Boolean).join(", ")}
        </p>
      </div>

      <Alert>
        <ShieldAlertIcon />
        <AlertDescription>{t("checklist")}</AlertDescription>
      </Alert>
      {found.operated && (
        <Alert>
          <TriangleAlertIcon />
          <AlertDescription>
            {t("alreadyOperated", { airport: label, name: claimant.name })}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("claimant")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">{claimant.name}</span>
            <span className="break-all text-muted-foreground">{claimant.email}</span>
            <Link
              href={`/admin/users/${claimant.id}`}
              className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
            >
              {t("member")} <ExternalLinkIcon className="size-3.5" aria-hidden />
            </Link>
          </p>
          <p>{t("position", { position: claim.position })}</p>
          <p>{t("filed", { date: `${when.format(claim.createdAt)} UTC` })}</p>
          {claim.note && <p className="whitespace-pre-line">{t("note", { note: claim.note })}</p>}
          {document ? (
            <a
              href={`/api/documents/${document.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline"
            >
              <FileTextIcon className="size-4 text-primary" aria-hidden />
              {t("openDocument", { name: document.filename })}
              <ExternalLinkIcon className="size-3.5 text-muted-foreground" aria-hidden />
            </a>
          ) : claim.email ? (
            <p className="flex flex-wrap items-center gap-1.5">
              <MailCheckIcon className="size-4 text-primary" aria-hidden />
              {claim.emailConfirmedAt
                ? t("emailConfirmed", {
                    email: claim.email,
                    date: `${when.format(claim.emailConfirmedAt)} UTC`,
                  })
                : t("emailUnconfirmed", { email: claim.email })}
              <span className="text-muted-foreground">
                {t("domain", { domain: emailDomain(claim.email) ?? "" })}
              </span>
            </p>
          ) : (
            <p className="text-muted-foreground">{t("noProof")}</p>
          )}
          {claim.decidedAt && (
            <p className="font-medium">
              {t("decided", {
                status: ta(`claimStatus.${claim.status}`),
                date: `${when.format(claim.decidedAt)} UTC`,
              })}
            </p>
          )}
          {claim.status === "rejected" && claim.decisionNote && (
            <p className="text-destructive">
              {t("rejectedBecause", { reason: claim.decisionNote })}
            </p>
          )}
        </CardContent>
      </Card>

      {claim.status === "pending" && (
        <ReviewForm
          kind="airportClaim"
          id={claim.id}
          version={claim.updatedAt.toISOString()}
          name={label}
          status="pending"
          recipient="claimant"
        />
      )}
    </div>
  );
}
