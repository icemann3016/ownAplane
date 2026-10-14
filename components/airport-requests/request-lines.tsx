import { getLocale, getTranslations } from "next-intl/server";

import { estimate } from "@/lib/airport-requests/estimate";
import type { AirportRequestItem } from "@/lib/db/schema";
import { intlLocale, type Locale } from "@/lib/i18n/config";

/**
 * The services asked for, with the airfield's prices when the request was sent and a rough
 * total (APT-3). Paid to the airfield, never through ownAplane.
 */
export async function RequestLines({
  items,
  currency,
}: {
  items: AirportRequestItem[];
  currency: string;
}) {
  const t = await getTranslations("airportRequests.detail");
  const tc = await getTranslations("airports.catalog");
  const ta = await getTranslations("aircraft");
  const locale = intlLocale((await getLocale()) as Locale);
  const money = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
  const number = new Intl.NumberFormat(locale);
  if (!items.length) return <p className="text-sm text-muted-foreground">{t("noServices")}</p>;
  const total = estimate(items);
  return (
    <div className="grid gap-2">
      <ul className="grid divide-y text-sm">
        {items.map((i) => {
          const kind = tc(`categories.${i.category}`);
          const name = i.fuelType
            ? `${kind}: ${ta(`fuelTypes.${i.fuelType}`)}`
            : i.category === "other"
              ? (i.label ?? kind)
              : i.label
                ? `${kind}: ${i.label}`
                : kind;
          return (
            <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="grid gap-0.5">
                <span className="font-medium">{name}</span>
                <span className="text-muted-foreground">
                  {number.format(i.quantity)} {tc(`units.${i.unit}`).toLowerCase()}
                  {i.price !== null &&
                    ` × ${tc("priceLine", { amount: money.format(i.price), unit: tc(`per.${i.unit}`) })}`}
                </span>
              </span>
              <span className="ml-auto font-medium">
                {i.price === null ? tc("onRequest") : money.format(i.price * i.quantity)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="flex flex-wrap justify-between gap-2 border-t pt-2 text-sm">
        <span>{t("total")}</span>
        <span className="font-semibold">
          {money.format(total.total)}
          {total.onRequest > 0 && (
            <span className="font-normal text-muted-foreground">
              {" "}
              {t("plusOnRequest", { count: total.onRequest })}
            </span>
          )}
        </span>
      </p>
      <p className="text-xs text-muted-foreground">{t("totalText")}</p>
    </div>
  );
}
