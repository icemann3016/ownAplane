import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheckIcon, CircleIcon, ExternalLinkIcon, TriangleAlertIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { PlanNote } from "@/components/billing/plan-note";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LISTING_GAPS, type ListingGap, STATUS_ACTIONS } from "@/lib/aircraft/catalog";
import { requireOwnAircraft } from "@/lib/aircraft/owner";
import { getListingGaps } from "@/lib/aircraft/queries";
import { formatPrice } from "@/lib/aircraft/format";
import { airportPlace, getAirport } from "@/lib/airports";
import { getMyPlan, planUsage } from "@/lib/billing/plan";
import { DeleteAircraft } from "./delete-aircraft";
import { FeaturedControl } from "./featured-control";
import { StatusControls } from "./status-controls";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("aircraft.sections");
  return { title: t("overview") };
}

/** Where each missing item is fixed. */
const GAP_SECTION: Record<ListingGap, string> = {
  home_base: "base",
  price: "pricing",
  photo: "photos",
  arc: "documents",
  insurance: "documents",
};

export default async function AircraftOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, aircraft } = await requireOwnAircraft(id);
  const t = await getTranslations("aircraft");
  const locale = await getLocale();
  const gaps = await getListingGaps(user.id, id);
  const usage = await planUsage(user.id, (await getMyPlan(user.id)).plan);
  const airport = await getAirport(aircraft.homeAirportIdent);
  const base = `/owner/aircraft/${id}`;

  return (
    <div className="grid gap-6">
      <h1 className="text-xl font-semibold tracking-tight">{t("sections.overview")}</h1>

      {aircraft.unlistedReason && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertDescription>
            {t(`unlistedReasons.${aircraft.unlistedReason as "arc"}`)}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("overview.statusTitle")}</CardTitle>
          <CardDescription>{t(`statusText.${aircraft.status}`)}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ul className="grid gap-2 text-sm" aria-label={t("overview.checklist")}>
            {LISTING_GAPS.map((gap) => {
              const missing = gaps.includes(gap);
              return (
                <li key={gap} className="flex items-center gap-2">
                  {missing ? (
                    <CircleIcon className="size-4 text-muted-foreground" aria-hidden />
                  ) : (
                    <CircleCheckIcon className="size-4 text-success" aria-hidden />
                  )}
                  <span className={missing ? "" : "text-muted-foreground"}>
                    {t(`checklist.${gap}`)}
                    <span className="sr-only">
                      {" "}
                      ({missing ? t("overview.missing") : t("overview.done")})
                    </span>
                  </span>
                  {missing && (
                    <Link
                      href={`${base}/${GAP_SECTION[gap]}`}
                      className="ml-auto text-primary underline-offset-4 hover:underline"
                    >
                      {t("overview.fix")}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
          <StatusControls
            id={id}
            status={aircraft.status}
            actions={STATUS_ACTIONS[aircraft.status]}
            ready={gaps.length === 0}
          />
          {aircraft.status === "listed" && (
            <Button variant="link" className="justify-self-start px-0" asChild>
              <Link href={`/aircraft/${id}`}>
                {t("overview.viewListing")} <ExternalLinkIcon aria-hidden />
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {aircraft.status === "listed" && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("featured.title")}</CardTitle>
            <CardDescription>
              {aircraft.featured ? t("featured.isOn") : t("featured.text")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <p className="text-muted-foreground">
              {t("featured.usage", { used: usage.featured, limit: usage.featuredLimit })}
            </p>
            {usage.featuredLimit > 0 || aircraft.featured ? (
              <FeaturedControl id={id} featured={aircraft.featured} />
            ) : (
              <PlanNote>{t("featured.planNeeded")}</PlanNote>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("overview.summary")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">{t("fields.typeDesignator")}</dt>
              <dd className="font-medium">
                {aircraft.typeDesignator} · {t(`categories.${aircraft.category}`)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("fields.homeAirport")}</dt>
              <dd className="font-medium">
                {airport ? `${airport.code} · ${airportPlace(airport)}` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("fields.pricePerHour")}</dt>
              <dd className="font-medium">
                {aircraft.pricePerHour === null
                  ? "—"
                  : `${formatPrice(aircraft.pricePerHour, aircraft.currency, locale)} · ${t(
                      `priceBases.${aircraft.priceBasis}`,
                    )} · ${t(`timeBases.${aircraft.timeBasis}`)}`}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("fields.seats")}</dt>
              <dd className="font-medium">{aircraft.seats}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <DeleteAircraft id={id} registration={aircraft.registration} />
    </div>
  );
}
