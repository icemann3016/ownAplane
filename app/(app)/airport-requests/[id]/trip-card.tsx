import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUtc } from "@/lib/aircraft/format";
import type { AirportRequestView } from "@/lib/airport-requests/queries";
import { intlLocale, type Locale } from "@/lib/i18n/config";

type Place = AirportRequestView["from"];
const code = (p: NonNullable<Place>) => p.icaoCode ?? p.ident;

/** The trip of a request: arrival and departure (UTC), aircraft, people on board, pilot. */
export async function TripCard({
  data,
  showPilot,
}: {
  data: AirportRequestView;
  showPilot: boolean;
}) {
  const t = await getTranslations("airportRequests.detail");
  const tf = await getTranslations("airportRequests.form");
  const locale = (await getLocale()) as Locale;
  const number = new Intl.NumberFormat(intlLocale(locale));
  const r = data.request;
  const rows: [string, React.ReactNode][] = [];
  if (r.arrivalAt) {
    rows.push([
      t("arrival"),
      <>
        <span className="font-medium">{formatUtc(r.arrivalAt, locale)}</span>
        {data.from && ` · ${t("fromPlace", { place: `${code(data.from)} ${data.from.name}` })}`}
      </>,
    ]);
  }
  if (r.departureAt) {
    rows.push([
      t("departure"),
      <>
        <span className="font-medium">{formatUtc(r.departureAt, locale)}</span>
        {data.to && ` · ${t("toPlace", { place: `${code(data.to)} ${data.to.name}` })}`}
      </>,
    ]);
  }
  rows.push([
    t("aircraft"),
    [r.registration, r.aircraftType, r.mtomKg ? t("mtom", { kg: number.format(r.mtomKg) }) : null]
      .filter(Boolean)
      .join(" · "),
  ]);
  rows.push([tf("pob"), String(r.pob)]);
  rows.push([tf("purpose"), tf(`purposes.${r.purpose}`)]);
  if (showPilot) {
    rows.push([
      t("pilot"),
      <Link key="pilot" href={`/u/${r.pilotId}`} className="underline underline-offset-4">
        {data.pilot}
      </Link>,
    ]);
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("trip")}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
