import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { upcomingHours } from "@/lib/airport-profile/hours";
import { getAirportProfile } from "@/lib/airport-profile/queries";
import { myAirportRole } from "@/lib/airport-teams/teams";
import { requireUser } from "@/lib/auth/session";
import { intlLocale, type Locale } from "@/lib/i18n/config";
import { WeekInUtc } from "@/components/airports/week-in-utc";
import { ManagersOnly } from "../managers-only";
import { RemoveButton } from "../remove-button";
import { ClosureForm } from "./closure-form";
import { HoursForm } from "./hours-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("airports.tabs");
  return { title: t("hours") };
}

/** Opening hours in local time and closures; pilots see them in UTC (APT-1). */
export default async function AirportHoursPage({ params }: { params: Promise<{ ident: string }> }) {
  const ident = decodeURIComponent((await params).ident);
  const user = await requireUser(`/airports/manage/${encodeURIComponent(ident)}/hours`);
  const [membership, data] = await Promise.all([
    myAirportRole(user.id, ident),
    getAirportProfile(ident),
  ]);
  if (!membership || !data) notFound();
  const t = await getTranslations("airports.hours");
  const locale = (await getLocale()) as Locale;
  const day = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeZone: "UTC" });
  const manager = membership.role === "manager";
  const tz = data.airport.timezone;
  const week = upcomingHours(data.hours, data.closures, tz);
  const today = week[0]!.day;
  const closures = data.closures.filter((c) => c.endsOn >= today);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {manager ? (
            <HoursForm
              ident={ident}
              timeZone={tz}
              initial={data.hours}
              note={data.profile.hoursNote}
            />
          ) : (
            <ManagersOnly ident={ident} />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("previewTitle")}</CardTitle>
          <CardDescription>{t("previewText")}</CardDescription>
        </CardHeader>
        <CardContent>
          <WeekInUtc week={week} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("closures")}</CardTitle>
          <CardDescription>{t("closuresText")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {closures.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noClosures")}</p>
          ) : (
            <ul className="grid divide-y text-sm">
              {closures.map((c) => {
                const span =
                  c.startsOn === c.endsOn
                    ? day.format(new Date(`${c.startsOn}T00:00:00Z`))
                    : day.formatRange(
                        new Date(`${c.startsOn}T00:00:00Z`),
                        new Date(`${c.endsOn}T00:00:00Z`),
                      );
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 py-2">
                    <span className="grid gap-0.5">
                      <span className="font-medium">{span}</span>
                      {c.note && <span className="text-muted-foreground">{c.note}</span>}
                    </span>
                    {manager && (
                      <span className="ml-auto">
                        <RemoveButton
                          ident={ident}
                          item="closure"
                          id={c.id}
                          label={t("removeClosure", { dates: span })}
                          text={t("remove")}
                        />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {manager && <ClosureForm ident={ident} />}
        </CardContent>
      </Card>
    </>
  );
}
