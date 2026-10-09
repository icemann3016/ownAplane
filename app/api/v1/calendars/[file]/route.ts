import { getTranslations } from "next-intl/server";

import { ApiError, apiRoute } from "@/lib/api/http";
import { busyTimesFor, findConnection } from "@/lib/calendar-sync/busy";
import { buildIcs } from "@/lib/calendar-sync/ics";
import { getRecipient } from "@/lib/email/recipient";
import { defaultLocale, isLocale } from "@/lib/i18n/config";
import { siteConfig } from "@/lib/site";
import { appUrl } from "@/lib/site-url";

const DAY = 24 * 60 * 60 * 1000;

/**
 * GET /api/v1/calendars/{token}.ics: the aircraft's busy times for one connected system (SYN-3),
 * without that system's own. The token in the link is the secret; the owner can reset it.
 */
export const GET = apiRoute(
  async (_request, { params }: RouteContext<"/api/v1/calendars/[file]">) => {
    const token = /^([0-9a-f]{32,128})\.ics$/.exec((await params).file)?.[1];
    const connection = token ? await findConnection({ exportToken: token }) : null;
    if (!connection)
      throw new ApiError("not_found", "No calendar at this link (it may have been reset).");
    const now = Date.now();
    const busy = await busyTimesFor(
      connection,
      new Date(now - 30 * DAY),
      new Date(now + 400 * DAY),
    );
    const owner = await getRecipient(connection.ownerId);
    const locale = isLocale(owner?.locale) ? owner.locale : defaultLocale;
    const t = await getTranslations({ locale, namespace: "calendarSync.export" });
    const ics = buildIcs({
      name: t("name", { registration: connection.registration, site: siteConfig.name }),
      host: new URL(appUrl()).hostname,
      busy,
      titles: { booking: t("booked", { site: siteConfig.name }), blocked: t("blocked") },
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
