import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { IntervalSwitch } from "@/components/billing/interval-switch";
import { PlanCard } from "@/components/billing/plan-card";
import { SubmitButton } from "@/components/forms/submit-button";
import { formatPrice, formatUtc } from "@/lib/aircraft/format";
import type { CurrentPlan } from "@/lib/billing/plan";
import {
  changeKind,
  type Interval,
  type PaidPlan,
  PLAN_NAMES,
  type Plan,
} from "@/lib/billing/plans";
import { upgradeCharge } from "@/lib/billing/test-subscription";
import type { Subscription } from "@/lib/db/schema";
import type { Locale } from "@/lib/i18n/config";
import { choosePlan } from "./actions";

/** The three plans with what choosing each would do from where the user is now. */
export async function PlanChoices({
  current,
  sub,
  interval,
}: {
  current: CurrentPlan;
  sub: Subscription | null;
  interval: Interval;
}) {
  const t = await getTranslations("billing.account");
  const locale = (await getLocale()) as Locale;
  const day = (d: Date) => formatUtc(d, locale, { dateOnly: true });
  const tPlans = await getTranslations("billing.plans");

  async function action(plan: Plan) {
    const form = (label: string, variant: "default" | "outline" = "default") => (
      <form action={choosePlan}>
        <input type="hidden" name="plan" value={plan} />
        <input type="hidden" name="interval" value={interval} />
        <SubmitButton variant={variant} className="h-auto min-h-9 w-full py-2 whitespace-normal">
          {label}
        </SubmitButton>
      </form>
    );
    if (!sub) {
      if (plan === "free") return null;
      return form(t("subscribe", { plan: tPlans(plan) }));
    }
    if (sub.status === "past_due") return <p className="text-sm">{t("payFirst")}</p>;
    if (plan === "free") {
      return sub.cancelAtPeriodEnd ? (
        <p className="text-sm text-muted-foreground">
          {t("freeFrom", { date: day(sub.currentPeriodEnd) })}
        </p>
      ) : (
        form(t("cancel"), "outline")
      );
    }
    const from = { plan: sub.plan as PaidPlan, interval: sub.interval };
    const to = { plan: plan as PaidPlan, interval };
    const kind = changeKind(from, to);
    if (kind === "same") return null;
    if (kind === "downgrade") {
      return form(
        t("downgrade", { plan: tPlans(plan), date: day(sub.currentPeriodEnd) }),
        "outline",
      );
    }
    const price = formatPrice(upgradeCharge(sub, to) / 100, sub.currency, locale);
    return form(
      from.plan === to.plan
        ? t("switchYearly", { price })
        : t("upgrade", { plan: tPlans(plan), price }),
    );
  }

  const isCurrent = (plan: Plan) =>
    sub ? sub.plan === plan && sub.interval === interval : current.plan === plan;

  return (
    <section id="plans" aria-labelledby="plans-title" className="grid scroll-mt-20 gap-4">
      <h2 id="plans-title" className="text-lg font-semibold">
        {t("change")}
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <IntervalSwitch interval={interval} path="/account/billing" />
        <Link
          href="/pricing#compare"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          {t("compare")}
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {await Promise.all(
          PLAN_NAMES.map(async (plan) => (
            <PlanCard key={plan} plan={plan} interval={interval} current={isCurrent(plan)}>
              {await action(plan)}
            </PlanCard>
          )),
        )}
      </div>
    </section>
  );
}
