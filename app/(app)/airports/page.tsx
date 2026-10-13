import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon, TowerControlIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listAirportsOnOwnAplane } from "@/lib/airport-profile/queries";
import { intlLocale, type Locale } from "@/lib/i18n/config";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("airports.index");
  return { title: t("title"), description: t("description") };
}

/** The airfields on ownAplane, by country (APT-1). */
export default async function AirportsIndexPage() {
  const t = await getTranslations("airports");
  const locale = (await getLocale()) as Locale;
  const country = new Intl.DisplayNames([intlLocale(locale)], { type: "region" });
  const airports = await listAirportsOnOwnAplane();
  const byCountry = Map.groupBy(airports, (a) => a.country);

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-6 px-4 py-10">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("index.title")}</h1>
        <p className="text-muted-foreground">{t("index.description")}</p>
      </div>
      {airports.length === 0 && <p className="text-sm text-muted-foreground">{t("index.none")}</p>}
      {[...byCountry].map(([code, list]) => (
        <Card key={code}>
          <CardHeader>
            <CardTitle as="h2">{country.of(code) ?? code}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid divide-y">
              {list.map((a) => (
                <li key={a.ident}>
                  <Link
                    href={`/airports/${encodeURIComponent(a.ident)}`}
                    className="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 hover:bg-accent"
                  >
                    <TowerControlIcon className="size-5 shrink-0 text-primary" aria-hidden />
                    <span className="grid min-w-0 gap-0.5">
                      <span className="truncate font-medium">
                        <span className="font-mono">{a.icaoCode ?? a.ident}</span> {a.name}
                      </span>
                      {a.municipality && (
                        <span className="text-sm text-muted-foreground">{a.municipality}</span>
                      )}
                    </span>
                    {a.pprRequired && (
                      <Badge variant="outline" className="ml-auto">
                        {t("public.ppr")}
                      </Badge>
                    )}
                    <ChevronRightIcon
                      className={a.pprRequired ? "size-4 shrink-0" : "ml-auto size-4 shrink-0"}
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">{t("index.runOne")}</p>
          <Button variant="outline" size="sm" asChild>
            <Link href="/airports/manage/claim">{t("manage.claimAirport")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
