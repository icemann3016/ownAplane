import { CircleAlertIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice, formatUtc } from "@/lib/aircraft/format";
import type { CurrentPlan } from "@/lib/billing/plan";
import { PLANS } from "@/lib/billing/plans";
import type { Subscription } from "@/lib/db/schema";
import type { Locale } from "@/lib/i18n/config";
import { payNow, resumePlan } from "./actions";

type Usage = { listed: number; featured: number; aircraftLimit: number; featuredLimit: number };

/** The plan the user has now, where it comes from, what happens next and what they use. */
export async function CurrentPlanCard({
  current,
  sub,
  usage,
  ahead,
}: {
  current: CurrentPlan;
  sub: Subscription | null;
  usage: Usage;
  /** The plan in 7 days, for the warning before a limit shrinks (SUB-6). */
  ahead: CurrentPlan & { at: Date };
}) {
  const t = await getTranslations("billing");
  const locale = (await getLocale()) as Locale;
  const day = (d: Date) => formatUtc(d, locale, { dateOnly: true });
  const planName = (p: string) => t(`plans.${p}` as "plans.free");
  const intervalName = (i: string) => t(`interval.${i}` as "interval.month");
  const fromSub = current.source === "subscription" && sub;
  const shrinks = PLANS[ahead.plan].aircraft < usage.listed;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("account.current")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <p>
          <span className="text-xl font-semibold">{planName(current.plan)}</span>
          {fromSub && (
            <span className="text-muted-foreground"> · {intervalName(sub.interval)}</span>
          )}
        </p>
        <p className="text-muted-foreground">
          {t(`account.source.${current.source}`)}
          {current.until &&
            current.source !== "subscription" &&
            ` · ${t("account.until", { date: day(current.until) })}`}
        </p>
        {fromSub && sub.status === "active" && (
          <p>
            {sub.cancelAtPeriodEnd
              ? t("account.endsOn", { date: day(sub.currentPeriodEnd) })
              : sub.scheduledPlan
                ? t("account.scheduled", {
                    plan: planName(sub.scheduledPlan),
                    interval: intervalName(sub.scheduledInterval ?? sub.interval),
                    date: day(sub.currentPeriodEnd),
                  })
                : t("account.renews", {
                    date: day(sub.currentPeriodEnd),
                    price: formatPrice(sub.priceCents / 100, sub.currency, locale),
                  })}
          </p>
        )}
        {fromSub && sub.status === "active" && (sub.cancelAtPeriodEnd || sub.scheduledPlan) && (
          <form action={resumePlan}>
            <SubmitButton variant="outline" size="sm">
              {t("account.resume")}
            </SubmitButton>
          </form>
        )}
        {sub?.status === "past_due" && sub.graceUntil && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertDescription className="grid gap-2">
              <p>{t("account.pastDue", { date: day(sub.graceUntil) })}</p>
              <form action={payNow}>
                <SubmitButton size="sm">{t("account.payNow")}</SubmitButton>
              </form>
            </AlertDescription>
          </Alert>
        )}
        <ul className="grid gap-1">
          <li>{t("account.usage", { used: usage.listed, limit: usage.aircraftLimit })}</li>
          {usage.featuredLimit > 0 && (
            <li>
              {t("account.featuredUsage", { used: usage.featured, limit: usage.featuredLimit })}
            </li>
          )}
        </ul>
        {shrinks && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertDescription>
              {t("account.overLimit", {
                plan: planName(ahead.plan),
                date: day(ahead.at),
                limit: PLANS[ahead.plan].aircraft,
              })}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
