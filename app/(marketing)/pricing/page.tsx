import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConicalIcon, SparklesIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { IntervalSwitch, intervalFrom } from "@/components/billing/interval-switch";
import { PlanCard } from "@/components/billing/plan-card";
import { PlanTable } from "@/components/billing/plan-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice } from "@/lib/aircraft/format";
import { betaActive, getBillingSettings } from "@/lib/billing/plan";
import { CREDIT_PACKS, CURRENCY, PLAN_NAMES, WELCOME_CREDITS } from "@/lib/billing/plans";
import { isTestMode } from "@/lib/billing/provider";
import type { Locale } from "@/lib/i18n/config";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("billing.pricing");
  return { title: t("title"), description: t("description") };
}

/** Public pricing (SUB-5): the plans side by side, AI credits, prices incl. VAT. */
export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ interval?: string | string[] }>;
}) {
  const t = await getTranslations("billing");
  const locale = (await getLocale()) as Locale;
  const interval = intervalFrom((await searchParams).interval);
  const beta = betaActive(await getBillingSettings());

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10">
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("pricing.title")}</h1>
        <p className="max-w-2xl text-muted-foreground">{t("pricing.lead")}</p>
      </div>
      {(beta || isTestMode()) && (
        <Alert>
          <FlaskConicalIcon />
          <AlertDescription>
            {beta && <p>{t("pricing.beta")}</p>}
            {isTestMode() && <p>{t("pricing.testMode")}</p>}
          </AlertDescription>
        </Alert>
      )}
      <IntervalSwitch interval={interval} path="/pricing" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_NAMES.map((plan) => (
          <PlanCard key={plan} plan={plan} interval={interval}>
            <Button asChild variant={plan === "owner" ? "default" : "outline"}>
              <Link
                href={plan === "free" ? "/signup" : `/account/billing?interval=${interval}#plans`}
              >
                {plan === "free"
                  ? t("pricing.start")
                  : t("pricing.choose", { plan: t(`plans.${plan}`) })}
              </Link>
            </Button>
          </PlanCard>
        ))}
      </div>

      <section id="compare" aria-labelledby="compare-title" className="grid scroll-mt-20 gap-3">
        <h2 id="compare-title" className="text-lg font-semibold">
          {t("pricing.compareTitle")}
        </h2>
        <PlanTable />
      </section>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="flex items-center gap-2">
            <SparklesIcon className="size-5 text-primary" aria-hidden />
            {t("pricing.creditsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p>{t("pricing.creditsText", { welcome: WELCOME_CREDITS })}</p>
          <ul className="flex flex-wrap gap-3">
            {Object.values(CREDIT_PACKS).map((p) => (
              <li key={p.credits} className="rounded-md border px-3 py-2">
                <span className="font-medium">{t("pricing.pack", { credits: p.credits })}</span>
                {" · "}
                {formatPrice(p.priceCents / 100, CURRENCY, locale)}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <section aria-labelledby="notes" className="grid gap-2">
        <h2 id="notes" className="text-lg font-semibold">
          {t("pricing.notesTitle")}
        </h2>
        <ul className="grid list-disc gap-1 pl-5 text-sm text-muted-foreground">
          <li>{t("pricing.notes.pilots")}</li>
          <li>{t("pricing.notes.safety")}</li>
          <li>{t("pricing.notes.vat")}</li>
          <li>{t("pricing.notes.cancel")}</li>
          <li>{t("pricing.notes.data")}</li>
        </ul>
      </section>
    </div>
  );
}
