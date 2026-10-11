import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { BillingForm } from "@/components/admin/billing-form";
import { TextField } from "@/components/forms/text-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice, formatUtc } from "@/lib/aircraft/format";
import { billingOverview } from "@/lib/admin/billing";
import { requireAdmin } from "@/lib/auth/session";
import { readsThisMonth } from "@/lib/billing/credits";
import { betaActive, getBillingSettings } from "@/lib/billing/plan";
import { CURRENCY } from "@/lib/billing/plans";
import { isTestMode } from "@/lib/billing/provider";
import type { Locale } from "@/lib/i18n/config";
import { AdminHeader } from "../page-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.billing");
  return { title: t("title") };
}

/** Plans for admins: the beta switch, founding owners, subscriptions and payments (SUB-7, SUB-9). */
export default async function AdminBillingPage() {
  await requireAdmin("/admin/billing");
  const t = await getTranslations("admin.billing");
  const tb = await getTranslations("billing");
  const locale = (await getLocale()) as Locale;
  const [settings, overview, reads] = await Promise.all([
    getBillingSettings(),
    billingOverview(),
    readsThisMonth(),
  ]);
  const beta = betaActive(settings);
  const day = (d: Date) => formatUtc(d, locale, { dateOnly: true });
  const money = (cents: number) => formatPrice(cents / 100, CURRENCY, locale);

  return (
    <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 px-4 py-8">
      <AdminHeader
        title={t("title")}
        text={isTestMode() ? t("descriptionTest") : t("description")}
      />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("beta.title")}</CardTitle>
            <CardDescription>{t("beta.text")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <p className="font-medium">
              {!beta
                ? t("beta.off")
                : settings.betaEndsAt
                  ? t("beta.ending", { date: day(settings.betaEndsAt) })
                  : t("beta.on")}
            </p>
            {beta && !settings.betaEndsAt ? (
              <BillingForm
                op="beta"
                hidden={{ beta: "end" }}
                label={t("beta.end")}
                variant="destructive"
              />
            ) : (
              <BillingForm op="beta" hidden={{ beta: "on" }} label={t("beta.turnOn")} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("founding.title")}</CardTitle>
            <CardDescription>{t("founding.text")}</CardDescription>
          </CardHeader>
          <CardContent>
            <BillingForm
              op="cutoff"
              label={t("founding.save")}
              fields={
                <TextField
                  name="cutoff"
                  type="date"
                  label={t("founding.cutoff")}
                  hint={t("founding.cutoffHint")}
                  defaultValue={settings.foundingCutoff ?? ""}
                />
              }
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("subscriptions")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {overview.subs.length === 0 ? (
              <p className="text-muted-foreground">{t("none")}</p>
            ) : (
              <ul className="grid gap-1">
                {overview.subs.map((s) => (
                  <li key={`${s.plan}-${s.interval}-${s.status}`}>
                    {tb(`plans.${s.plan}`)} · {tb(`interval.${s.interval}`)} ·{" "}
                    {t(`status.${s.status}`)}: <span className="font-medium">{s.n}</span>
                  </li>
                ))}
              </ul>
            )}
            <ul className="mt-3 grid gap-1 text-muted-foreground">
              {overview.grants.map((g) => (
                <li key={g.reason}>{t(`grants.${g.reason}`, { count: g.n })}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("payments")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {overview.paid.length === 0 && <p className="text-muted-foreground">{t("none")}</p>}
            {overview.paid.map((p) => (
              <p key={p.kind}>
                {t(`paid.${p.kind as "plan" | "credits"}`, { count: p.n })}:{" "}
                <span className="font-medium">{money(p.cents ?? 0)}</span>
              </p>
            ))}
            <p className="text-muted-foreground">{t("reads", { count: reads })}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
