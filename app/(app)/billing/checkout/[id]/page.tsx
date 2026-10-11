import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FlaskConicalIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice } from "@/lib/aircraft/format";
import { requireUser } from "@/lib/auth/session";
import { getCheckout } from "@/lib/billing/checkout";
import { CREDIT_PACKS, type CreditPack } from "@/lib/billing/plans";
import type { Locale } from "@/lib/i18n/config";
import { finishCheckout } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("billing.checkout");
  return { title: t("title") };
}

/**
 * Test-mode checkout: stands in for the payment provider's page. The user picks what the
 * "payment" does; no card is asked for and no money moves.
 */
export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/billing/checkout/${id}`);
  const checkout = /^[0-9a-f-]{36}$/.test(id) ? await getCheckout(user.id, id) : null;
  if (!checkout || checkout.provider !== "test") notFound();
  const t = await getTranslations("billing");
  const locale = (await getLocale()) as Locale;
  const item = checkout.item;
  const what =
    item.type === "plan"
      ? t("checkout.plan", {
          plan: t(`plans.${item.plan}`),
          interval: t(`interval.${item.interval}`),
        })
      : t("checkout.credits", { credits: CREDIT_PACKS[item.pack as CreditPack]?.credits ?? 0 });
  const open = checkout.status === "open";

  return (
    <div className="mx-auto grid w-full max-w-lg gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{t("checkout.title")}</h1>
      <Alert>
        <FlaskConicalIcon />
        <AlertDescription>{t("checkout.testMode")}</AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle as="h2">{what}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm">
          <p className="flex justify-between gap-2">
            <span>{t("checkout.total")}</span>
            <span className="font-semibold">
              {formatPrice(checkout.amountCents / 100, checkout.currency, locale)}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">{t("price.vat")}</p>
          {item.type === "plan" && (
            <p className="pt-2 text-muted-foreground">{t("checkout.renews")}</p>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          {open ? (
            <form action={finishCheckout} className="flex flex-wrap gap-2">
              <input type="hidden" name="id" value={checkout.id} />
              <SubmitButton name="outcome" value="paid">
                {t("checkout.pay")}
              </SubmitButton>
              <SubmitButton name="outcome" value="failed" variant="outline">
                {t("checkout.fail")}
              </SubmitButton>
              <SubmitButton name="outcome" value="canceled" variant="ghost">
                {t("checkout.cancel")}
              </SubmitButton>
            </form>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{t("checkout.closed")}</p>
              <Button asChild variant="outline">
                <Link href="/account/billing">{t("checkout.back")}</Link>
              </Button>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
