import type { Metadata } from "next";
import Link from "next/link";
import { ListIcon, MapIcon, SearchXIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { type MapAirfield, SearchMap } from "@/components/aircraft/search-map";
import { Card, CardContent } from "@/components/ui/card";
import { formatPrice, formatSpan } from "@/lib/aircraft/format";
import { searchAircraft } from "@/lib/aircraft/search";
import { getUser } from "@/lib/auth/session";
import type { Locale } from "@/lib/i18n/config";
import { filtersToQuery, parseSearch } from "@/lib/validation/search";
import { ResultCard } from "./result-card";
import { SaveSearchForm } from "./save-search-form";
import { SearchForm } from "./search-form";

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("search");
  return { title: t("title") };
}

/** Find aircraft by airport, radius, dates and filters (SRC-1…3). Filters live in the URL. */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseSearch(params);
  const user = await getUser();
  const t = await getTranslations("search");
  const locale = (await getLocale()) as Locale;
  const { origin, originCoords, period, results } = await searchAircraft(user?.id ?? null, {
    ...filters,
    eligible: filters.eligible && Boolean(user),
  });
  // Carry the airport and dates to the aircraft page, so it can show availability for them.
  const carry = new URLSearchParams(
    Object.entries({ from: filters.from, to: filters.to, airport: filters.airport }).filter(
      (e): e is [string, string] => Boolean(e[1]),
    ),
  ).toString();
  const view = params.view === "map" ? "map" : "list";
  const viewHref = (v: "list" | "map") => {
    const next = new URLSearchParams();
    for (const [k, val] of Object.entries(params)) {
      const one = Array.isArray(val) ? val[0] : val;
      if (one && k !== "view") next.set(k, one);
    }
    if (v === "map") next.set("view", "map");
    const qs = next.toString();
    return qs ? `/search?${qs}` : "/search";
  };
  // One map marker per airfield, listing its aircraft.
  const airfields: MapAirfield[] = [];
  for (const r of results) {
    let field = airfields.find((f) => f.ident === r.airportIdent);
    if (!field) {
      field = {
        ident: r.airportIdent,
        code: r.airportCode,
        name: r.airportName,
        latitude: r.latitude,
        longitude: r.longitude,
        aircraft: [],
      };
      airfields.push(field);
    }
    field.aircraft.push({
      id: r.id,
      title: `${r.manufacturer} ${r.model}`,
      registration: r.registration,
      price: r.pricePerHour === null ? null : formatPrice(r.pricePerHour, r.currency, locale),
      href: `/aircraft/${r.id}${carry ? `?${carry}` : ""}`,
    });
  }
  const span = period ? formatSpan(period.from, period.to, locale) : null;
  const where = origin ? t("near", { code: origin.code, km: filters.radius }) : t("everywhere");

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <Card>
        <CardContent>
          <SearchForm
            filters={filters}
            airport={
              origin
                ? {
                    ident: origin.ident,
                    code: origin.code,
                    iataCode: origin.iataCode,
                    name: origin.name,
                    municipality: origin.municipality,
                    country: origin.country,
                  }
                : null
            }
            loggedIn={Boolean(user)}
            view={view}
          />
        </CardContent>
      </Card>

      <section className="grid gap-3" aria-labelledby="results-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-0.5">
            <h2 id="results-heading" className="text-lg font-semibold" aria-live="polite">
              {t("found", { count: results.length })}
            </h2>
            <p className="text-sm text-muted-foreground">
              {[where, span ? t("freeBetween", { when: span }) : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          <nav aria-label={t("view.label")} className="flex rounded-md border p-0.5">
            {(["list", "map"] as const).map((v) => {
              const Icon = v === "list" ? ListIcon : MapIcon;
              return (
                <Link
                  key={v}
                  href={viewHref(v)}
                  aria-current={view === v ? "page" : undefined}
                  className={
                    view === v
                      ? "flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-sm font-medium"
                      : "flex items-center gap-1.5 rounded px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                  }
                >
                  <Icon className="size-4" aria-hidden /> {t(`view.${v}`)}
                </Link>
              );
            })}
          </nav>
        </div>
        {user && (
          <SaveSearchForm
            query={filtersToQuery(filters)}
            suggestedName={capitalize([where, span].filter(Boolean).join(", "))}
          />
        )}
        {results.length === 0 ? (
          <Card>
            <CardContent className="flex items-start gap-3 text-sm text-muted-foreground">
              <SearchXIcon className="size-5 shrink-0" aria-hidden />
              {t("empty")}
            </CardContent>
          </Card>
        ) : view === "map" ? (
          <SearchMap
            airfields={airfields}
            origin={
              origin && originCoords
                ? { latitude: originCoords.lat, longitude: originCoords.lon, code: origin.code }
                : null
            }
          />
        ) : (
          <ul className="grid gap-4">
            {results.map((r) => (
              <li key={r.id}>
                <ResultCard result={r} query={carry} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
