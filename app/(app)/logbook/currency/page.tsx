import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { PlusGate } from "@/components/billing/plus-gate";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getMyPlan } from "@/lib/billing/plan";
import { PLANS } from "@/lib/billing/plans";
import { intlLocale, type Locale } from "@/lib/i18n/config";
import { getCurrency } from "@/lib/logbook/currency-data";
import { Requirements } from "./requirements";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("logbook.currency");
  return { title: t("title") };
}

/** Currency from the logbook (Pilot Plus): passengers, night, SEP revalidation, LAPL recency. */
export default async function CurrencyPage() {
  const user = await requireUser("/logbook/currency");
  const t = await getTranslations("logbook.currency");
  const back = await getTranslations("logbook.detail");
  const { plan } = await getMyPlan(user.id);
  const header = (
    <Link href="/logbook" className="text-sm underline-offset-4 hover:underline">
      ← {back("back")}
    </Link>
  );
  if (!PLANS[plan].currencyTracker) {
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8">
        {header}
        <PlusGate title={t("title")} text={t("description")} />
      </div>
    );
  }
  const c = await getCurrency(user.id);
  const locale = (await getLocale()) as Locale;
  const day = (d: string) =>
    new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeZone: "UTC" }).format(
      new Date(`${d}T00:00:00Z`),
    );
  const recency = (r: typeof c.passengers.day, need: number) =>
    r.current
      ? t("currentUntil", { date: day(r.until!) })
      : t("notCurrent", { count: r.count, need });

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8">
      {header}
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
        {c.drafts > 0 && <p className="text-sm">{t("drafts", { count: c.drafts })}</p>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("passengers.title")}</CardTitle>
          <CardDescription>{t("passengers.text")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p>
            <span className="font-medium">{t("passengers.day")}</span>{" "}
            {recency(c.passengers.day, 3)}
          </p>
          <p>
            <span className="font-medium">{t("passengers.night")}</span>{" "}
            {recency(c.passengers.night, 1)}
          </p>
          {c.hasIr && <p className="text-muted-foreground">{t("passengers.ir")}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("sep.title")}</CardTitle>
          <CardDescription>
            {c.sepExpiry
              ? t("sep.window", { from: day(c.sep.from), to: day(c.sep.to) })
              : t("sep.noExpiry")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {c.sep.expired ? (
            <p className="text-destructive">{t("sep.expired", { date: day(c.sep.to) })}</p>
          ) : (
            <>
              <Requirements items={c.sep.requirements} />
              <p className={c.sep.met ? "text-success" : "text-muted-foreground"}>
                {c.sep.met ? t("sep.met") : t("sep.notMet")}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {c.lapl && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("lapl.title")}</CardTitle>
            <CardDescription>
              {t("lapl.window", { from: day(c.lapl.from), to: day(c.lapl.to) })}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <Requirements items={c.lapl.requirements} />
            <p className={c.lapl.met ? "text-success" : "text-destructive"}>
              {c.lapl.met ? t("lapl.met") : t("lapl.notMet")}
            </p>
          </CardContent>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">{t("disclaimer")}</p>
    </div>
  );
}
