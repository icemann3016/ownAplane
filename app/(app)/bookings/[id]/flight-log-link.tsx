import Link from "next/link";
import { CircleAlertIcon, NotebookPenIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { BookingStatus } from "@/lib/db/schema";
import { formatUtc } from "@/lib/aircraft/format";
import type { Locale } from "@/lib/i18n/config";
import { startCheckout } from "./log/actions";

const ERRORS = new Set([
  "not_found",
  "not_accepted",
  "too_early",
  "aircraft_grounded",
  "passenger_recency",
]);

/** Check-out button for the pilot of an accepted booking, or the link to its flight log (BKG-7). */
export async function FlightLogLink({
  bookingId,
  status,
  isPilot,
  opensAt,
  passengers,
  error,
}: {
  bookingId: string;
  status: BookingStatus;
  isPilot: boolean;
  /** Check-out opens 2 hours before the booked time. */
  opensAt: Date;
  /** With passengers the pilot confirms the 90-day rule (FCL.060) at check-out. */
  passengers: number;
  error?: string;
}) {
  const t = await getTranslations("flightLog");
  if (status === "in_progress" || status === "completed") {
    return (
      <Button variant="outline" className="justify-self-start" asChild>
        <Link href={`/bookings/${bookingId}/log`}>
          <NotebookPenIcon aria-hidden /> {t("open")}
        </Link>
      </Button>
    );
  }
  if (status !== "accepted" || !isPilot) return null;
  const message = error
    ? t(`errors.${ERRORS.has(error) ? error : "failed"}` as "errors.failed")
    : null;
  if (new Date() < opensAt) {
    const when = formatUtc(opensAt, (await getLocale()) as Locale);
    return <p className="text-sm text-muted-foreground">{t("checkoutOpens", { when })}</p>;
  }
  return (
    <form action={startCheckout} className="grid gap-2">
      {message && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="bookingId" value={bookingId} />
      <p className="text-sm text-muted-foreground">{t("checkoutHint")}</p>
      {passengers > 0 && (
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="recency" required className="mt-1" />
          <span>{t("recencyConfirm", { count: passengers })}</span>
        </label>
      )}
      <Button type="submit" className="justify-self-start">
        <NotebookPenIcon aria-hidden /> {t("startCheckout")}
      </Button>
    </form>
  );
}
