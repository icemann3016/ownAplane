import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EyeIcon, MapPinIcon, MessagesSquareIcon, PencilIcon, StarIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { RequirementsList } from "@/components/aircraft/requirements-list";
import { ReportDialog } from "@/components/reports/report-dialog";
import { ReviewList } from "@/components/reviews/review-list";
import { UserAvatar } from "@/components/user-avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice } from "@/lib/aircraft/format";
import { getVisibleAircraft } from "@/lib/aircraft/public";
import { getPhotos, getUnits } from "@/lib/aircraft/queries";
import { getRequirements } from "@/lib/aircraft/requirements";
import { airportPlace, getAirport } from "@/lib/airports";
import { avatarUrl } from "@/lib/avatar-url";
import { getUser } from "@/lib/auth/session";
import type { Locale } from "@/lib/i18n/config";
import { categoryAverages, listPublishedReviews } from "@/lib/reviews/queries";
import { Availability } from "./availability";
import { EligibilityCard } from "./eligibility-card";
import { FavouriteButton } from "./favourite-button";
import { Gallery } from "./gallery";
import { wantedPeriod } from "./period";
import { Specs } from "./specs";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await getUser();
  const row = await getVisibleAircraft(user?.id ?? null, id);
  if (!row) return {};
  const a = row.aircraft;
  return {
    title: `${a.registration} · ${a.manufacturer} ${a.model}`,
    description: a.description?.slice(0, 160) ?? undefined,
  };
}

/** Carry searched dates to the booking form. */
function bookQuery(query: Record<string, string | string[] | undefined>) {
  const from = typeof query.from === "string" ? query.from : null;
  const to = typeof query.to === "string" ? query.to : null;
  return from && to ? `?${new URLSearchParams({ from, to })}` : "";
}

/**
 * Public listing page (SRC-4): photos, specs, availability, price, requirements with the
 * pilot's own eligibility, and the owner. Dates from a search are carried in the URL.
 */
