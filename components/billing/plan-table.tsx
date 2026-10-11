import { CheckIcon, MinusIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { PLAN_NAMES, PLANS, type PlanFeatures } from "@/lib/billing/plans";

type Row = { key: string; value: (f: PlanFeatures) => boolean | number | string };

const GROUPS: { key: "pilots" | "owners" | "ai"; rows: Row[] }[] = [
  {
    key: "pilots",
    rows: [
      { key: "basics", value: () => true },
      { key: "currencyTracker", value: (f) => f.currencyTracker },
      { key: "logbookExtras", value: (f) => f.logbookExtras },
      { key: "savedSearches", value: (f) => f.savedSearches },
      { key: "bookingsCalendar", value: (f) => f.bookingsCalendar },
    ],
  },
  {
    key: "owners",
    rows: [
      { key: "aircraft", value: (f) => f.aircraft },
      { key: "instantBooking", value: (f) => f.instantBooking },
      { key: "usage", value: (f) => (f.usageMonths === null ? "full" : f.usageMonths) },
      { key: "statistics", value: (f) => f.statistics },
      { key: "featured", value: (f) => f.featured || false },
      { key: "calendarLink", value: (f) => f.calendarLink },
    ],
  },
  { key: "ai", rows: [{ key: "aiCredits", value: (f) => f.aiCreditsPerMonth || false }] },
];

/** Every plan's features side by side (SUB-5). Scrolls sideways on small screens. */
export async function PlanTable() {
  const t = await getTranslations("billing");
  const cell = (v: boolean | number | string, rowKey: string) => {
    if (v === true) {
      return (
        <>
          <CheckIcon className="inline size-4 text-primary" aria-hidden />
          <span className="sr-only">{t("table.yes")}</span>
        </>
      );
    }
    if (v === false) {
      return (
        <>
          <MinusIcon className="inline size-4 text-muted-foreground" aria-hidden />
          <span className="sr-only">{t("table.no")}</span>
        </>
      );
    }
    if (rowKey === "usage")
      return v === "full" ? t("table.full") : t("table.months", { months: v });
    return v;
  };
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[36rem] text-sm">
        <caption className="sr-only">{t("table.caption")}</caption>
        <thead>
          <tr className="border-b bg-muted/50">
            <th scope="col" className="p-3 text-left font-medium">
              {t("table.feature")}
            </th>
            {PLAN_NAMES.map((p) => (
              <th key={p} scope="col" className="p-3 text-center font-medium">
                {t(`plans.${p}`)}
              </th>
            ))}
          </tr>
        </thead>
        {GROUPS.map((g) => (
          <tbody key={g.key}>
            <tr>
              <th
                scope="colgroup"
                colSpan={PLAN_NAMES.length + 1}
                className="bg-muted/30 px-3 pt-4 pb-2 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase"
              >
                {t(`table.groups.${g.key}`)}
              </th>
            </tr>
            {g.rows.map((r) => (
              <tr key={r.key} className="border-b last:border-0">
                <th scope="row" className="p-3 text-left font-normal">
                  {t(`table.rows.${r.key}` as "table.rows.basics")}
                </th>
                {PLAN_NAMES.map((p) => (
                  <td key={p} className="p-3 text-center">
                    {cell(r.value(PLANS[p]), r.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
