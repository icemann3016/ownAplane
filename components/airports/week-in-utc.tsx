import { getLocale, getTranslations } from "next-intl/server";

import type { DayHours } from "@/lib/airport-profile/hours";
import { intlLocale, type Locale } from "@/lib/i18n/config";

/** An airfield's next days with their opening hours in UTC (APT-1). */
export async function WeekInUtc({ week }: { week: DayHours[] }) {
  const t = await getTranslations("airports.hours");
  const locale = (await getLocale()) as Locale;
  const date = new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const clock = new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  });
  return (
    <dl className="grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
      {week.map((d) => (
        <div key={d.day} className="contents">
          <dt className="font-medium">{date.format(new Date(`${d.day}T00:00:00Z`))}</dt>
          <dd className="mb-1 text-muted-foreground sm:mb-0">
            {d.ranges.length
              ? `${d.ranges.map((r) => `${clock.format(r.from)}–${clock.format(r.to)}`).join(", ")} UTC`
              : d.closure
                ? t("closedBecause", { note: d.closure.note ?? t("closed") })
                : t("closed")}
          </dd>
        </div>
      ))}
    </dl>
  );
}
