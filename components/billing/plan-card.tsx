import type { ReactNode } from "react";
import { CheckIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatPrice } from "@/lib/aircraft/format";
import { CURRENCY, type Interval, type Plan, PRICES } from "@/lib/billing/plans";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

/** "€9 / month" or "€0" for a plan, incl. VAT. */
export async function planPrice(plan: Plan, interval: Interval): Promise<string> {
  const t = await getTranslations("billing.price");
  const locale = (await getLocale()) as Locale;
  if (plan === "free") return formatPrice(0, CURRENCY, locale);
  const price = formatPrice(PRICES[plan][interval] / 100, CURRENCY, locale);
  return interval === "year" ? t("perYear", { price }) : t("perMonth", { price });
}

const HIGHLIGHTS = ["h1", "h2", "h3", "h4"] as const;

/** A plan with its price and what stands out; `children` is the action (button or note). */
export async function PlanCard({
  plan,
  interval,
  current = false,
  children,
}: {
  plan: Plan;
  interval: Interval;
  current?: boolean;
  children?: ReactNode;
}) {
  const t = await getTranslations("billing");
  return (
    <Card className={cn("flex flex-col", current && "border-primary")}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle as="h3">{t(`plans.${plan}`)}</CardTitle>
          {current && <Badge>{t("pricing.current")}</Badge>}
        </div>
        <CardDescription>{t(`plans.tagline.${plan}`)}</CardDescription>
        <p className="pt-2">
          <span className="text-2xl font-semibold">{await planPrice(plan, interval)}</span>{" "}
          <span className="text-xs whitespace-nowrap text-muted-foreground">{t("price.vat")}</span>
        </p>
        {plan !== "free" && interval === "month" && (
          <p className="text-xs text-muted-foreground">
            {t("price.orYearly", { price: await planPrice(plan, "year") })}
          </p>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        <ul className="grid gap-2 text-sm">
          {HIGHLIGHTS.map((h) => (
            <li key={h} className="flex gap-2">
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>{t(`highlights.${plan}.${h}`)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      {children && <CardFooter className="grid gap-2">{children}</CardFooter>}
    </Card>
  );
}
