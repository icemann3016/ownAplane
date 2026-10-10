// In-app notifications (BKG-9), also sent by email. Rows are created by the database (a trigger
// on booking_events, and the daily reminder job); lib/notifications sends the emails.
// RLS: db/migrations/0032_notification_security.sql.
import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { bookings } from "./bookings";
import { savedSearches } from "./saved";

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Booking event type (requested, accepted…) or "reminder".
    type: text("type").notNull(),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    /** For "saved_search" alerts (SRC-6): the search with new aircraft. */
    savedSearchId: uuid("saved_search_id").references(() => savedSearches.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
    /** Shown in the app (bell, /notifications); false = email only (MSG-3). */
    inApp: boolean("in_app").notNull().default(true),
    // Set when the email was sent (or isn't needed); null = still to send.
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.createdAt),
    index("notifications_unsent_idx")
      .on(t.createdAt)
      .where(sql`emailed_at is null`),
  ],
).enableRLS();

export type Notification = typeof notifications.$inferSelect;
