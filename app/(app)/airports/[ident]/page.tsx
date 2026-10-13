import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ClockIcon,
  MailIcon,
  PhoneIcon,
  PlaneLandingIcon,
  RadioIcon,
  ReceiptIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { FrequencyList, RunwayList } from "@/components/airports/runway-lists";
import { ServiceList } from "@/components/airports/service-list";
import { WeekInUtc } from "@/components/airports/week-in-utc";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { upcomingHours } from "@/lib/airport-profile/hours";
import { getAirportProfile } from "@/lib/airport-profile/queries";
import { myAirportRole } from "@/lib/airport-teams/teams";
import { getUser } from "@/lib/auth/session";
import { intlLocale, type Locale } from "@/lib/i18n/config";

const identOf = async (params: Promise<{ ident: string }>) =>
  decodeURIComponent((await params).ident).toUpperCase();

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ident: string }>;
}): Promise<Metadata> {
  const data = await getAirportProfile(await identOf(params));
  if (!data) return {};
  const t = await getTranslations("airports.public");
  const name = `${data.airport.icaoCode ?? data.airport.ident} ${data.airport.name}`;
  return {
    title: name,
    description: data.profile.description?.slice(0, 160) ?? t("metaDescription", { name }),
  };
}

/** An airfield on ownAplane, for everyone (APT-1): hours in UTC, runways, radio, fees, contact. */
export default async function AirportPage({ params }: { params: Promise<{ ident: string }> }) {
  const ident = await identOf(params);
  const data = await getAirportProfile(ident);
  if (!data) notFound();
  const user = await getUser();
  const membership = user ? await myAirportRole(user.id, ident) : null;
  const t = await getTranslations("airports");
  const locale = (await getLocale()) as Locale;
  const country = new Intl.DisplayNames([intlLocale(locale)], { type: "region" });
  const number = new Intl.NumberFormat(intlLocale(locale));
  const { airport, profile } = data;
  const code = airport.icaoCode ?? airport.ident;
  const week = upcomingHours(data.hours, data.closures, airport.timezone);

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-6 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            <span className="font-mono">{code}</span> {airport.name}
          </h1>
          <p className="text-muted-foreground">
            {[airport.municipality, country.of(airport.country)].filter(Boolean).join(", ")}
            {airport.elevationFt !== null &&
              ` · ${t("public.elevation", { ft: number.format(airport.elevationFt) })}`}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {profile.pprRequired && (
              <Badge variant="outline" className="border-warning/50 text-warning">
                {profile.pprNoticeHours
                  ? t("public.pprNotice", { hours: profile.pprNoticeHours })
                  : t("public.ppr")}
              </Badge>
            )}
            {airport.iataCode && <Badge variant="outline">IATA {airport.iataCode}</Badge>}
          </div>
        </div>
        {membership && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/airports/manage/${encodeURIComponent(airport.ident)}/profile`}>
              {t("public.edit")}
            </Link>
          </Button>
        )}
      </div>

      <Alert>
        <TriangleAlertIcon />
        <AlertDescription>{t("public.disclaimer")}</AlertDescription>
      </Alert>

      {profile.description && <p className="whitespace-pre-line">{profile.description}</p>}

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="flex items-center gap-2">
            <ClockIcon className="size-5 text-primary" aria-hidden /> {t("public.hours")}
          </CardTitle>
          <CardDescription>{t("public.hoursText", { timeZone: airport.timezone })}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {data.hours.length || data.closures.length ? (
            <WeekInUtc week={week} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("public.noHours")}</p>
          )}
          {profile.hoursNote && <p className="text-sm">{profile.hoursNote}</p>}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
              <PlaneLandingIcon className="size-5 text-primary" aria-hidden />{" "}
              {t("runways.runwaysTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RunwayList runways={data.runways} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
              <RadioIcon className="size-5 text-primary" aria-hidden />{" "}
              {t("runways.frequenciesTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FrequencyList frequencies={data.frequencies} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="flex items-center gap-2">
            <ReceiptIcon className="size-5 text-primary" aria-hidden /> {t("public.services")}
          </CardTitle>
          <CardDescription>{t("public.servicesText")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ServiceList services={data.services} currency={profile.currency} />
        </CardContent>
      </Card>

      {(profile.phone || profile.email || profile.website) && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("public.contact")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {profile.phone && (
              <a
                href={`tel:${profile.phone.replace(/\s/g, "")}`}
                className="flex items-center gap-2 underline-offset-4 hover:underline"
              >
                <PhoneIcon className="size-4 text-primary" aria-hidden /> {profile.phone}
              </a>
            )}
            {profile.email && (
              <a
                href={`mailto:${profile.email}`}
                className="flex items-center gap-2 break-all underline-offset-4 hover:underline"
              >
                <MailIcon className="size-4 text-primary" aria-hidden /> {profile.email}
              </a>
            )}
            {profile.website && (
              <a
                href={profile.website}
                rel="noopener noreferrer nofollow"
                target="_blank"
                className="break-all underline underline-offset-4"
              >
                {profile.website.replace(/^https?:\/\//, "")}
              </a>
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-sm text-muted-foreground">{t("public.requestsSoon")}</p>
    </div>
  );
}
