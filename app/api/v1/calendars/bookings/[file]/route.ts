import { getTranslations } from "next-intl/server";

import { ApiError, apiRoute } from "@/lib/api/http";
import { planOf } from "@/lib/billing/plan";
import { PLANS } from "@/lib/billing/plans";
import { feedBookings, feedUser } from "@/lib/calendar-sync/booking-feed";
import { buildIcs } from "@/lib/calendar-sync/ics";
import { getRecipient } from "@/lib/email/recipient";
import { defaultLocale, isLocale } from "@/lib/i18n/config";
import { siteConfig } from "@/lib/site";
import { appUrl } from "@/lib/site-url";

/**
 * GET /api/v1/calendars/bookings/{token}.ics: the user's own bookings as pilot and owner, for
 * Google Calendar or Outlook (Pilot Plus), in the user's language. The token is the secret; the
 * user can reset it under Bookings.
 */
export const GET = apiRoute(
  async (_request, { params }: RouteContext<"/api/v1/calendars/bookings/[file]">) => {
    const token = /^([0-9a-f]{32,128})\.ics$/.exec((await params).file)?.[1];
    const userId = token ? await feedUser(token) : null;
    if (!userId) {
      throw new ApiError("not_found", "No calendar at this link (it may have been reset).");
    }
    if (!PLANS[(await planOf(userId)).plan].bookingsCalendar) {
      throw new ApiError(
        "payment_required",
        "This calendar link needs Pilot Plus or an owner plan.",
        undefined,
        {
          reason: "plan_required",
          feature: "bookingsCalendar",
        },
      );
    }
    const user = await getRecipient(userId);
    const locale = isLocale(user?.locale) ? user.locale : defaultLocale;
    const t = await getTranslations({ locale, namespace: "booking.feed.events" });
    const site = siteConfig.name;
    const events = (await feedBookings(userId)).map((b) => ({
      id: `booking-${b.id}`,
      from: b.from,
      to: b.to,
      summary:
        t(b.role, { registration: b.registration, route: b.route }) +
        (b.status === "requested" ? ` ${t("requested")}` : ""),
      status: b.status === "requested" ? ("TENTATIVE" as const) : ("CONFIRMED" as const),
      url: `${appUrl()}/bookings/${b.id}`,
    }));
    const ics = buildIcs({ name: t("name", { site }), host: new URL(appUrl()).hostname, events });
    return new Response(ics, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "cache-control": "private, max-age=300",
      },
    });
  },
);
