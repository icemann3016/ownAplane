import { getTranslations } from "next-intl/server";

import type { Aircraft } from "@/lib/db/schema";
import { kgToMass, litresToVolume, type UnitSystem } from "@/lib/domain/units";

/** Specifications and equipment of an aircraft (LST-1, LST-2), in the viewer's units. */
export async function Specs({ aircraft: a, units }: { aircraft: Aircraft; units: UnitSystem }) {
  const t = await getTranslations("aircraft");
  const imperial = units === "imperial";
  const capabilities = [
    t("public.vfr"),
    ...(a.nightVfr ? [t("fields.nightVfr")] : []),
    ...(a.ifr ? [t("fields.ifr")] : []),
    ...(a.autopilot ? [t("fields.autopilot")] : []),
  ];
  const rows: [string, string | null][] = [
    [t("fields.category"), t(`categories.${a.category}`)],
    [t("fields.typeDesignator"), a.typeDesignator],
    [t("fields.year"), a.year ? String(a.year) : null],
    [t("fields.seats"), String(a.seats)],
    [t("fields.engine"), a.engine],
    [t("fields.fuelType"), t(`fuelTypes.${a.fuelType}`)],
    [
      t("public.fuelBurn"),
      a.fuelBurnLph === null
        ? null
        : `${litresToVolume(a.fuelBurnLph, units)} ${imperial ? t("units.usgalPerHour") : t("units.litresPerHour")}`,
    ],
    [t("public.cruise"), a.cruiseKt ? `${a.cruiseKt} kt` : null],
    [
      t("public.usefulLoad"),
      a.usefulLoadKg === null
        ? null
        : `${kgToMass(a.usefulLoadKg, units)} ${imperial ? t("units.lb") : t("units.kg")}`,
    ],
    [
      t("public.mtom"),
      a.mtomKg === null
        ? null
        : `${kgToMass(a.mtomKg, units)} ${imperial ? t("units.lb") : t("units.kg")}`,
    ],
    [t("public.endurance"), a.enduranceH ? t("public.hours", { hours: a.enduranceH }) : null],
    [t("fields.avionics"), a.avionics],
    [t("fields.transponder"), t(`transponders.${a.transponder}`)],
    [t("fields.capabilities"), capabilities.join(", ")],
  ];

  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-semibold">{t("public.specs")}</h2>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {rows
          .filter((r): r is [string, string] => Boolean(r[1]))
          .map(([label, value]) => (
            <div key={label} className="grid gap-0.5 border-b pb-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium break-words">{value}</dd>
            </div>
          ))}
      </dl>
    </section>
  );
}
