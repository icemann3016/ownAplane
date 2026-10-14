import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, InfoIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { serviceOptions } from "@/lib/airport-requests/estimate";
import { bookingPrefill } from "@/lib/airport-requests/prefill";
import { getAirportProfile } from "@/lib/airport-profile/queries";
import { getAirport } from "@/lib/airports";
import { requireProfile } from "@/lib/auth/session";
import { RequestForm } from "./request-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("airportRequests.form");
  return { title: t("metaTitle") };
}

/**
 * A pilot's request to arrive at or depart from an airfield on ownAplane (APT-2/3): the services
 * they need from its list, plus anything else in their own words. `?booking=` fills it in from
 * one of their bookings (APT-7).
 */
export default async function AirportRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ ident: string }>;
  searchParams: Promise<{ booking?: string }>;
}) {
  const ident = decodeURIComponent((await params).ident).toUpperCase();
  const { booking } = await searchParams;
  const path = `/airports/${encodeURIComponent(ident)}/request${booking ? `?booking=${booking}` : ""}`;
  const { userId, roles } = await requireProfile(path);
  const data = await getAirportProfile(ident);
  if (!data) notFound();
  const t = await getTranslations("airportRequests.form");
  const { airport, profile } = data;
  const code = airport.icaoCode ?? airport.ident;
  const prefill =
    booking && /^[0-9a-f-]{36}$/.test(booking)
      ? await bookingPrefill(userId, booking, ident)
      : null;
  const [fromAirport, toAirport] = await Promise.all([
    getAirport(prefill?.fromIdent),
    getAirport(prefill?.toIdent),
  ]);

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-6 px-4 py-10">
      <Button variant="ghost" size="sm" className="-ml-3 justify-self-start" asChild>
        <Link href={`/airports/${encodeURIComponent(ident)}`}>
          <ArrowLeftIcon aria-hidden /> {code} {airport.name}
        </Link>
      </Button>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("title", { airport: `${code} ${airport.name}` })}
        </h1>
        <p className="text-muted-foreground">
          {profile.pprRequired
            ? t("pprText", { hours: profile.pprNoticeHours ?? 0 })
            : t("noPprText")}
        </p>
      </div>
      {!roles.includes("pilot") ? (
        <Alert>
          <InfoIcon aria-hidden />
          <AlertDescription>{t("notPilot")}</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardContent>
            {prefill && (
              <p className="mb-4 text-sm text-muted-foreground">
                {t("fromBooking", { registration: prefill.registration })}
              </p>
            )}
            <RequestForm
              ident={ident}
              currency={profile.currency}
              options={serviceOptions(data.services)}
              initial={{ ...prefill, fromAirport, toAirport }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
