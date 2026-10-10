import Link from "next/link";
import { HeartOffIcon, PlaneIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice } from "@/lib/aircraft/format";
import type { Locale } from "@/lib/i18n/config";
import type { Favourite } from "@/lib/saved/favourites";
import { removeFavourite } from "./actions";

/** The user's favourite aircraft; ones no longer listed say so (SRC-6). */
export async function FavouritesCard({ favourites }: { favourites: Favourite[] }) {
  const t = await getTranslations("saved");
  const ta = await getTranslations("aircraft");
  const locale = (await getLocale()) as Locale;
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("favourites")}</CardTitle>
      </CardHeader>
      <CardContent>
        {favourites.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noFavourites")}</p>
        ) : (
          <ul className="grid divide-y">
            {favourites.map((f) => {
              const title = `${f.manufacturer} ${f.model}`;
              return (
                <li key={f.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                    {f.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- storage URLs vary by driver
                      <img src={f.coverUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <PlaneIcon className="size-6 text-muted-foreground" aria-hidden />
                    )}
                  </div>
                  <div className="grid min-w-0 flex-1 gap-0.5 text-sm">
                    <Link href={`/aircraft/${f.id}`} className="font-medium hover:underline">
                      {title}
                    </Link>
                    <span className="text-muted-foreground">
                      {[
                        f.registration,
                        f.airportCode,
                        f.pricePerHour === null
                          ? null
                          : t("perHour", {
                              price: formatPrice(f.pricePerHour, f.currency, locale),
                            }),
                        f.status === "listed" ? null : ta(`statuses.${f.status}`),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <form action={removeFavourite}>
                    <input type="hidden" name="aircraftId" value={f.id} />
                    <SubmitButton
                      variant="ghost"
                      size="icon"
                      aria-label={t("favourite.removeOf", { aircraft: title })}
                    >
                      <HeartOffIcon aria-hidden />
                    </SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
