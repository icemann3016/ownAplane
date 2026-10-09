import { sendAircraftExpiryReminders, unlistExpiredAircraft } from "@/lib/aircraft/expiry";
import { expireBookingRequests } from "@/lib/bookings/queries";
import { syncDueCalendars } from "@/lib/calendar-sync/sync";
import { cronAuthorized } from "@/lib/cron";
import { deleteOrphanDocuments } from "@/lib/documents";
import { deliverMessageEmails } from "@/lib/messages/emails";
import { createBookingReminders, deliverNotificationEmails } from "@/lib/notifications";
import { sendExpiryReminders } from "@/lib/pilot/reminders";
import { publishDueReviews } from "@/lib/reviews/jobs";

/**
 * Daily maintenance, called by a scheduler with `Authorization: Bearer $CRON_SECRET`:
 * Vercel Cron (vercel.json) sends it automatically; on Google Cloud use Cloud Scheduler, on
 * Azure a Container Apps job or Logic App (see docs/deployment.md).
 * - expires booking requests the owner didn't answer in time (pages also do this as they load)
 * - emails pilots whose credentials expire within 30 days
 * - unlists aircraft whose ARC or insurance expired, and reminds owners 30 days before
 * - removes uploads older than a day that were never attached to a credential or aircraft
 * - reminds pilot and owner of bookings starting within 36 hours, and emails notifications
 *   that weren't sent right away
 * - emails about unread messages not emailed yet (MSG-1)
 * - publishes reviews whose 14-day window has closed (RAT-3)
 * - reads linked calendars not read for an hour (SYN-2; /api/cron/sync does it every 15 min)
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const expiredRequests = await expireBookingRequests();
  const reminders = await sendExpiryReminders();
  const unlistedAircraft = await unlistExpiredAircraft();
  const aircraftReminders = await sendAircraftExpiryReminders();
  const orphanDocuments = await deleteOrphanDocuments(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const publishedReviews = await publishDueReviews();
  const bookingReminders = await createBookingReminders();
  const notificationEmails = await deliverNotificationEmails(500);
  const messageEmails = await deliverMessageEmails(500);
  const linkedCalendars = await syncDueCalendars(60 * 60_000, 200);
  const result = {
    expiredRequests,
    reminders,
    unlistedAircraft,
    aircraftReminders,
    orphanDocuments,
    publishedReviews,
    bookingReminders,
    notificationEmails,
    messageEmails,
    linkedCalendars,
  };
  console.info("[cron] daily", result);
  return Response.json({ ok: true, ...result });
}
