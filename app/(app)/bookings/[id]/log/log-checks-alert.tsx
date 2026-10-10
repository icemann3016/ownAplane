import { FuelIcon, TriangleAlertIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatUtc } from "@/lib/aircraft/format";
import type { LogCheck } from "@/lib/domain/log-checks";
import { litresToVolume, type UnitSystem } from "@/lib/domain/units";
import type { Locale } from "@/lib/i18n/config";

type WrongFuel = Extract<LogCheck, { type: "wrongFuel" }>;

/** Fuel that doesn't suit the aircraft (BKG-13): shown to pilot and owner at the top. */
export async function WrongFuelAlert({ checks }: { checks: LogCheck[] }) {
  const wrong = checks.filter((c): c is WrongFuel => c.type === "wrongFuel");
  if (!wrong.length) return null;
  const t = await getTranslations("flightLog.wrongFuel");
  const ta = await getTranslations("aircraft.fuelTypes");
  const danger = wrong.some((c) => c.severity === "danger");
  return (
    <Alert variant={danger ? "destructive" : "default"}>
      <FuelIcon />
      <AlertDescription>
        <p className="font-medium">{t(danger ? "dangerTitle" : "cautionTitle")}</p>
        <ul className="list-disc pl-5">
          {wrong.map((c) => (
            <li key={`${c.airport}-${c.fuel}`}>
              {t(c.severity, {
                fuel: ta(c.fuel),
                airport: c.airport,
                expected: ta(c.expected),
              })}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

/** Meters, fuel burn and times that don't add up (BKG-7, BKG-12, BKG-13). */
export async function LogChecksAlert({ checks, units }: { checks: LogCheck[]; units: UnitSystem }) {
  const shown = checks.filter((c) => c.type !== "wrongFuel");
  if (!shown.length) return null;
  const t = await getTranslations("flightLog.checks");
  const tu = await getTranslations("flightLog.units");
  const locale = (await getLocale()) as Locale;
  const unit = tu(units === "metric" ? "l" : "usgal");
  const volume = (litres: number) => `${litresToVolume(litres, units)} ${unit}`;
  const rate = (lph: number) => t("perHour", { amount: volume(lph) });
  const text = (c: LogCheck) => {
    switch (c.type) {
      case "hobbsLong":
      case "tachLong":
        return t(c.type, { leg: c.seq, meter: c.meterH, engine: c.engineH });
      case "hobbsShort":
        return t(c.type, { leg: c.seq, meter: c.meterH, air: c.airH });
      case "fuelHigh":
      case "fuelLow":
        return t(c.type, {
          leg: c.seq,
          used: volume(c.usedL),
          hours: c.hours,
          rate: rate(c.lph),
          expected: rate(c.expectedLph),
        });
      case "early":
      case "late":
      case "intoNext":
        return t(c.type, {
          leg: c.seq,
          at: formatUtc(c.at, locale),
          limit: formatUtc(c.limit, locale),
        });
      default:
        return "";
    }
  };
  return (
    <Alert>
      <TriangleAlertIcon />
      <AlertDescription>
        <p className="font-medium">{t("title")}</p>
        <ul className="list-disc pl-5">
          {shown.map((c, i) => (
            <li key={`${c.type}-${i}`}>{text(c)}</li>
          ))}
        </ul>
        <p>{t("hint")}</p>
      </AlertDescription>
    </Alert>
  );
}
