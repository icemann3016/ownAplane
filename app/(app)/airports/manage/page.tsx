import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon, PlusIcon, TowerControlIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listMyClaims } from "@/lib/airport-teams/claims";
import { myAirports } from "@/lib/airport-teams/teams";
import { requireUser } from "@/lib/auth/session";
import { intlLocale, type Locale } from "@/lib/i18n/config";
import { ClaimCard } from "./claim-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("airports.manage");
  return { title: t("title") };
}

const FILED = ["pending", "unconfirmed", "unsent"] as const;

/** The airfields the user runs on ownAplane and their claims (APT-1). */
export default async function AirportsPage({
  searchParams,
}: {
  searchParams: Promise<{ filed?: string }>;
}) {
  const user = await requireUser("/airports/manage");
  const t = await getTranslations("airports");
  const locale = (await getLocale()) as Locale;
  const { filed } = await searchParams;
  const [airports, claims] = await Promise.all([myAirports(user.id), listMyClaims(user.id)]);
  const day = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeZone: "UTC" });
  const notice = FILED.find((f) => f === filed);

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-6 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("manage.title")}</h1>
          <p className="text-muted-foreground">{t("manage.description")}</p>
        </div>
        <Button asChild>
          <Link href="/airports/manage/claim">
            <PlusIcon aria-hidden /> {t("manage.claimAirport")}
          </Link>
        </Button>
      </div>

      {notice && (
        <Alert variant={notice === "unsent" ? "destructive" : "success"}>
          <AlertDescription>{t(`manage.filed.${notice}`)}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("manage.myAirports")}</CardTitle>
        </CardHeader>
        <CardContent>
          {airports.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("manage.noAirports")}</p>
          ) : (
            <ul className="grid divide-y">
              {airports.map(({ airport, role }) => (
                <li key={airport.ident}>
                  <Link
                    href={`/airports/manage/${encodeURIComponent(airport.ident)}`}
                    className="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 hover:bg-accent"
                  >
                    <TowerControlIcon className="size-5 shrink-0 text-primary" aria-hidden />
                    <span className="grid min-w-0 gap-0.5">
                      <span className="truncate font-medium">
                        <span className="font-mono">{airport.icaoCode ?? airport.ident}</span>{" "}
                        {airport.name}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {[airport.municipality, airport.country].filter(Boolean).join(", ")}
                      </span>
                    </span>
                    <Badge variant="outline" className="ml-auto">
                      {t(`roles.${role}`)}
                    </Badge>
                    <ChevronRightIcon className="size-4 shrink-0" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4" aria-labelledby="claims">
        <h2 id="claims" className="text-lg font-semibold">
          {t("manage.claims")}
        </h2>
        {claims.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("manage.noClaims")}</p>
        ) : (
          claims.map((c) => (
            <ClaimCard
              key={c.id}
              claim={c}
              filedOn={day.format(c.createdAt)}
              decidedOn={c.decidedAt ? day.format(c.decidedAt) : null}
            />
          ))
        )}
      </section>
    </div>
  );
}
