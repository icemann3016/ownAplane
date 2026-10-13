import { getTranslations } from "next-intl/server";

import type { AirportFrequency, AirportRunway } from "@/lib/db/schema";

/** An airfield's runways: designator, size in metres, surface, lights (APT-1). */
export async function RunwayList({
  runways,
  action,
}: {
  runways: AirportRunway[];
  /** e.g. a remove button for managers. */
  action?: (runway: AirportRunway) => React.ReactNode;
}) {
  const t = await getTranslations("airports.runways");
  if (!runways.length) return <p className="text-sm text-muted-foreground">{t("noRunways")}</p>;
  return (
    <ul className="grid divide-y text-sm">
      {runways.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-3 py-2">
          <span className="w-20 font-mono font-medium">{r.designator}</span>
          <span className="text-muted-foreground">
            {[
              r.lengthM && r.widthM
                ? t("size", { length: r.lengthM, width: r.widthM })
                : r.lengthM
                  ? t("length", { length: r.lengthM })
                  : null,
              t(`surfaces.${r.surface}`),
              r.lighted ? t("lit") : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {action && <span className="ml-auto">{action(r)}</span>}
        </li>
      ))}
    </ul>
  );
}

/** An airfield's radio frequencies (APT-1). */
export async function FrequencyList({
  frequencies,
  action,
}: {
  frequencies: AirportFrequency[];
  action?: (frequency: AirportFrequency) => React.ReactNode;
}) {
  const t = await getTranslations("airports.runways");
  if (!frequencies.length) {
    return <p className="text-sm text-muted-foreground">{t("noFrequencies")}</p>;
  }
  return (
    <ul className="grid divide-y text-sm">
      {frequencies.map((f) => (
        <li key={f.id} className="flex flex-wrap items-center gap-3 py-2">
          <span className="w-20 font-medium">{f.type}</span>
          <span className="w-20 font-mono">{f.mhz.toFixed(3)}</span>
          {f.description && f.description !== f.type && (
            <span className="text-muted-foreground">{f.description}</span>
          )}
          {action && <span className="ml-auto">{action(f)}</span>}
        </li>
      ))}
    </ul>
  );
}
