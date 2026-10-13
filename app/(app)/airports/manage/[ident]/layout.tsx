import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { myAirportRole } from "@/lib/airport-teams/teams";
import { requireUser } from "@/lib/auth/session";
import { intlLocale, type Locale } from "@/lib/i18n/config";
import { AirportTabs } from "./airport-tabs";

/** An airfield's area for its team (APT-1): who it is, its tabs. Only its members see it. */
export default async function AirportManageLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ident: string }>;
}) {
  const ident = decodeURIComponent((await params).ident);
  const user = await requireUser(`/airports/manage/${encodeURIComponent(ident)}`);
  const membership = await myAirportRole(user.id, ident);
  if (!membership) notFound();
  const t = await getTranslations("airports");
  const locale = (await getLocale()) as Locale;
  const day = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeZone: "UTC" });
  const { airport } = membership;

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-6 px-4 py-10">
      <Button variant="ghost" size="sm" className="-ml-3 justify-self-start" asChild>
        <Link href="/airports/manage">
          <ArrowLeftIcon aria-hidden /> {t("manage.title")}
        </Link>
      </Button>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              <span className="font-mono">{airport.icaoCode ?? airport.ident}</span> {airport.name}
            </h1>
            <Badge variant="outline">{t(`roles.${membership.role}`)}</Badge>
          </div>
          <p className="text-muted-foreground">
            {[airport.municipality, airport.country].filter(Boolean).join(", ")} ·{" "}
            {t("team.onSince", { date: day.format(membership.verifiedAt) })}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/airports/${encodeURIComponent(airport.ident)}`}>
            {t("profile.viewPage")} <ExternalLinkIcon aria-hidden />
          </Link>
        </Button>
      </div>
      <AirportTabs ident={airport.ident} />
      {children}
    </div>
  );
}
