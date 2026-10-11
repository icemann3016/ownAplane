import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import type { LogbookEntry } from "@/lib/db/schema";
import { formatDuration } from "@/lib/logbook/duration";
import { clock } from "./entry-label";

/** The pilot's entries, newest first; struck-through ones stay, struck through (LOG-2). */
export async function EntriesTable({ entries }: { entries: LogbookEntry[] }) {
  const t = await getTranslations("logbook");
  const head = "py-2 pr-3 font-medium whitespace-nowrap";
  return (
    <table className="w-full text-left text-sm">
      <caption className="sr-only">{t("list.title")}</caption>
      <thead className="text-xs text-muted-foreground">
        <tr>
          <th scope="col" className={head}>
            {t("columns.date")}
          </th>
          <th scope="col" className={head}>
            {t("columns.departure")}
          </th>
          <th scope="col" className={head}>
            {t("columns.arrival")}
          </th>
          <th scope="col" className={head}>
            {t("columns.aircraft")}
          </th>
          <th scope="col" className={`${head} text-right`}>
            {t("columns.total")}
          </th>
          <th scope="col" className={`${head} text-right`}>
            {t("columns.pic")}
          </th>
          <th scope="col" className={`${head} text-right`}>
            {t("columns.landings")}
          </th>
          <th scope="col" className={head}>
            {t("columns.status")}
          </th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {entries.map((e) => {
          const struck = e.status === "superseded";
          const status = struck ? (e.voidReason ? "voided" : "superseded") : e.status;
          const time = e.kind === "fstd" ? e.fstdMinutes : e.totalMinutes;
          return (
            <tr key={e.id} className={struck ? "text-muted-foreground line-through" : undefined}>
              <td className="py-2 pr-3 whitespace-nowrap">
                <Link href={`/logbook/${e.id}`} className="underline-offset-4 hover:underline">
                  {e.date}
                </Link>
              </td>
              <td className="py-2 pr-3 whitespace-nowrap">
                {e.kind === "flight"
                  ? `${e.departurePlace ?? ""} ${clock(e.departureTime)}`
                  : t(`kinds.${e.kind}`)}
              </td>
              <td className="py-2 pr-3 whitespace-nowrap">
                {e.kind === "flight"
                  ? `${e.arrivalPlace ?? ""} ${clock(e.arrivalTime)}`
                  : (e.fstdType ?? "")}
              </td>
              <td className="py-2 pr-3 whitespace-nowrap">
                {[e.aircraftType, e.registration].filter(Boolean).join(" · ")}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatDuration(time)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatDuration(e.picMinutes)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {e.landingsDay != null || e.landingsNight != null
                  ? (e.landingsDay ?? 0) + (e.landingsNight ?? 0)
                  : ""}
              </td>
              <td className="py-2 no-underline">
                <Badge variant={e.status === "draft" ? "outline" : "secondary"}>
                  {t(`status.${status}`)}
                </Badge>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
