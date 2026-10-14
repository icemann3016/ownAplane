"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import {
  bandFor,
  defaultQuantity,
  estimate,
  type ServiceOption,
} from "@/lib/airport-requests/estimate";
import { intlLocale, type Locale } from "@/lib/i18n/config";

/** Units that are always one (no quantity to give). */
const FIXED = new Set(["landing", "once"]);

/**
 * The airfield's services to tick (Zlati, 2026-10-13): the price for this aircraft's weight,
 * a quantity that fits the trip, and a rough total. Submits `svc` (the line's id) and
 * `qty-<id>` for each ticked service.
 */
export function ServicePicker({
  options,
  mtomKg,
  trip,
  currency,
  arriving,
}: {
  options: ServiceOption[];
  mtomKg: number | null;
  trip: { arrivalAt: Date | null; departureAt: Date | null; pob: number };
  currency: string;
  arriving: boolean;
}) {
  const t = useTranslations("airportRequests.form");
  const tc = useTranslations("airports.catalog");
  const ta = useTranslations("aircraft");
  const locale = intlLocale(useLocale() as Locale);
  const money = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
  const number = new Intl.NumberFormat(locale);
  const [picked, setPicked] = useState<Record<string, { on?: boolean; qty?: string }>>({});

  const rows = options.map((o) => {
    const band = bandFor(o, mtomKg);
    const kind = tc(`categories.${o.category}`);
    const name = o.fuelType
      ? `${kind}: ${ta(`fuelTypes.${o.fuelType as "avgas_100ll"}`)}`
      : o.category === "other"
        ? (o.label ?? kind)
        : o.label
          ? `${kind}: ${o.label}`
          : kind;
    // Landing charges come with an arrival unless the pilot unticks them.
    const on = !!band && (picked[o.key]?.on ?? (o.category === "landing" && arriving));
    const fallback = band ? defaultQuantity(band.service.unit, trip) : null;
    const qty = picked[o.key]?.qty ?? (fallback === null ? "" : String(fallback));
    return { o, band, name, on, qty };
  });
  const chosen = rows.filter((r) => r.on && r.band);
  const total = estimate(
    chosen.map((r) => ({
      price: r.band!.service.price,
      quantity: FIXED.has(r.band!.service.unit) ? 1 : Number(r.qty.replace(",", ".")) || 0,
    })),
  );
  const set = (key: string, change: { on?: boolean; qty?: string }) =>
    setPicked((p) => ({ ...p, [key]: { ...p[key], ...change } }));

  if (!options.length) return <p className="text-sm text-muted-foreground">{t("noServices")}</p>;
  return (
    <div className="grid gap-3">
      <ul className="grid divide-y rounded-lg border">
        {rows.map(({ o, band, name, on, qty }) => {
          const id = `svc-${o.key.replace(/[^a-z0-9]/gi, "-")}`;
          const service = band?.service;
          const price = !service
            ? t("noPrice")
            : service.price === null
              ? tc("onRequest")
              : tc("priceLine", {
                  amount: money.format(service.price),
                  unit: tc(`per.${service.unit}`),
                });
          return (
            <li key={o.key} className="grid gap-2 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="flex items-start gap-3">
                <input
                  id={id}
                  type="checkbox"
                  checked={on}
                  disabled={!service}
                  onChange={(e) => set(o.key, { on: e.target.checked })}
                  className="mt-1 size-4 shrink-0 accent-primary"
                />
                <label htmlFor={id} className="grid gap-0.5 text-sm">
                  <span className="font-medium">{name}</span>
                  <span className="text-sm text-muted-foreground">
                    {price}
                    {service?.maxMtomKg
                      ? ` · ${tc("upTo", { kg: number.format(service.maxMtomKg) })}`
                      : ""}
                    {band && !band.exact ? ` · ${t("lightestBand")}` : ""}
                  </span>
                  {service?.note && (
                    <span className="text-sm text-muted-foreground">{service.note}</span>
                  )}
                </label>
              </div>
              {on && service && (
                <div className="flex items-center gap-2 pl-7 sm:pl-0">
                  <input type="hidden" name="svc" value={service.id} />
                  {!FIXED.has(service.unit) && (
                    <>
                      <Input
                        name={`qty-${service.id}`}
                        inputMode="decimal"
                        aria-label={t("quantityFor", { service: name })}
                        value={qty}
                        onChange={(e) => set(o.key, { qty: e.target.value })}
                        required
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">
                        {tc(`units.${service.unit}`)}
                      </span>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-sm" aria-live="polite">
        <span className="font-medium">{t("total", { amount: money.format(total.total) })}</span>
        {total.onRequest > 0 && (
          <span className="text-muted-foreground">
            {" "}
            {t("plusOnRequest", { count: total.onRequest })}
          </span>
        )}
        <span className="block text-muted-foreground">{t("totalText")}</span>
      </p>
    </div>
  );
}
