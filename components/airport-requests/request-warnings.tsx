import { TriangleAlertIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import type { RequestWarning } from "@/lib/airport-requests/checks";

/** Warnings on a request (outside hours, closed, short notice, customs): never a block. */
export async function RequestWarnings({ warnings }: { warnings: RequestWarning[] }) {
  if (!warnings.length) return null;
  const t = await getTranslations("airportRequests.warnings");
  return (
    <ul className="grid gap-1 text-sm text-warning">
      {warnings.map((w, i) => (
        <li key={i} className="flex items-start gap-2">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {w.kind === "closed"
              ? t("closed", { at: t(`at.${w.at}`), note: w.note ?? "" })
              : w.kind === "outside_hours"
                ? t("outside_hours", { at: t(`at.${w.at}`) })
                : w.kind === "short_notice"
                  ? t("short_notice", { hours: w.hours })
                  : t("customs")}
          </span>
        </li>
      ))}
    </ul>
  );
}
