import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { CopyField } from "@/components/copy-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatSpan } from "@/lib/aircraft/format";
import { getPracticeFlight, practiceRegistration } from "@/lib/admin/practice";
import { requireAdmin } from "@/lib/auth/session";
import type { Locale } from "@/lib/i18n/config";
import { appUrl } from "@/lib/site-url";
import { AdminHeader } from "../page-header";
import { removePractice, startPractice } from "../practice-actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.practice");
  return { title: t("title") };
}

/** Practice flights: try the check-out and check-in as a pilot on the live site (admins only). */
export default async function AdminPracticePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; removed?: string }>;
}) {
  const { userId } = await requireAdmin("/admin/practice");
  const { error, removed } = await searchParams;
  const t = await getTranslations("admin.practice");
  const ts = await getTranslations("booking.statuses");
  const locale = (await getLocale()) as Locale;
  const flight = await getPracticeFlight(userId);

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-6 px-4 py-8">
      <AdminHeader title={t("title")} text={t("description")} />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{t("errors.no_airfield")}</AlertDescription>
        </Alert>
      )}
      {removed && (
        <Alert>
          <AlertDescription>{t("removed")}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("current.title")}</CardTitle>
          <CardDescription>
            {t("current.text", { registration: practiceRegistration(userId) })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <p>{t("note")}</p>
          {flight ? (
            <>
              <p>
                {t("current.flight", {
                  registration: flight.registration,
                  span: formatSpan(flight.from, flight.to, locale),
                  status: ts(flight.status as "accepted"),
                })}
              </p>
              <CopyField
                label={t("current.link")}
                value={`${appUrl()}/bookings/${flight.bookingId}`}
              />
              <Button asChild className="justify-self-start">
                <Link href={`/bookings/${flight.bookingId}`}>{t("current.open")}</Link>
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground">{t("current.none")}</p>
          )}
          <form action={startPractice}>
            <SubmitButton variant={flight ? "outline" : "default"} pendingText={t("starting")}>
              {flight ? t("startAgain") : t("start")}
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("remove.title")}</CardTitle>
          <CardDescription>{t("remove.text")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={removePractice}>
            <SubmitButton variant="outline" size="sm" pendingText={t("removing")}>
              {t("remove.button")}
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
