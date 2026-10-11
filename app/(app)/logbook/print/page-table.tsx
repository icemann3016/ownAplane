import { getTranslations } from "next-intl/server";

import { formatDuration as d } from "@/lib/logbook/duration";
import type { LogbookPage } from "@/lib/logbook/pages";
import type { Totals } from "@/lib/logbook/totals";
import { clock } from "../entry-label";

const cell = "border px-1 py-0.5";

/** One page of the logbook as the two facing pages of a paper EASA logbook, side by side. */
export async function PageTable({ page }: { page: LogbookPage }) {
  const t = await getTranslations("logbook");
  const sums = (label: string, s: Totals) => (
    <tr className="font-medium">
      <td className={cell} colSpan={7}>
        {label}
      </td>
      <td className={`${cell} text-right`}>{d(s.seMinutes)}</td>
      <td className={`${cell} text-right`}>{d(s.meMinutes)}</td>
      <td className={`${cell} text-right`}>{d(s.mpMinutes)}</td>
      <td className={`${cell} text-right`}>{d(s.totalMinutes)}</td>
      <td className={cell} />
      <td className={`${cell} text-right`}>{s.landingsDay}</td>
      <td className={`${cell} text-right`}>{s.landingsNight}</td>
      <td className={`${cell} text-right`}>{d(s.nightMinutes)}</td>
      <td className={`${cell} text-right`}>{d(s.ifrMinutes)}</td>
      <td className={`${cell} text-right`}>{d(s.picMinutes)}</td>
      <td className={`${cell} text-right`}>{d(s.copilotMinutes)}</td>
      <td className={`${cell} text-right`}>{d(s.dualMinutes)}</td>
      <td className={`${cell} text-right`}>{d(s.instructorMinutes)}</td>
      <td className={cell} colSpan={2} />
      <td className={`${cell} text-right`}>{d(s.fstdMinutes)}</td>
      <td className={cell} />
    </tr>
  );
  return (
    <table className="w-full border-collapse break-inside-avoid text-[10px] leading-tight">
      <caption className="text-left text-xs font-medium">{t("print.page", { n: page.n })}</caption>
      <thead>
        <tr>
          <th className={cell} rowSpan={2}>
            {t("columns.date")}
          </th>
          <th className={cell} colSpan={2}>
            {t("columns.departure")}
          </th>
          <th className={cell} colSpan={2}>
            {t("columns.arrival")}
          </th>
          <th className={cell} colSpan={2}>
            {t("columns.aircraft")}
          </th>
          <th className={cell} colSpan={2}>
            {t("columns.singlePilot")}
          </th>
          <th className={cell} rowSpan={2}>
            {t("columns.mp")}
          </th>
          <th className={cell} rowSpan={2}>
            {t("columns.total")}
          </th>
          <th className={cell} rowSpan={2}>
            {t("columns.picName")}
          </th>
          <th className={cell} colSpan={2}>
            {t("columns.landings")}
          </th>
          <th className={cell} colSpan={2}>
            {t("columns.conditionTime")}
          </th>
          <th className={cell} colSpan={4}>
            {t("columns.functionTime")}
          </th>
          <th className={cell} colSpan={3}>
            {t("columns.fstd")}
          </th>
          <th className={cell} rowSpan={2}>
            {t("columns.remarks")}
          </th>
        </tr>
        <tr>
          <th className={cell}>{t("columns.place")}</th>
          <th className={cell}>{t("columns.time")}</th>
          <th className={cell}>{t("columns.place")}</th>
          <th className={cell}>{t("columns.time")}</th>
          <th className={cell}>{t("columns.type")}</th>
          <th className={cell}>{t("columns.registration")}</th>
          <th className={cell}>{t("columns.se")}</th>
          <th className={cell}>{t("columns.me")}</th>
          <th className={cell}>{t("columns.day")}</th>
          <th className={cell}>{t("columns.night")}</th>
          <th className={cell}>{t("columns.night")}</th>
          <th className={cell}>{t("columns.ifr")}</th>
          <th className={cell}>{t("columns.pic")}</th>
          <th className={cell}>{t("columns.copilot")}</th>
          <th className={cell}>{t("columns.dual")}</th>
          <th className={cell}>{t("columns.instructor")}</th>
          <th className={cell}>{t("columns.date")}</th>
          <th className={cell}>{t("columns.fstdType")}</th>
          <th className={cell}>{t("columns.fstdTime")}</th>
        </tr>
      </thead>
      <tbody>
        {page.rows.map((e) => {
          const flight = e.kind === "flight";
          return (
            <tr key={e.id} className={e.status === "superseded" ? "line-through" : undefined}>
              <td className={cell}>{flight ? e.date : ""}</td>
              <td className={cell}>{e.departurePlace}</td>
              <td className={cell}>{clock(e.departureTime)}</td>
              <td className={cell}>{e.arrivalPlace}</td>
              <td className={cell}>{clock(e.arrivalTime)}</td>
              <td className={cell}>{e.aircraftType}</td>
              <td className={cell}>{e.registration}</td>
              <td className={`${cell} text-right`}>{d(e.seMinutes)}</td>
              <td className={`${cell} text-right`}>{d(e.meMinutes)}</td>
              <td className={`${cell} text-right`}>{d(e.mpMinutes)}</td>
              <td className={`${cell} text-right`}>{d(e.totalMinutes)}</td>
              <td className={cell}>{e.picName}</td>
              <td className={`${cell} text-right`}>{e.landingsDay}</td>
              <td className={`${cell} text-right`}>{e.landingsNight}</td>
              <td className={`${cell} text-right`}>{d(e.nightMinutes)}</td>
              <td className={`${cell} text-right`}>{d(e.ifrMinutes)}</td>
              <td className={`${cell} text-right`}>{d(e.picMinutes)}</td>
              <td className={`${cell} text-right`}>{d(e.copilotMinutes)}</td>
              <td className={`${cell} text-right`}>{d(e.dualMinutes)}</td>
              <td className={`${cell} text-right`}>{d(e.instructorMinutes)}</td>
              <td className={cell}>{flight ? "" : e.date}</td>
              <td className={cell}>{e.fstdType}</td>
              <td className={`${cell} text-right`}>{d(e.fstdMinutes)}</td>
              <td className={cell}>{[e.remarks, e.voidReason].filter(Boolean).join(" · ")}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        {sums(t("print.thisPage"), page.thisPage)}
        {sums(t("print.previous"), page.previous)}
        {sums(t("print.toDate"), page.toDate)}
      </tfoot>
    </table>
  );
}
