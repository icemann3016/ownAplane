import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, CircleCheckIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { RequestLines } from "@/components/airport-requests/request-lines";
import { RequestStatusBadge } from "@/components/airport-requests/status-badge";
import { RequestWarnings } from "@/components/airport-requests/request-warnings";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUtc } from "@/lib/aircraft/format";
import { requestWarnings } from "@/lib/airport-requests/checks";
import { getAirportRequest } from "@/lib/airport-requests/queries";
import { requireUser } from "@/lib/auth/session";
import type { Locale } from "@/lib/i18n/config";
import { AnswerForm } from "./answer-form";
import { CancelForm } from "./cancel-form";
import { TripCard } from "./trip-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("airportRequests.detail");
  return { title: t("metaTitle") };
}

/**
 * A request to an airfield (APT-2…5) for its pilot (cancel) and the airfield's team (answer):
 * the trip, the services with their prices and a rough total, warnings and the answer.
 */
export default async function AirportRequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sent?: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const user = await requireUser(`/airport-requests/${id}`);
  const data = await getAirportRequest(user.id, id);
  if (!data) notFound();
  const { sent } = await searchParams;
  const t = await getTranslations("airportRequests");
  const locale = (await getLocale()) as Locale;
  const { request: r, airport, operator } = data;
  const isPilot = r.pilotId === user.id;
  const team = data.role !== null;
  const code = airport.icaoCode ?? airport.ident;
  const asksCustoms = data.items.some((i) => i.category === "customs");
  const warnings = requestWarnings({
    arrivalAt: r.arrivalAt,
    departureAt: r.departureAt,
    airportCountry: airport.country,
    fromCountry: data.from?.country ?? null,
    toCountry: data.to?.country ?? null,
    asksCustoms,
    pprRequired: operator.pprRequired,
    pprNoticeHours: operator.pprNoticeHours,
    hours: data.hours,
    closures: data.closures,
    timeZone: airport.timezone,
    sentAt: r.createdAt,
  });
  const last = [r.departureAt, r.arrivalAt].find(Boolean);
  const open = r.status === "pending" || r.status === "approved";
  const back = team
    ? { href: `/airports/manage/${encodeURIComponent(airport.ident)}`, label: t("board.title") }
    : { href: "/airport-requests", label: t("list.title") };

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-6 px-4 py-10">
      <Button variant="ghost" size="sm" className="-ml-3 justify-self-start" asChild>
        <Link href={back.href}>
          <ArrowLeftIcon aria-hidden /> {back.label}
        </Link>
      </Button>
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("detail.title", { registration: r.registration, airport: `${code} ${airport.name}` })}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <RequestStatusBadge request={r} />
          <span className="text-sm text-muted-foreground">
            {t("detail.sentOn", { date: formatUtc(r.createdAt, locale) })}
          </span>
        </div>
      </div>
      {sent && isPilot && (
        <Alert variant="success">
          <CircleCheckIcon aria-hidden />
          <AlertDescription>
            {r.status === "approved" ? t("detail.sentConfirmed") : t("detail.sentPending")}
          </AlertDescription>
        </Alert>
      )}
      <RequestWarnings warnings={warnings} />
      <TripCard data={data} showPilot={!isPilot} />
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("form.services")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <RequestLines items={data.items} currency={r.currency} />
          {r.otherRequest && (
            <div className="grid gap-1 text-sm">
              <span className="text-muted-foreground">{t("form.other")}</span>
              <p className="whitespace-pre-line">{r.otherRequest}</p>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("detail.answer")}</CardTitle>
          <CardDescription>
            {r.status === "pending"
              ? t("detail.waiting", { airport: code })
              : r.autoConfirmed && r.status === "approved" && !r.answeredAt
                ? t("detail.autoConfirmed", { airport: code })
                : r.answeredAt
                  ? t("detail.answeredBy", {
                      name: data.answeredBy ?? code,
                      date: formatUtc(r.answeredAt, locale),
                    })
                  : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          {r.pprNumber && (
            <p>
              {t("answer.pprNumber")}:{" "}
              <span className="font-mono font-semibold">{r.pprNumber}</span>
            </p>
          )}
          {r.conditions && (
            <p>
              {t("answer.conditions")}: {r.conditions}
            </p>
          )}
          {r.operatorNote && <p className="whitespace-pre-line">{r.operatorNote}</p>}
          {team && r.status !== "cancelled" && (
            <AnswerForm
              id={r.id}
              initial={{
                decision: r.status === "declined" ? "decline" : "approve",
                pprNumber: r.pprNumber ?? "",
                conditions: r.conditions ?? "",
                note: r.operatorNote ?? "",
              }}
            />
          )}
          {isPilot && open && last && last > new Date() && <CancelForm id={r.id} />}
          {isPilot && (operator.phone || operator.email) && (
            <p className="text-muted-foreground">
              {t("detail.contact", {
                airport: code,
                contact: [operator.phone, operator.email].filter(Boolean).join(" · "),
              })}
            </p>
          )}
        </CardContent>
      </Card>
      {isPilot && r.bookingId && (
        <p className="text-sm">
          <Link href={`/bookings/${r.bookingId}`} className="underline underline-offset-4">
            {t("detail.booking")}
          </Link>
        </p>
      )}
      <p className="rounded-md border p-3 text-sm text-muted-foreground">{t("form.statement")}</p>
    </div>
  );
}
