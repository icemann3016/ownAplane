import "server-only";

import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { asUser } from "@/lib/db/rls";
import { aircraft, bookings, notifications, profiles } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { getRecipient } from "@/lib/email/recipient";
import { bookingNotificationEmail } from "@/lib/email/templates";
import { appUrl } from "@/lib/site-url";

/** Types with their own text; anything else is shown with a generic one. */
export const NOTIFICATION_TYPES = [
  "requested",
  "accepted",
  "declined",
  "proposed",
  "expired",
  "cancelled",
  "checked_out",
  "log_submitted",
  "log_correction",
  "log_confirmed",
  "defect_reported",
  "instant_booked",
  "review_submitted",
  "reviews_published",
  "review_replied",
  "reminder",
  "calendar_conflict",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export const knownType = (type: string): NotificationType | "other" =>
  (NOTIFICATION_TYPES as readonly string[]).includes(type) ? (type as NotificationType) : "other";

/** Context of bookings for notification texts: registration, start and the departure's zone. */
async function bookingContext(ids: string[]) {
  if (!ids.length) return new Map<string, { registration: string; from: Date; timeZone: string }>();
  // Trusted read: callers only pass bookings the user was notified about.
  const rows = await getDb()
    .select({
      id: bookings.id,
      registration: aircraft.registration,
      from: sql<string>`lower(${bookings.period})`,
    })
    .from(bookings)
    .innerJoin(aircraft, eq(aircraft.id, bookings.aircraftId))
    .where(inArray(bookings.id, ids));
  return new Map(
    rows.map((r) => [
      r.id,
      { registration: r.registration, from: new Date(r.from), timeZone: "UTC" },
    ]),
  );
}

/** The user's latest notifications with what they're about (RLS: own only). */
export async function listNotifications(userId: string, limit = 50) {
  const rows = await asUser(userId, (tx) =>
    tx
      .select({ n: notifications, actor: profiles.displayName })
      .from(notifications)
      .leftJoin(profiles, eq(profiles.id, notifications.actorId))
      .where(and(eq(notifications.userId, userId), eq(notifications.inApp, true)))
      .orderBy(desc(notifications.createdAt))
      .limit(limit),
  );
  const context = await bookingContext([
    ...new Set(rows.flatMap((r) => (r.n.bookingId ? [r.n.bookingId] : []))),
  ]);
  return rows.map((r) => ({
    ...r.n,
    actor: r.actor,
    booking: r.n.bookingId ? (context.get(r.n.bookingId) ?? null) : null,
  }));
}

export async function unreadCount(userId: string): Promise<number> {
  const [row] = await asUser(userId, (tx) =>
    tx
      .select({ n: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.inApp, true),
          isNull(notifications.readAt),
        ),
      ),
  );
  return row?.n ?? 0;
}

export async function markAllRead(userId: string) {
  await asUser(userId, (tx) =>
    tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
  );
}

/**
 * Email notifications that haven't been emailed yet (trusted code: after booking actions, and
 * the daily job as a catch-up). Rows are claimed in one UPDATE so parallel runs can't send twice;
 * a failed email is released and tried again next time. Only the last 3 days are sent.
 */
export async function deliverNotificationEmails(limit = 50): Promise<number> {
  const claimed = (await getDb().execute(sql`
    update ${notifications} set emailed_at = now()
    where id in (
      select id from ${notifications}
      where emailed_at is null and created_at > now() - interval '3 days'
      order by created_at limit ${limit}
      for update skip locked)
    returning id, user_id, type, booking_id, actor_id`)) as unknown as {
    id: string;
    user_id: string;
    type: string;
    booking_id: string | null;
    actor_id: string | null;
  }[];
  if (!claimed.length) return 0;
  const context = await bookingContext([
    ...new Set(claimed.flatMap((n) => (n.booking_id ? [n.booking_id] : []))),
  ]);
  const actorIds = [...new Set(claimed.flatMap((n) => (n.actor_id ? [n.actor_id] : [])))];
  const actors = actorIds.length
    ? await getDb()
        .select({ id: profiles.id, name: profiles.displayName })
        .from(profiles)
        .where(inArray(profiles.id, actorIds))
    : [];
  const actorName = new Map(actors.map((a) => [a.id, a.name]));

  let sent = 0;
  for (const n of claimed) {
    const booking = n.booking_id ? context.get(n.booking_id) : undefined;
    let ok = false;
    try {
      const to = await getRecipient(n.user_id);
      if (!to || !booking) {
        ok = true; // nothing to send (deleted user or booking): don't retry
      } else {
        ok = await sendEmail({
          to: to.email,
          ...bookingNotificationEmail({
            name: to.name,
            locale: to.locale,
            type: knownType(n.type),
            registration: booking.registration,
            from: booking.from,
            timeZone: booking.timeZone,
            other: (n.actor_id && actorName.get(n.actor_id)) || "",
            url: `${appUrl()}/bookings/${n.booking_id}`,
          }),
        });
        if (ok) sent += 1;
      }
    } catch (e) {
      console.error("[notifications] email failed", e);
    }
    if (!ok) {
      await getDb()
        .update(notifications)
        .set({ emailedAt: null })
        .where(eq(notifications.id, n.id));
    }
  }
  return sent;
}

/** Daily job: 24-hour reminders for accepted bookings (BKG-9). Returns how many bookings. */
export async function createBookingReminders(): Promise<number> {
  const [row] = (await getDb().execute(
    sql`select public.create_booking_reminders() as n`,
  )) as unknown as { n: number }[];
  return row?.n ?? 0;
}
