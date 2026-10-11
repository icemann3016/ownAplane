import { sendAircraftExpiryReminders, unlistExpiredAircraft } from "@/lib/aircraft/expiry";
import { enforcePlanLimits, warnPlanChanges } from "@/lib/billing/enforce";
import { isTestMode } from "@/lib/billing/provider";
import { renewDueSubscriptions } from "@/lib/billing/test-renewals";
import { pruneApiUsage } from "@/lib/api/rate-limit";
import { expireBookingRequests } from "@/lib/bookings/queries";
import { syncDueCalendars } from "@/lib/calendar-sync/sync";
import { deliverWebhooks } from "@/lib/calendar-sync/webhooks";
import { cronAuthorized } from "@/lib/cron";
import { sendCurrencyReminders } from "@/lib/logbook/currency-reminders";
import { deleteOrphanDocuments } from "@/lib/documents";
import { deliverMessageEmails } from "@/lib/messages/emails";
import { createBookingReminders, deliverNotificationEmails } from "@/lib/notifications";
import { sendExpiryReminders } from "@/lib/pilot/reminders";
import { publishDueReviews } from "@/lib/reviews/jobs";
import { runSavedSearchAlerts } from "@/lib/saved/alerts";

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
 * - tells users about aircraft that newly match their saved searches (SRC-6)
 * - sends (or retries) webhooks to connected systems (SYN-6)
 * - forgets API request counts older than an hour (API-6)
 * - plans (SUB-6): renews test-mode subscriptions whose period ended, warns owners a week before
 *   a smaller plan starts, then unlists aircraft beyond its limit
 * - reminds Pilot Plus users of passenger recency ending and SEP revalidation due (currency)
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
  const savedSearchAlerts = await runSavedSearchAlerts();
  const notificationEmails = await deliverNotificationEmails(500);
  const messageEmails = await deliverMessageEmails(500);
  const linkedCalendars = await syncDueCalendars(60 * 60_000, 200);
  const webhooks = await deliverWebhooks(500);
  await pruneApiUsage();
  const renewedSubscriptions = isTestMode() ? await renewDueSubscriptions() : 0;
  const planWarnings = await warnPlanChanges();
  const unlistedForPlan = await enforcePlanLimits();
  const currencyReminders = await sendCurrencyReminders();
  const result = {
    expiredRequests,
    reminders,
    unlistedAircraft,
    aircraftReminders,
    orphanDocuments,
    publishedReviews,
    bookingReminders,
    savedSearchAlerts,
    notificationEmails,
    messageEmails,
    linkedCalendars,
    webhooks,
    renewedSubscriptions,
    planWarnings,
    unlistedForPlan,
    currencyReminders,
  };
  console.info("[cron] daily", result);
  return Response.json({ ok: true, ...result });
}
