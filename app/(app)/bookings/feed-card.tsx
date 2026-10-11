import { CalendarPlusIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { PlanNote } from "@/components/billing/plan-note";
import { CopyField } from "@/components/copy-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyPlan } from "@/lib/billing/plan";
import { PLANS } from "@/lib/billing/plans";
import { getFeedToken } from "@/lib/calendar-sync/booking-feed";
import { appUrl } from "@/lib/site-url";
import { removeBookingFeed, resetBookingFeed } from "./feed-actions";

/** "Your bookings in your calendar": a private iCal link (Pilot Plus). */
export async function FeedCard({ userId }: { userId: string }) {
  const t = await getTranslations("booking.feed");
  const included = PLANS[(await getMyPlan(userId)).plan].bookingsCalendar;
  const token = included ? await getFeedToken(userId) : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <CalendarPlusIcon className="size-5 text-primary" aria-hidden />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("text")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {!included ? (
          <PlanNote>{t("planNeeded")}</PlanNote>
        ) : token ? (
          <>
            <CopyField
              label={t("link")}
              value={`${appUrl()}/api/v1/calendars/bookings/${token}.ics`}
              hint={t("hint")}
            />
            <div className="flex flex-wrap gap-2">
              <form action={resetBookingFeed}>
                <SubmitButton variant="outline" size="sm">
                  {t("reset")}
                </SubmitButton>
              </form>
              <form action={removeBookingFeed}>
                <SubmitButton variant="ghost" size="sm">
                  {t("remove")}
                </SubmitButton>
              </form>
            </div>
          </>
        ) : (
          <form action={resetBookingFeed}>
            <SubmitButton size="sm">{t("create")}</SubmitButton>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
