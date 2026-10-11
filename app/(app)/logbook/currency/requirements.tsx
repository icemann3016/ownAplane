import { CircleCheckIcon, CircleIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import type { Requirement } from "@/lib/logbook/currency";
import { formatDuration } from "@/lib/logbook/duration";

/** Experience requirements with how far along the pilot is (times in h:mm). */
export async function Requirements({ items }: { items: Requirement[] }) {
  const t = await getTranslations("logbook.currency");
  const value = (r: Requirement) =>
    r.key === "landings"
      ? t("req.count", { done: r.done, need: r.need })
      : r.key === "refresher"
        ? r.met
          ? t("req.done")
          : t("req.notYet")
        : t("req.time", { done: formatDuration(r.done), need: formatDuration(r.need) });
  return (
    <ul className="grid gap-2">
      {items.map((r) => (
        <li key={r.key} className="grid gap-1">
          <div className="flex items-center gap-2">
            {r.met ? (
              <CircleCheckIcon className="size-4 shrink-0 text-success" aria-hidden />
            ) : (
              <CircleIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span className="flex-1">{t(`req.${r.key}` as "req.hours")}</span>
            <span className="tabular-nums">{value(r)}</span>
          </div>
          {r.key !== "refresher" && (
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label={t(`req.${r.key}` as "req.hours")}
              aria-valuemin={0}
              aria-valuemax={r.need}
              aria-valuenow={Math.min(r.done, r.need)}
            >
              <div
                className="h-full bg-primary"
                style={{ width: `${Math.min(100, (r.done / r.need) * 100)}%` }}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
