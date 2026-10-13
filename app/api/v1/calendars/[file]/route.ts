import { getTranslations } from "next-intl/server";

import { ApiError, apiRoute } from "@/lib/api/http";
import { busyTimesFor, findConnection } from "@/lib/calendar-sync/busy";
import { exportFields } from "@/lib/calendar-sync/fields";
import { buildIcs } from "@/lib/calendar-sync/ics";
import { type IcsTexts, toIcsEvent } from "@/lib/calendar-sync/outgoing";
import { getRecipient } from "@/lib/email/recipient";
import { defaultLocale, isLocale } from "@/lib/i18n/config";
import { siteConfig } from "@/lib/site";
import { appUrl } from "@/lib/site-url";

const DAY = 24 * 60 * 60 * 1000;
const STATUSES = ["requested", "accepted", "in_progress", "completed"] as const;

/**
 * GET /api/v1/calendars/{token}.ics: the aircraft's busy times for one connected system (SYN-3),
 * without that system's own, with the details the owner shares, in the owner's language. The
 * token in the link is the secret; the owner can reset it.
 */
export const GET = apiRoute(
  async (_request, { params }: RouteContext<"/api/v1/calendars/[file]">) => {
    const token = /^([0-9a-f]{32,128})\.ics$/.exec((await params).file)?.[1];
    const connection = token ? await findConnection({ exportToken: token }) : null;
    if (!connection) {
      throw new ApiError("not_found", "No calendar at this link (it may have been reset).");
    }
    const now = Date.now();
    const busy = await busyTimesFor(
      connection,
      new Date(now - 30 * DAY),
      new Date(now + 400 * DAY),
    );
    const owner = await getRecipient(connection.ownerId);
    const locale = isLocale(owner?.locale) ? owner.locale : defaultLocale;
    const t = await getTranslations({ locale, namespace: "calendarSync.export" });
    const site = siteConfig.name;
    const texts: IcsTexts = {
      titles: {
        booked: t("booked", { site }),
        busy: t("blocked"),
        owner_use: t("ownUse"),
        maintenance: t("maintenance"),
        unavailable: t("external"),
      },
      labels: {
        status: t("labels.status"),
        route: t("labels.route"),
        pilot: t("labels.pilot"),
        booking: t("labels.booking"),
        note: t("labels.note"),
        aircraft: t("labels.aircraft"),
      },
      statuses: Object.fromEntries(STATUSES.map((s) => [s, t(`statuses.${s}`)])),
    };
    const fields = exportFields(connection.exportFields);
    const ics = buildIcs({
      name: t("name", { registration: connection.registration, site }),
      host: new URL(appUrl()).hostname,
      events: busy.map((b) =>
        toIcsEvent(b, fields, texts, b.bookingId ? `${appUrl()}/bookings/${b.bookingId}` : ""),
      ),
    });
    return new Response(ics, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": `inline; filename="${connection.registration}.ics"`,
        "cache-control": "private, max-age=300",
      },
    });
  },
);
