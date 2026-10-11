import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { INTERVALS, type Interval } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

/** Monthly / yearly prices: two links that keep the choice in the URL (no script needed). */
export async function IntervalSwitch({ interval, path }: { interval: Interval; path: string }) {
  const t = await getTranslations("billing.interval");
  return (
    <nav aria-label={t("label")} className="flex flex-wrap items-center gap-3">
      <ul className="inline-flex rounded-md border p-1">
        {INTERVALS.map((i) => (
          <li key={i}>
            <Link
              href={`${path}?interval=${i}`}
              scroll={false}
              aria-current={i === interval ? "page" : undefined}
              className={cn(
                "flex rounded px-3 py-1 text-sm",
                i === interval
                  ? "bg-primary font-medium text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(i)}
            </Link>
          </li>
        ))}
      </ul>
      <span className="text-sm text-muted-foreground">{t("yearSaves")}</span>
    </nav>
  );
}

export const intervalFrom = (value: string | string[] | undefined): Interval =>
  value === "year" ? "year" : "month";
