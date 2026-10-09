import { syncDueCalendars } from "@/lib/calendar-sync/sync";
import { cronAuthorized } from "@/lib/cron";
import { deliverNotificationEmails } from "@/lib/notifications";

/**
 * Reads linked calendars (iCal/JSON) not read in the last 10 minutes (SYN-2), and emails new
 * conflict alerts. Called every 15 minutes with `Authorization: Bearer $CRON_SECRET` by the
 * GitHub Actions schedule (.github/workflows/calendar-sync.yml); Vercel Hobby cron runs only
 * daily. Bookings also refresh their aircraft's calendars right before a request or acceptance.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const linkedCalendars = await syncDueCalendars(10 * 60_000, 50);
  const notificationEmails = await deliverNotificationEmails(100);
  console.info("[cron] sync", { linkedCalendars, notificationEmails });
  return Response.json({ ok: true, linkedCalendars, notificationEmails });
}
