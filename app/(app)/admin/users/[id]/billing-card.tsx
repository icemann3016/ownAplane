import { getLocale, getTranslations } from "next-intl/server";

import { BillingForm } from "@/components/admin/billing-form";
import { SelectField, TextField } from "@/components/forms/text-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUtc } from "@/lib/aircraft/format";
import { memberBilling } from "@/lib/admin/billing";
import type { Locale } from "@/lib/i18n/config";

/** A member's plan and AI credits; admins give a plan or credits (SUB-7), logged. */
export async function BillingCard({ userId }: { userId: string }) {
  const t = await getTranslations("admin.billing");
  const tb = await getTranslations("billing");
  const locale = (await getLocale()) as Locale;
  const day = (d: Date) => formatUtc(d, locale, { dateOnly: true });
  const b = await memberBilling(userId);
  const plans = [
    { value: "owner", label: tb("plans.owner") },
    { value: "fleet", label: tb("plans.fleet") },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("memberTitle")}</CardTitle>
        <CardDescription>{t("memberText")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        <ul className="grid gap-1">
          <li>
            <span className="font-medium">{tb(`plans.${b.plan.plan}`)}</span> ·{" "}
            {tb(`account.source.${b.plan.source}`)}
            {b.plan.until && ` · ${tb("account.until", { date: day(b.plan.until) })}`}
          </li>
          {b.subscription && (
            <li className="text-muted-foreground">
              {t("subscription", {
                plan: tb(`plans.${b.subscription.plan}`),
                interval: tb(`interval.${b.subscription.interval}`),
                status: t(`status.${b.subscription.status}`),
                date: day(b.subscription.currentPeriodEnd),
              })}
            </li>
          )}
          <li className="text-muted-foreground">
            {t("credits", { available: b.credits.available, balance: b.credits.balance })}
          </li>
        </ul>
        {b.grants.length > 0 && (
          <ul className="grid gap-2">
            {b.grants.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {t(`grant.${g.reason}`, { plan: tb(`plans.${g.plan}`) })}
                  {g.endsAt ? ` · ${tb("account.until", { date: day(g.endsAt) })}` : ""}
                  {g.note && <span className="text-muted-foreground"> · {g.note}</span>}
                </span>
                <BillingForm
                  op="revoke"
                  hidden={{ grantId: g.id }}
                  label={t("revoke")}
                  variant="outline"
                />
              </li>
            ))}
          </ul>
        )}
        <BillingForm
          op="grant"
          hidden={{ userId }}
          label={t("grantButton")}
          fields={
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField name="plan" id={`plan-${userId}`} label={t("plan")} options={plans} />
              <TextField
                name="endsOn"
                id={`ends-${userId}`}
                type="date"
                label={t("endsOn")}
                hint={t("endsOnHint")}
              />
              <TextField
                name="note"
                id={`note-${userId}`}
                label={t("note")}
                maxLength={500}
                className="sm:col-span-2"
              />
            </div>
          }
        />
        <BillingForm
          op="credits"
          hidden={{ userId }}
          label={t("creditsButton")}
          variant="outline"
          fields={
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                name="credits"
                id={`credits-${userId}`}
                type="number"
                min={1}
                max={10000}
                defaultValue="20"
                label={t("creditsAmount")}
              />
              <TextField name="note" id={`cnote-${userId}`} label={t("note")} maxLength={500} />
            </div>
          }
        />
      </CardContent>
    </Card>
  );
}
