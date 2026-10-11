import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon, DownloadIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { BookingStatusBadge } from "@/components/bookings/booking-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice, formatSpan } from "@/lib/aircraft/format";
import { requireUser } from "@/lib/auth/session";
import { type BookingListItem, listBookings } from "@/lib/bookings/queries";
import type { Locale } from "@/lib/i18n/config";
import { FeedCard } from "./feed-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("booking.list");
  return { title: t("title") };
}

/** My bookings: as pilot, and requests for my aircraft as owner. */
export default async function BookingsPage() {
  const user = await requireUser("/bookings");
  const t = await getTranslations("booking.list");
  const all = await listBookings(user.id);
  const asOwner = all.filter((b) => b.role === "owner");
  const asPilot = all.filter((b) => b.role === "pilot");

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      {asOwner.length > 0 && <Section title={t("asOwner")} items={asOwner} />}
      <Section title={t("asPilot")} items={asPilot} empty={t("emptyPilot")} />
      {asPilot.some((b) => b.status === "completed" || b.status === "in_progress") && (
        <div className="grid gap-1">
          <Button variant="outline" size="sm" className="justify-self-start" asChild>
            <a href="/api/pilot/legs" download>
              <DownloadIcon aria-hidden /> {t("exportLegs")}
            </a>
          </Button>
          <p className="text-xs text-muted-foreground">{t("exportLegsHint")}</p>
        </div>
      )}
      <FeedCard userId={user.id} />
    </div>
  );
}

async function Section({
  title,
  items,
  empty,
}: {
  title: string;
  items: BookingListItem[];
  empty?: string;
}) {
  const t = await getTranslations("booking");
  const locale = (await getLocale()) as Locale;
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="grid divide-y">
            {items.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/bookings/${b.id}`}
                  className="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 hover:bg-accent"
                >
                  <div className="grid min-w-0 flex-1 gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {b.aircraft.manufacturer} {b.aircraft.model}
                      </span>
                      <span className="font-mono text-sm text-muted-foreground">
                        {b.aircraft.registration}
                      </span>
                      <BookingStatusBadge status={b.status} label={t(`statuses.${b.status}`)} />
                    </div>
                    <span className="text-sm">{formatSpan(b.from, b.to, locale)}</span>
                    <span className="text-xs text-muted-foreground">
                      {b.departureIdent} → {b.arrivalIdent} ·{" "}
                      {formatPrice(b.estimate, b.currency, locale)}
                    </span>
                  </div>
                  <ChevronRightIcon className="size-4 shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
