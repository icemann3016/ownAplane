import { getLocale, getTranslations } from "next-intl/server";

import { SERVICE_CATEGORIES } from "@/lib/airport-profile/catalog";
import type { AirportService } from "@/lib/db/schema";
import { intlLocale, type Locale } from "@/lib/i18n/config";

/**
 * An airfield's services and prices by kind (Zlati, 2026-10-13): the lighter aircraft first
 * within a kind. Shown to pilots, paid to the airfield, never through ownAplane.
 */
export async function ServiceList({
  services,
  currency,
  action,
}: {
  services: AirportService[];
  currency: string;
  action?: (service: AirportService, name: string) => React.ReactNode;
}) {
  const t = await getTranslations("airports.catalog");
  const ta = await getTranslations("aircraft");
  const locale = (await getLocale()) as Locale;
  const money = new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
  const number = new Intl.NumberFormat(intlLocale(locale));
  if (!services.length) return <p className="text-sm text-muted-foreground">{t("none")}</p>;

  const upTo = (s: AirportService) =>
    s.maxMtomKg ? t("upTo", { kg: number.format(s.maxMtomKg) }) : null;
  // The line's name: the fuel, the operator's own name, the weight band, or the kind itself.
  const name = (s: AirportService) =>
    s.fuelType
      ? ta(`fuelTypes.${s.fuelType}`)
      : (s.label ??
        (s.maxMtomKg ? t("upToTitle", { kg: number.format(s.maxMtomKg) }) : null) ??
        t(`categories.${s.category}`));

  return (
    <div className="grid gap-5">
      {SERVICE_CATEGORIES.map((category) => {
        const items = services.filter((s) => s.category === category);
        if (!items.length) return null;
        return (
          <section key={category} className="grid gap-1" aria-labelledby={`services-${category}`}>
            <h3 id={`services-${category}`} className="text-sm font-semibold">
              {t(`categories.${category}`)}
            </h3>
            <ul className="grid divide-y text-sm">
              {items.map((s) => {
                const title = name(s);
                const band = s.label || s.fuelType ? upTo(s) : null;
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <span className="grid min-w-0 gap-0.5">
                      <span>
                        {title}
                        {s.fuelType && s.label && (
                          <span className="text-muted-foreground"> · {s.label}</span>
                        )}
                        {band && <span className="text-muted-foreground"> · {band}</span>}
                      </span>
                      {s.note && <span className="text-muted-foreground">{s.note}</span>}
                    </span>
                    <span className="ml-auto font-medium">
                      {s.price === null
                        ? t("onRequest")
                        : t("priceLine", {
                            amount: money.format(s.price),
                            unit: t(`per.${s.unit}`),
                          })}
                    </span>
                    {action && <span className="flex gap-1">{action(s, title)}</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
