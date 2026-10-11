import type { Metadata } from "next";
import { DownloadIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { SectionHeading } from "@/components/aircraft/section-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlanNote } from "@/components/billing/plan-note";
import { requireOwnAircraft } from "@/lib/aircraft/owner";
import { getMyPlan } from "@/lib/billing/plan";
import { PLANS, usageSince } from "@/lib/billing/plans";
import { getUnits } from "@/lib/aircraft/queries";
import { getAircraftUsage, pilotNames } from "@/lib/bookings/usage";
import { usageByMonth, usageByPilot, usageTotals } from "@/lib/domain/usage";
import { intlLocale, type Locale } from "@/lib/i18n/config";
import { MeterReadings } from "./meter-readings";
import { StatsCard } from "./stats-card";
import { UsageTable } from "./usage-table";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("aircraft.sections");
  return { title: t("usage") };
}

/** Hours, landings, fuel and oil from confirmed flight logs, per month and pilot (BKG-16). */
export default async function UsagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, aircraft } = await requireOwnAircraft(id, "usage");
  const t = await getTranslations("usage");
  const ta = await getTranslations("aircraft");
  const locale = (await getLocale()) as Locale;
  const { plan } = await getMyPlan(user.id);
  const since = usageSince(plan);
  const [{ flights }, units] = await Promise.all([
    getAircraftUsage(user.id, id, since),
    getUnits(user.id),
  ]);
  const timeZone = "UTC";
  const months = usageByMonth(flights, timeZone);
  const pilots = usageByPilot(flights);
  const names = await pilotNames(
    user.id,
    pilots.map((p) => p.pilotId),
  );
  const monthName = new Intl.DateTimeFormat(intlLocale(locale), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const tableProps = { units, oilUnit: aircraft.oilUnit, timeBasis: aircraft.timeBasis };

  return (
    <div className="grid grid-cols-1 gap-6">
      <SectionHeading title={ta("sections.usage")} text={ta("sectionText.usage")} />
      {since && <PlanNote>{t("planWindow", { months: PLANS[plan].usageMonths ?? 0 })}</PlanNote>}
      {flights.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t("none")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <StatsCard
            ownerId={user.id}
            aircraftId={id}
            flights={flights}
            included={PLANS[plan].statistics}
          />
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle as="h2">{t("total")}</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <a href={`/api/aircraft/${id}/usage`} download>
                  <DownloadIcon aria-hidden /> {t("export")}
                </a>
              </Button>
            </CardHeader>
            <CardContent>
              <UsageTable
                {...tableProps}
                label={t("total")}
                rows={[{ key: "total", label: t("allFlights"), ...usageTotals(flights) }]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle as="h2">{t("byMonth")}</CardTitle>
            </CardHeader>
            <CardContent>
              <UsageTable
                {...tableProps}
                label={t("byMonth")}
                rows={months.map((m) => ({
                  key: m.month,
                  label: monthName.format(new Date(`${m.month}-01T00:00:00Z`)),
                  ...m,
                }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle as="h2">{t("byPilot")}</CardTitle>
            </CardHeader>
            <CardContent>
              <UsageTable
                {...tableProps}
                label={t("byPilot")}
                rows={pilots.map((p) => ({
                  key: p.pilotId ?? "deleted",
                  label: p.pilotId ? (names.get(p.pilotId) ?? "") : t("deletedPilot"),
                  ...p,
                }))}
              />
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">{t("note")}</p>
        </>
      )}
      <MeterReadings userId={user.id} aircraftId={id} />
    </div>
  );
}
