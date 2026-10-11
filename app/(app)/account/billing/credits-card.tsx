import { SparklesIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice } from "@/lib/aircraft/format";
import type { CreditStatus } from "@/lib/billing/credits";
import { CREDIT_PACKS, CURRENCY } from "@/lib/billing/plans";
import type { Locale } from "@/lib/i18n/config";
import { buyCredits } from "./actions";

/** AI reading credits: what is left this month and in credits, and packs to buy. */
export async function CreditsCard({ credits, beta }: { credits: CreditStatus; beta: boolean }) {
  const t = await getTranslations("billing.account");
  const locale = (await getLocale()) as Locale;
  const { allowance } = credits;
  return (
    <Card id="credits" className="scroll-mt-20">
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <SparklesIcon className="size-5 text-primary" aria-hidden />
          {t("creditsTitle")}
        </CardTitle>
        <CardDescription>{t("creditsText")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <p className="text-xl font-semibold">
          {t("creditsAvailable", { count: credits.available })}
        </p>
        <ul className="grid gap-1 text-muted-foreground">
          {allowance.perMonth > 0 ? (
            <li>{t("allowance", { left: allowance.left, perMonth: allowance.perMonth })}</li>
          ) : (
            <li>{beta ? t("allowanceBeta") : t("allowanceNone")}</li>
          )}
          <li>{t("creditsBalance", { count: credits.balance })}</li>
        </ul>
        <div className="flex flex-wrap gap-2">
          {Object.entries(CREDIT_PACKS).map(([pack, p]) => (
            <form key={pack} action={buyCredits}>
              <input type="hidden" name="pack" value={pack} />
              <SubmitButton variant="outline">
                {t("buy", {
                  credits: p.credits,
                  price: formatPrice(p.priceCents / 100, CURRENCY, locale),
                })}
              </SubmitButton>
            </form>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
