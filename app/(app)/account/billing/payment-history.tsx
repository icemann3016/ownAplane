import { getLocale, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice, formatUtc } from "@/lib/aircraft/format";
import type { billingPayments } from "@/lib/db/schema";
import type { Locale } from "@/lib/i18n/config";

type Payment = typeof billingPayments.$inferSelect;

/** Payments and failed attempts, newest first; test payments say so. */
export async function PaymentHistory({ payments }: { payments: Payment[] }) {
  const t = await getTranslations("billing");
  const locale = (await getLocale()) as Locale;
  const describe = (p: Payment) => {
    const d = p.details;
    const plan = d.plan ? t(`plans.${d.plan}` as "plans.owner") : "";
    const interval = d.interval ? t(`interval.${d.interval}` as "interval.month") : "";
    return t(`account.history.${d.key}` as "account.history.subscribe", {
      plan,
      interval,
      credits: Number(d.credits ?? 0),
    });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("account.historyTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("account.historyEmpty")}</p>
        ) : (
          <ul className="grid gap-2 text-sm">
            {payments.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b pb-2"
              >
                <span>
                  <span className="block">{describe(p)}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatUtc(p.createdAt, locale)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {formatPrice(p.amountCents / 100, p.currency, locale)}
                  <Badge
                    variant={p.status === "paid" ? "secondary" : "outline"}
                    className={
                      p.status === "paid" ? undefined : "border-destructive/40 text-destructive"
                    }
                  >
                    {t(`account.status.${p.status}` as "account.status.paid")}
                  </Badge>
                  {p.provider === "test" && (
                    <Badge variant="outline">{t("account.testPayment")}</Badge>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