export default async function AircraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const user = await getUser();
  const row = await getVisibleAircraft(user?.id ?? null, id);
  if (!row) notFound();
  const { aircraft: a, owner } = row;
  const t = await getTranslations("aircraft");
  const tr = await getTranslations("reviews");
  const tm = await getTranslations("messages");
  const locale = (await getLocale()) as Locale;
  const [photos, requirements, airport, units, reviews, categories] = await Promise.all([
    getPhotos(user?.id ?? null, id),
    getRequirements(user?.id ?? null, id),
    getAirport(a.homeAirportIdent),
    user ? getUnits(user.id) : Promise.resolve("metric" as const),
    a.ratingCount ? listPublishedReviews({ aircraftId: id }) : [],
    a.ratingCount ? categoryAverages({ aircraftId: id }) : {},
  ]);
  const isOwner = user?.id === a.ownerId;
  const { month, period } = await wantedPeriod(query);
  const price = (amount: number) => formatPrice(amount, a.currency, locale);

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8">
      {a.status !== "listed" && (
        <Alert>
          <EyeIcon />
          <AlertDescription>
            {t("public.preview", { status: t(`statuses.${a.status}`) })}
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {a.manufacturer} {a.model}
          </h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
            <span className="font-mono font-medium text-foreground">{a.registration}</span>
            {airport && (
              <span className="inline-flex items-center gap-1">
                <MapPinIcon className="size-4" aria-hidden />
                {airport.code} · {airportPlace(airport)}
              </span>
            )}
            {a.ratingCount > 0 && a.ratingAvg !== null && (
              <a href="#reviews" className="inline-flex items-center gap-1 hover:underline">
                <StarIcon className="size-4 fill-amber-500 text-amber-500" aria-hidden />
                {t("public.rating", { rating: a.ratingAvg.toFixed(1), count: a.ratingCount })}
              </a>
            )}
          </p>
        </div>
        {user && !isOwner && <FavouriteButton userId={user.id} aircraftId={id} />}
        {isOwner && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/owner/aircraft/${id}`}>
              <PencilIcon aria-hidden /> {t("public.edit")}
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="grid min-w-0 content-start gap-6">
          <Gallery
            photos={photos.map((p) => ({ id: p.id, url: p.url }))}
            name={`${a.manufacturer} ${a.model}`}
          />
          {a.description && (
            <section className="grid gap-2">
              <h2 className="text-lg font-semibold">{t("public.about")}</h2>
              <p className="text-sm leading-relaxed whitespace-pre-line">{a.description}</p>
            </section>
          )}
          <Availability
            aircraftId={id}
            viewerId={user?.id ?? null}
            canBook={a.status === "listed" && a.pricePerHour !== null && !isOwner}
            locale={locale}
            month={month}
            period={period}
          />
          <Specs aircraft={a} units={units} />
          <section className="grid gap-3">
            <h2 className="text-lg font-semibold">{t("public.requirements")}</h2>
            <RequirementsList
              requirements={requirements}
              typeDesignator={a.typeDesignator}
              category={a.category}
            />
          </section>
          <ReviewList
            id="reviews"
            title={tr("aircraftTitle")}
            direction="pilot_to_owner"
            average={a.ratingAvg}
            count={a.ratingCount}
            categories={categories}
            reviews={reviews}
            viewerId={user?.id ?? null}
          />
        </div>

        <aside className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle as="h2">
                {a.pricePerHour !== null
                  ? t("owner.perHour", { price: price(a.pricePerHour) })
                  : "—"}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <p>
                {t(`priceBases.${a.priceBasis}`)} · {t(`timeBases.${a.timeBasis}`)}
              </p>
              {a.weekendPricePerHour !== null && (
                <p>{t("public.weekend", { price: price(a.weekendPricePerHour) })}</p>
              )}
              {a.minHoursPerDay !== null && (
                <p>{t("public.minHours", { hours: a.minHoursPerDay })}</p>
              )}
              <p>
                <span className="font-medium">
                  {t(`cancellation.${a.cancellationPolicy}.label`)}
                </span>
                : {t(`cancellation.${a.cancellationPolicy}.text`)}
              </p>
              {!isOwner && (
                <div className="mt-2 border-t pt-3">
                  <EligibilityCard
                    aircraftId={id}
                    typeDesignator={a.typeDesignator}
                    viewerId={user?.id ?? null}
                    period={period}
                    loginNext={`/aircraft/${id}`}
                  />
                </div>
              )}
              {a.status === "listed" && !isOwner && (
                <Button className="mt-2" asChild>
                  <Link href={`/aircraft/${id}/book${bookQuery(query)}`}>
                    {t("public.request")}
                  </Link>
                </Button>
              )}
              {a.status === "listed" && !isOwner && (
                <Button variant="outline" asChild>
                  <Link
                    href={
                      user
                        ? `/messages/new?aircraft=${id}`
                        : `/login?next=${encodeURIComponent(`/messages/new?aircraft=${id}`)}`
                    }
                  >
                    <MessagesSquareIcon aria-hidden /> {tm("askOwner")}
                  </Link>
                </Button>
              )}
              <p className="text-xs text-muted-foreground">{t("fields.paymentNote")}</p>
              {user && !isOwner && <ReportDialog targetType="aircraft" targetId={id} />}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3">
              <UserAvatar name={owner.displayName} url={avatarUrl(owner.avatarKey)} size={48} />
              <div className="grid min-w-0 gap-0.5">
                <span className="text-xs text-muted-foreground">{t("public.owner")}</span>
                <Link
                  href={`/u/${owner.id}`}
                  className="truncate font-medium underline-offset-4 hover:underline"
                >
                  {owner.displayName}
                </Link>
                {owner.ratingCount > 0 && owner.ratingAvg !== null && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <StarIcon className="size-3 fill-amber-500 text-amber-500" aria-hidden />
                    {tr("ownerRating", {
                      rating: owner.ratingAvg.toFixed(1),
                      count: owner.ratingCount,
                    })}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
