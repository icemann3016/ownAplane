import { getLocale, getTranslations } from "next-intl/server";

import type { AirportFee } from "@/lib/db/schema";
import { intlLocale, type Locale } from "@/lib/i18n/config";

/** An airfield's fees by kind, the lighter aircraft first (APT-1). Shown only, never charged. */
export async function FeeList({
  fees,
  currency,
  action,
}: {
  fees: AirportFee[];
  currency: string;
  action?: (fee: AirportFee) => React.ReactNode;
}) {
  const t = await getTranslations("airports.fees");
  const locale = (await getLocale()) as Locale;
  const money = new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency });
  const number = new Intl.NumberFormat(intlLocale(locale));
  if (!fees.length) return <p className="text-sm text-muted-foreground">{t("none")}</p>;
  return (
    <ul className="grid divide-y text-sm">
      {fees.map((f) => (
        <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
          <span className="grid gap-0.5">
            <span className="font-medium">
              {f.label ?? t(`kinds.${f.kind}`)}
              {f.maxMtomKg ? (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {t("upTo", { kg: number.format(f.maxMtomKg) })}
                </span>
              ) : null}
            </span>
            {f.label && <span className="text-muted-foreground">{t(`kinds.${f.kind}`)}</span>}
          </span>
          <span className="ml-auto font-medium">
            {t("price", { amount: money.format(f.amount), unit: t(`per.${f.unit}`) })}
          </span>
          {action && <span>{action(f)}</span>}
        </li>
      ))}
    </ul>
  );
}
