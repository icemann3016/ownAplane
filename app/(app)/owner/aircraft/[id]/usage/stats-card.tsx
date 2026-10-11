import { getLocale, getTranslations } from "next-intl/server";

import { PlanNote } from "@/components/billing/plan-note";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice } from "@/lib/aircraft/format";
import { aircraftEarnings } from "@/lib/bookings/owner-stats";
import type { UsageFlight } from "@/lib/domain/usage";
import { usageByMonth, usageTotals } from "@/lib/domain/usage";
import { intlLocale, type Locale } from "@/lib/i18n/config";
import { formatDuration } from "@/lib/logbook/duration";

/** Owner statistics (SUB-10): flights, hours, earnings and the busiest months; paid plans. */
export async function StatsCard({
  ownerId,
  aircraftId,
  flights,
  included,
}: {
  ownerId: string;
  aircraftId: string;
  flights: UsageFlight[];
  included: boolean;
}) {
  const t = await getTranslations("usage.stats");
  const locale = (await getLocale()) as Locale;
  if (!included) {
    return <PlanNote>{t("planNeeded")}</PlanNote>;
  }
  const earnings = await aircraftEarnings(ownerId, aircraftId);
  const totals = usageTotals(flights);
  const busiest = usageByMonth(flights, "UTC")
    .sort((a, b) => b.flownMinutes - a.flownMinutes)
    .slice(0, 3);
  const monthName = new Intl.DateTimeFormat(intlLocale(locale), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const money = (n: number, currency: string) => formatPrice(n, currency, locale);
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">{t("flights")}</dt>
            <dd className="text-lg font-semibold">{totals.flights}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("hours")}</dt>
            <dd className="text-lg font-semibold">{formatDuration(totals.flownMinutes)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("earnings")}</dt>
            <dd className="grid">
              {earnings.length === 0
                ? "—"
                : earnings.map((e) => (
                    <span key={e.currency}>
                      <span className="text-lg font-semibold">{money(e.total, e.currency)}</span>{" "}
                      <span className="text-muted-foreground">
                        {t("lastYear", { amount: money(e.lastYear, e.currency) })}
                      </span>
                    </span>
                  ))}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("busiest")}</dt>
            <dd>
              <ol className="grid">
                {busiest.map((m) => (
                  <li key={m.month}>
                    {monthName.format(new Date(`${m.month}-01T00:00:00Z`))} ·{" "}
                    {formatDuration(m.flownMinutes)}
                  </li>
                ))}
              </ol>
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">{t("note")}</p>
      </CardContent>
    </Card>
  );
}
