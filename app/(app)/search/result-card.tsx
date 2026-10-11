import Link from "next/link";
import { MapPinIcon, PlaneIcon, StarIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatPrice } from "@/lib/aircraft/format";
import type { SearchResult } from "@/lib/aircraft/search";
import type { Locale } from "@/lib/i18n/config";

/** One search result: photo, model, registration, home base, price, rating, distance (SRC-3). */
export async function ResultCard({ result: r, query }: { result: SearchResult; query: string }) {
  const t = await getTranslations("search");
  const ta = await getTranslations("aircraft");
  const locale = (await getLocale()) as Locale;
  const href = `/aircraft/${r.id}${query ? `?${query}` : ""}`;

  return (
    <Card className="relative overflow-hidden py-0 transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md">
      <div className="flex flex-col sm:flex-row">
        <div className="shrink-0 bg-muted sm:w-56">
          {r.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- storage URLs vary by provider
            <img
              src={r.coverUrl}
              alt=""
              className="aspect-[4/3] size-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center text-muted-foreground">
              <PlaneIcon className="size-8" aria-hidden />
            </div>
          )}
        </div>
        <div className="grid flex-1 content-start gap-1.5 p-4">
          {r.featured && (
            <Badge variant="secondary" className="justify-self-start">
              {t("featured")}
            </Badge>
          )}
          <h2 className="text-lg font-semibold">
            <Link href={href} className="after:absolute after:inset-0 focus-visible:outline-none">
              {r.manufacturer} {r.model}
            </Link>
          </h2>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{r.registration}</span> · {ta(`categories.${r.category}`)} ·{" "}
            {t("seatsCount", { count: r.seats })}
          </p>
          <p className="inline-flex items-center gap-1 text-sm">
            <MapPinIcon className="size-3.5 shrink-0" aria-hidden />
            {r.airportCode} · {r.airportName}
            {r.distanceKm !== null && (
              <span className="text-muted-foreground">
                {" "}
                · {t("distance", { km: r.distanceKm })}
              </span>
            )}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {r.pricePerHour !== null && (
              <span className="font-semibold">
                {ta("owner.perHour", { price: formatPrice(r.pricePerHour, r.currency, locale) })}
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {ta(`priceBases.${r.priceBasis}`)}
                </span>
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <StarIcon className="size-3.5" aria-hidden />
              {r.ratingCount > 0 && r.ratingAvg !== null
                ? ta("public.rating", { rating: r.ratingAvg.toFixed(1), count: r.ratingCount })
                : t("noReviews")}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
