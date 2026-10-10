import { GaugeIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatSpan, formatUtc } from "@/lib/aircraft/format";
import type { MeterCheck } from "@/lib/bookings/meter-gap";
import type { Locale } from "@/lib/i18n/config";
import { MeterGapForm } from "./meter-gap-form";

/**
 * Meters against the last known readings (BKG-7). The pilot sees only a start below the last
 * reading (a typo); the owner also sees flying in between, what the calendar shows then, and
 * explains it.
 */
export async function MeterGapAlert({
  check,
  role,
  bookingId,
  logId,
}: {
  check: MeterCheck;
  role: "pilot" | "owner";
  bookingId: string;
  logId: string;
}) {
  if (!check.findings.length) return null;
  const t = await getTranslations("flightLog.meters");
  const tk = await getTranslations("aircraft.calendar");
  const locale = (await getLocale()) as Locale;
  const explained = check.reason !== null;
  const hasGap = check.findings.some((f) => f.type === "gap");
  return (
    <Alert variant={!explained && !hasGap ? "destructive" : "default"}>
      <GaugeIcon />
      <AlertDescription>
        <p className="font-medium">{t("title")}</p>
        <ul className="list-disc pl-5">
          {check.findings.map((f) => (
            <li key={f.meter}>
              {t(f.type, {
                meter: t(`names.${f.meter}`),
                start: f.start,
                known: f.known,
                diff: Math.abs(f.diff),
                since: t(`sources.${f.source}`, { at: formatUtc(f.knownAt, locale) }),
              })}
            </li>
          ))}
        </ul>
        {role === "owner" && hasGap && (
          <>
            {check.between.length ? (
              <>
                <p>{t("between")}</p>
                <ul className="list-disc pl-5">
                  {check.between.map((e) => (
                    <li key={`${e.kind}-${e.from.toISOString()}`}>
                      {tk(`kinds.${e.kind}`)}, {formatSpan(e.from, e.to, locale)}
                      {e.source ? ` (${tk("fromSource", { name: e.source })})` : ""}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>{t("nothingBetween")}</p>
            )}
          </>
        )}
        {role === "owner" ? (
          <>
            {explained && <p>{t("explained", { reason: t(`reasons.${check.reason!}`) })}</p>}
            <p>{t("ownerHint")}</p>
            <MeterGapForm bookingId={bookingId} logId={logId} reason={check.reason} />
          </>
        ) : (
          <p>{t("pilotHint")}</p>
        )}
      </AlertDescription>
    </Alert>
  );
}
