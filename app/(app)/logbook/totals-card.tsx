import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/logbook/duration";
import type { LogbookTotals } from "@/lib/logbook/entries";

/** Totals to date per EASA column, the last 90 days and hours per type (LOG-1). */
export async function TotalsCard({ totals }: { totals: LogbookTotals }) {
  const t = await getTranslations("logbook");
  const all = totals.all;
  const rows: [string, string][] = [
    [t("columns.total"), formatDuration(all.totalMinutes)],
    [`${t("columns.singlePilot")} ${t("columns.se")}`, formatDuration(all.seMinutes)],
    [`${t("columns.singlePilot")} ${t("columns.me")}`, formatDuration(all.meMinutes)],
    [t("columns.mp"), formatDuration(all.mpMinutes)],
    [t("columns.pic"), formatDuration(all.picMinutes)],
    [t("columns.copilot"), formatDuration(all.copilotMinutes)],
    [t("columns.dual"), formatDuration(all.dualMinutes)],
    [t("columns.instructor"), formatDuration(all.instructorMinutes)],
    [t("columns.night"), formatDuration(all.nightMinutes)],
    [t("columns.ifr"), formatDuration(all.ifrMinutes)],
    [`${t("columns.landings")} ${t("columns.day")}`, String(all.landingsDay)],
    [`${t("columns.landings")} ${t("columns.night")}`, String(all.landingsNight)],
    [t("columns.fstd"), formatDuration(all.fstdMinutes)],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("totals.title")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6">
        {totals.certified === 0 ? (
          <p className="text-sm text-muted-foreground">{t("totals.none")}</p>
        ) : (
          <>
            <section className="grid gap-2" aria-labelledby="totals-to-date">
              <h3 id="totals-to-date" className="text-sm font-medium">
                {t("totals.toDate")}
              </h3>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                {rows.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-2 border-b py-1">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className="grid gap-2" aria-labelledby="totals-90">
              <h3 id="totals-90" className="text-sm font-medium">
                {t("totals.last90")}
              </h3>
              <p className="text-sm">
                {t("totals.flightTime")}:{" "}
                <span className="font-medium tabular-nums">
                  {formatDuration(totals.last90.totalMinutes)}
                </span>{" "}
                · {t("totals.landings")}:{" "}
                <span className="font-medium tabular-nums">
                  {totals.last90.landingsDay + totals.last90.landingsNight}
                </span>
              </p>
            </section>
            {totals.byType.length > 0 && (
              <section className="grid gap-2" aria-labelledby="totals-type">
                <h3 id="totals-type" className="text-sm font-medium">
                  {t("totals.byType")}
                </h3>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {totals.byType.map((r) => (
                    <li key={r.aircraftType}>
                      {r.aircraftType}:{" "}
                      <span className="font-medium tabular-nums">{formatDuration(r.minutes)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
