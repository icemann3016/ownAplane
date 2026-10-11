import type { Metadata } from "next";
import { CircleCheckIcon, CircleAlertIcon, FlaskConicalIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { AccountTabs } from "@/components/account/account-tabs";
import { intervalFrom } from "@/components/billing/interval-switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireUser } from "@/lib/auth/session";
import { creditStatus } from "@/lib/billing/credits";
import {
  betaActive,
  getBillingSettings,
  getMyPlan,
  planInAWeek,
  planUsage,
} from "@/lib/billing/plan";
import { isTestMode } from "@/lib/billing/provider";
import { getSubscription, paymentHistory } from "@/lib/billing/subscriptions";
import { CreditsCard } from "./credits-card";
import { CurrentPlanCard } from "./current-plan";
import { PaymentHistory } from "./payment-history";
import { PlanChoices } from "./plan-choices";
import { TestControls } from "./test-controls";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("billing.account");
  return { title: t("title") };
}

const DONE = new Set([
  "checkout_paid",
  "checkout_failed",
  "checkout_canceled",
  "upgraded",
  "scheduled",
  "canceled",
  "kept",
  "renewed",
  "ended",
  "payment_failed",
  "past_due",
  "no_subscription",
  "fail_next_on",
  "fail_next_off",
  "already_subscribed",
  "not_available",
  "unknown_item",
  "failed",
]);
const BAD = new Set(["checkout_failed", "payment_failed", "past_due", "failed", "not_available"]);

/** Account → Plan & billing (SUB-4): the plan, changing it, AI credits and payments. */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; interval?: string }>;
}) {
  const user = await requireUser("/account/billing");
  const t = await getTranslations("billing.account");
  const params = await searchParams;
  const done = params.done && DONE.has(params.done) ? params.done : null;

  const [current, sub, settings, credits, payments] = await Promise.all([
    getMyPlan(user.id),
    getSubscription(user.id),
    getBillingSettings(),
    creditStatus(user.id),
    paymentHistory(user.id),
  ]);
  const [usage, ahead] = await Promise.all([
    planUsage(user.id, current.plan),
    planInAWeek(user.id, current),
  ]);
  const interval = params.interval ? intervalFrom(params.interval) : (sub?.interval ?? "month");

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-10">
      <AccountTabs />
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      {done && (
        <Alert variant={BAD.has(done) ? "destructive" : "success"} role="status">
          {BAD.has(done) ? <CircleAlertIcon /> : <CircleCheckIcon />}
          <AlertDescription>{t(`done.${done}` as "done.kept")}</AlertDescription>
        </Alert>
      )}
      {isTestMode() && (
        <Alert>
          <FlaskConicalIcon />
          <AlertDescription>{t("testMode")}</AlertDescription>
        </Alert>
      )}
      <CurrentPlanCard current={current} sub={sub} usage={usage} ahead={ahead} />
      <PlanChoices current={current} sub={sub} interval={interval} />
      <CreditsCard credits={credits} beta={betaActive(settings)} />
      {isTestMode() && sub && <TestControls sub={sub} />}
      <PaymentHistory payments={payments} />
    </div>
  );
}
