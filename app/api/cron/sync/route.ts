import { pruneApiUsage } from "@/lib/api/rate-limit";
import { syncDueCalendars } from "@/lib/calendar-sync/sync";
import { deliverWebhooks } from "@/lib/calendar-sync/webhooks";
import { cronAuthorized } from "@/lib/cron";
import { deliverNotificationEmails } from "@/lib/notifications";

/**
 * Reads linked calendars (iCal/JSON) and owners' partner keys (SYN-7) not read in the last 10
 * minutes (SYN-2), emails new conflict alerts, sends (or retries) webhooks to connected systems
 * (SYN-6) and forgets API request counts older than an hour (API-6). Called every 15 minutes
 * with `Authorization: Bearer $CRON_SECRET` by the GitHub Actions schedule
 * (.github/workflows/calendar-sync.yml); Vercel Hobby cron runs only daily. Bookings also
 * refresh their aircraft's calendars right before a request or acceptance.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const linkedCalendars = await syncDueCalendars(10 * 60_000, 50);
  const notificationEmails = await deliverNotificationEmails(100);
  const webhooks = await deliverWebhooks(200);
  await pruneApiUsage();
  console.info("[cron] sync", { linkedCalendars, notificationEmails, webhooks });
  return Response.json({ ok: true, linkedCalendars, notificationEmails, webhooks });
}
