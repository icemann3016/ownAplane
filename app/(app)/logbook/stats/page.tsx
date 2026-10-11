import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { PlusGate } from "@/components/billing/plus-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice } from "@/lib/aircraft/format";
import { requireUser } from "@/lib/auth/session";
import { getMyPlan } from "@/lib/billing/plan";
import { PLANS } from "@/lib/billing/plans";
import { intlLocale, type Locale } from "@/lib/i18n/config";
import { formatDuration } from "@/lib/logbook/duration";
import { getFlyingStats } from "@/lib/logbook/stats";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("logbook.stats");
  return { title: t("title") };
}

/** Flying statistics from the logbook and rentals (Pilot Plus). */
export default async function StatsPage() {
  const user = await requireUser("/logbook/stats");
  const t = await getTranslations("logbook.stats");
  const back = await getTranslations("logbook.detail");
  const { plan } = await getMyPlan(user.id);
  const header = (
    <Link href="/logbook" className="text-sm underline-offset-4 hover:underline">
      ← {back("back")}
    </Link>
  );
  if (!PLANS[plan].logbookExtras) {
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8">
        {header}
        <PlusGate title={t("title")} text={t("description")} />
      </div>
    );
  }
  const s = await getFlyingStats(user.id);
  const locale = (await getLocale()) as Locale;
  const monthName = new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
  const most = Math.max(60, ...s.months.map((m) => m.minutes));
  const fn = s.functions;

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8">
      {header}
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("months")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-1.5 text-sm">
            {s.months.map((m) => (
              <li key={m.month} className="grid grid-cols-[4.5rem_1fr_7rem] items-center gap-2">
                <span className="text-muted-foreground">
                  {monthName.format(new Date(`${m.month}-01T00:00:00Z`))}
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span
                    className="block h-full bg-primary"
                    style={{ width: `${(m.minutes / most) * 100}%` }}
                  />
                </span>
                <span className="text-right tabular-nums">
                  {t("monthValue", { time: formatDuration(m.minutes), landings: m.landings })}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("types")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {s.types.length === 0 ? (
              <p className="text-muted-foreground">{t("none")}</p>
            ) : (
              <ul className="grid gap-1">
                {s.types.map((x) => (
                  <li key={x.aircraftType} className="flex justify-between gap-2">
                    <span className="font-mono">{x.aircraftType}</span>
                    <span className="tabular-nums">{formatDuration(x.minutes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("functions")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <dl className="grid grid-cols-2 gap-1">
              {(["pic", "dual", "instructor", "copilot"] as const).map((k) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{t(`function.${k}`)}</dt>
                  <dd className="text-right tabular-nums">{formatDuration(fn[k])}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("rentals")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm">
          {s.rentals.length === 0 ? (
            <p className="text-muted-foreground">{t("noRentals")}</p>
          ) : (
            s.rentals.map((r) => (
              <p key={r.currency}>
                {t("rentalsValue", {
                  count: r.count,
                  time: formatDuration(r.minutes),
                  due: formatPrice(r.due, r.currency, locale),
                })}
              </p>
            ))
          )}
          <p className="text-xs text-muted-foreground">{t("rentalsNote")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
