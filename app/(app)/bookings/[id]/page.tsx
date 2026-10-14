import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftIcon,
  CalendarClockIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  MessagesSquareIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { BookingStatusBadge } from "@/components/bookings/booking-status-badge";
import { KnownItems } from "@/components/bookings/known-items";
import { WeatherCard } from "@/components/bookings/weather-card";
import { ReportDefectDialog } from "@/components/bookings/report-defect-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice, formatSpan, formatUtc } from "@/lib/aircraft/format";
import { isUuid } from "@/lib/aircraft/queries";
import { requireUser } from "@/lib/auth/session";
import { getBooking, pilotMeetsRequirements } from "@/lib/bookings/queries";
import { getKnownItems } from "@/lib/bookings/remarks";
import { FREE_CANCELLATION_HOURS } from "@/lib/bookings/respond";
import { toRange, utcToZoned } from "@/lib/domain/time";
import type { Locale } from "@/lib/i18n/config";
import { AirfieldRequests } from "./airfield-requests";
import { BookingContact } from "./booking-contact";
import { BookingHistory } from "./booking-history";
import { BookingReviews } from "./booking-reviews";
import { CancelBooking } from "./cancel-booking";
import { CheckoutRecord } from "./checkout-record";
import { FlightLogLink } from "./flight-log-link";
import { RespondForm } from "./respond-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("booking.detail");
  return { title: t("metaTitle") };
}

