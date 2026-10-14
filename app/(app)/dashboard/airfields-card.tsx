import Link from "next/link";
import { TowerControlIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { myAirports } from "@/lib/airport-teams/teams";

/** The airfields the user runs, first on an airfield account's dashboard (APT-1). */
export async function AirfieldsCard({
  airfields,
  today,
}: {
  airfields: Awaited<ReturnType<typeof myAirports>>;
  today: Map<string, { arrivals: number; departures: number; open: number }>;
}) {
  const t = await getTranslations("dashboard.airfields");
  const ta = await getTranslations("airports");
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <TowerControlIcon className="size-5 text-primary" aria-hidden /> {t("title")}
        </CardTitle>
        <CardDescription>{t("text")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid divide-y text-sm">
          {airfields.map(({ airport, role }) => {
            const code = airport.icaoCode ?? airport.ident;
            const path = encodeURIComponent(airport.ident);
            return (
              <li key={airport.ident} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <Link
                  href={`/airports/manage/${path}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  <span className="font-mono">{code}</span> {airport.name}
                </Link>
                <span className="text-muted-foreground">{ta(`roles.${role}`)}</span>
                <span className="ml-auto flex gap-4">
                  <Link href={`/airports/manage/${path}`} className="underline underline-offset-4">
                    {ta("tabs.movements")}
                  </Link>
                  <Link
                    href={`/airports/manage/${path}/services`}
                    className="underline underline-offset-4"
                  >
                    {ta("tabs.services")}
                  </Link>
                  <Link href={`/airports/${path}`} className="underline underline-offset-4">
                    {t("publicPage")}
                  </Link>
                </span>
                <span className="basis-full text-muted-foreground">
                  {t("today", today.get(airport.ident) ?? { arrivals: 0, departures: 0, open: 0 })}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
