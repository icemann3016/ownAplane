import { getTranslations } from "next-intl/server";

import type { LogbookEntry } from "@/lib/db/schema";
import { formatDuration } from "@/lib/logbook/duration";
import { clock } from "../entry-label";

/** Every EASA column of an entry, read-only. */
export async function EntryDetails({ entry: e }: { entry: LogbookEntry }) {
  const t = await getTranslations("logbook");
  const d = formatDuration;
  const rows: [string, string][] =
    e.kind === "fstd"
      ? [
          [t("columns.date"), e.date],
          [t("columns.fstdType"), e.fstdType ?? ""],
          [t("columns.fstdTime"), d(e.fstdMinutes)],
        ]
      : [
          [t("columns.date"), e.date],
          [t("columns.departure"), `${e.departurePlace ?? ""} ${clock(e.departureTime)}`],
          [t("columns.arrival"), `${e.arrivalPlace ?? ""} ${clock(e.arrivalTime)}`],
          [t("columns.type"), e.aircraftType ?? ""],
          [t("columns.registration"), e.registration ?? ""],
          [`${t("columns.singlePilot")} ${t("columns.se")}`, d(e.seMinutes)],
          [`${t("columns.singlePilot")} ${t("columns.me")}`, d(e.meMinutes)],
          [t("columns.mp"), d(e.mpMinutes)],
          [t("columns.total"), d(e.totalMinutes)],
          [t("columns.picName"), e.picName ?? ""],
          [`${t("columns.landings")} ${t("columns.day")}`, String(e.landingsDay ?? "")],
          [`${t("columns.landings")} ${t("columns.night")}`, String(e.landingsNight ?? "")],
          [t("columns.night"), d(e.nightMinutes)],
          [t("columns.ifr"), d(e.ifrMinutes)],
          [t("columns.pic"), d(e.picMinutes)],
          [t("columns.copilot"), d(e.copilotMinutes)],
          [t("columns.dual"), d(e.dualMinutes)],
          [t("columns.instructor"), d(e.instructorMinutes)],
          ...(e.kind === "brought_forward"
            ? ([[t("columns.fstd"), d(e.fstdMinutes)]] as [string, string][])
            : []),
        ];
  rows.push([t("columns.remarks"), e.remarks ?? ""]);
  return (
    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      {rows
        .filter(([, value]) => value.trim() !== "")
        .map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 border-b py-1">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
    </dl>
  );
}