/** One booking, for its pilot and the aircraft's owner (BKG-1…3). */
export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { id } = await params;
  const { checkout } = await searchParams;
  const user = await requireUser(`/bookings/${id}`);
  if (!isUuid(id)) notFound();
  const detail = await getBooking(user.id, id);
  if (!detail) notFound();
  const { booking: b, period, proposal, aircraft: plane, pilot, owner, route } = detail;
  const t = await getTranslations("booking");
  const ta = await getTranslations("aircraft");
  const locale = (await getLocale()) as Locale;
  const isOwner = b.ownerId === user.id;
  const now = new Date();
  const timeZone = "UTC";
  const span = formatSpan(period.from, period.to, locale);
  const meets =
    isOwner && b.status === "requested"
      ? await pilotMeetsRequirements(
          user.id,
          { pilotId: b.pilotId, aircraftId: b.aircraftId, period: toRange(period.from, period.to) },
          route.map((r) => r.ident),
        )
      : null;
  const expires = formatUtc(b.expiresAt, locale);

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10">
      <Button variant="ghost" size="sm" className="-ml-3 justify-self-start" asChild>
        <Link href="/bookings">
          <ArrowLeftIcon aria-hidden /> {t("detail.back")}
        </Link>
      </Button>
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {plane.manufacturer} {plane.model}
          </h1>
          <BookingStatusBadge status={b.status} label={t(`statuses.${b.status}`)} />
        </div>
        <p className="text-muted-foreground">
          <span className="font-mono">{plane.registration}</span> ·{" "}
          {isOwner
            ? t("detail.pilotIs", { name: pilot?.displayName ?? t("detail.deletedUser") })
            : t("detail.ownerIs", { name: owner.displayName })}
        </p>
        {b.pilotId && (
          <Button variant="outline" size="sm" className="mt-1 justify-self-start" asChild>
            <Link href={`/messages/new?booking=${b.id}`}>
              <MessagesSquareIcon aria-hidden />{" "}
              {t(isOwner ? "detail.messagePilot" : "detail.messageOwner")}
            </Link>
          </Button>
        )}
      </div>

      {b.status === "requested" && (
        <Alert>
          <InfoIcon />
          <AlertDescription>
            {isOwner
              ? t("detail.answerBy", { date: expires })
              : t("detail.waiting", { date: expires })}
          </AlertDescription>
        </Alert>
      )}
      {isOwner && meets !== null && (
        <p
          className={
            meets
              ? "flex items-center gap-2 text-sm text-success"
              : "flex items-center gap-2 text-sm text-destructive"
          }
        >
          {meets ? (
            <CircleCheckIcon className="size-4" aria-hidden />
          ) : (
            <CircleAlertIcon className="size-4" aria-hidden />
          )}
          {meets ? t("detail.meets") : t("detail.doesNotMeet")}
        </p>
      )}
      <FlightLogLink
        bookingId={b.id}
        status={b.status}
        isPilot={b.pilotId === user.id}
        opensAt={new Date(period.from.getTime() - 2 * 3_600_000)}
        passengers={b.passengers}
        error={checkout}
      />
      {b.status === "completed" && b.pilotId && (
        <BookingReviews
          userId={user.id}
          bookingId={b.id}
          isPilot={b.pilotId === user.id}
          otherName={
            isOwner
              ? (pilot?.displayName ?? t("detail.deletedUser"))
              : `${plane.registration} · ${owner.displayName}`
          }
        />
      )}
      {plane.status === "grounded" && ["requested", "accepted"].includes(b.status) && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertDescription>{t("detail.grounded")}</AlertDescription>
        </Alert>
      )}
      {["requested", "accepted", "in_progress"].includes(b.status) && (
        <WeatherCard
          userId={user.id}
          isPilot={b.pilotId === user.id}
          route={route}
          period={period}
          aircraftIfr={plane.ifr}
        />
      )}
      {b.pilotId === user.id && ["requested", "accepted"].includes(b.status) && (
        <AirfieldRequests userId={user.id} bookingId={b.id} route={route} />
      )}
      {["requested", "accepted", "in_progress"].includes(b.status) && (
        <KnownItems items={await getKnownItems(user.id, b.aircraftId)} />
      )}
      {b.checkoutRequired && (
        <CheckoutRecord
          viewerId={user.id}
          isOwner={isOwner}
          bookingId={b.id}
          aircraftId={b.aircraftId}
          pilotId={b.pilotId}
          defaultDate={utcToZoned(period.from, timeZone).slice(0, 10)}
          canRecord={["accepted", "in_progress", "completed"].includes(b.status)}
        />
      )}

      {isOwner && b.status === "requested" && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("respond.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <RespondForm bookingId={b.id} />
          </CardContent>
        </Card>
      )}
      {b.ownerNote && (
        <p className="rounded-md border p-3 text-sm">
          <span className="font-medium">{t("detail.ownerNote")}</span> {b.ownerNote}
        </p>
      )}
      {proposal && b.status === "declined" && (
        <Alert>
          <CalendarClockIcon />
          <AlertDescription className="grid gap-2">
            <span>
              {t(isOwner ? "detail.youProposed" : "detail.proposed", {
                when: formatSpan(proposal.from, proposal.to, locale),
              })}
            </span>
            {!isOwner && (
              <Button size="sm" className="justify-self-start" asChild>
                <Link
                  href={`/aircraft/${b.aircraftId}/book?${new URLSearchParams({
                    from: utcToZoned(proposal.from, timeZone),
                    to: utcToZoned(proposal.to, timeZone),
                  })}`}
                >
                  {t("detail.requestProposed")}
                </Link>
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {["accepted", "in_progress", "completed"].includes(b.status) ? (
        <BookingContact userId={user.id} bookingId={b.id} isOwner={isOwner} />
      ) : (
        b.status === "requested" && (
          <p className="text-sm text-muted-foreground">{t("contact.afterAccept")}</p>
        )
      )}
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("detail.flight")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">{t("detail.when")}</dt>
              <dd className="font-medium">{span}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">{t("detail.route")}</dt>
              <dd className="font-medium">
                {route.map((r) => `${r.code} (${r.name})`).join(" → ")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("form.purpose")}</dt>
              <dd className="font-medium">{t(`form.purposes.${b.purpose}`)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("form.passengers")}</dt>
              <dd className="font-medium">{b.passengers}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("form.plannedHours")}</dt>
              <dd className="font-medium">{b.plannedHours}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("form.estimate")}</dt>
              <dd className="font-medium">{formatPrice(b.estimate, b.currency, locale)}</dd>
              <dd className="text-xs text-muted-foreground">
                {formatPrice(b.pricePerHour, b.currency, locale)}/h ·{" "}
                {t(`detail.basis.${b.priceBasis}`)}
              </dd>
            </div>
            {b.message && (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">{t("form.message")}</dt>
                <dd className="whitespace-pre-line">{b.message}</dd>
              </div>
            )}
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">{t("form.payDirectly")}</p>
        </CardContent>
      </Card>

      {(b.status === "requested" || b.status === "accepted") && period.from > now && (
        <CancelBooking
          bookingId={b.id}
          policyText={`${ta(`cancellation.${b.cancellationPolicy}.label`)}: ${ta(`cancellation.${b.cancellationPolicy}.text`)}`}
          late={
            b.status === "accepted" &&
            now.getTime() >
              period.from.getTime() - FREE_CANCELLATION_HOURS[b.cancellationPolicy] * 3_600_000
          }
        />
      )}
      {b.status === "cancelled" && b.cancelReason && (
        <p className="rounded-md border p-3 text-sm">
          {t(b.cancelledBy === b.ownerId ? "detail.cancelledByOwner" : "detail.cancelledByPilot", {
            reason: b.cancelReason,
          })}
          {b.lateCancellation && (
            <span className="block text-xs text-muted-foreground">{t("detail.late")}</span>
          )}
        </p>
      )}

      {["accepted", "in_progress", "completed"].includes(b.status) && b.pilotId === user.id && (
        <ReportDefectDialog aircraftId={b.aircraftId} bookingId={b.id} />
      )}

      <BookingHistory events={detail.events} />
    </div>
  );
}
