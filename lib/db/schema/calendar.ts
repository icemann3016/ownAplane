// Aircraft availability (M5): everything that makes an aircraft busy lives in one table, so a
// Postgres exclusion constraint can make double bookings impossible (plan §4.1). The
// constraint, RLS and helper functions are in db/migrations/0010_calendar_security.sql.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { aircraft } from "./aircraft";
import { users } from "./auth";

/** A Postgres tstzrange, e.g. '["2026-10-01 08:00:00+00","2026-10-01 12:00:00+00")'. */
export const tstzrange = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tstzrange";
  },
});

export const calendarEntryKind = pgEnum("calendar_entry_kind", [
  "booking",
  "owner_use",
  "maintenance",
  "unavailable",
]);

export const calendarEntries = pgTable(
  "calendar_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    aircraftId: uuid("aircraft_id")
      .notNull()
      .references(() => aircraft.id, { onDelete: "cascade" }),
    /** Start inclusive, end exclusive, in UTC. */
    period: tstzrange("period").notNull(),
    kind: calendarEntryKind("kind").notNull(),
    /** The booking that holds this time (M6). */
    bookingId: uuid("booking_id"),
    note: text("note"),
    /** Only active entries block time; declined, expired or cancelled holds are deactivated. */
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Calendar sync (SYN-1…5): a busy time from another system, by that system's own id.
    connectionId: uuid("connection_id").references((): AnyPgColumn => calendarConnections.id, {
      onDelete: "cascade",
    }),
    externalId: text("external_id"),
    /**
     * An external busy time that overlaps an ownAplane booking: kept inactive and shown to the
     * owner to resolve (SYN-5). Inactive without `conflict` = already covered by an owner block.
     */
    conflict: boolean("conflict").notNull().default(false),
  },
  (t) => [
    index("calendar_entries_aircraft_idx").on(t.aircraftId),
    uniqueIndex("calendar_entries_external_unique")
      .on(t.connectionId, t.externalId)
      .where(sql`${t.connectionId} is not null`),
    check(
      "calendar_entries_external",
      sql`(${t.connectionId} is null and ${t.externalId} is null and not ${t.conflict})
        or (${t.kind} = 'unavailable' and ${t.bookingId} is null and ${t.externalId} is not null
          and char_length(${t.externalId}) between 1 and 200)`,
    ),
    check(
      "calendar_entries_period",
      sql`not isempty(${t.period}) and lower_inc(${t.period}) and not upper_inc(${t.period})
        and not lower_inf(${t.period}) and not upper_inf(${t.period})
        and upper(${t.period}) - lower(${t.period}) <= interval '366 days'`,
    ),
    check("calendar_entries_note", sql`char_length(${t.note}) <= 200`),
    check("calendar_entries_booking", sql`(${t.kind} = 'booking') = (${t.bookingId} is not null)`),
  ],
).enableRLS();

/** How another system's bookings reach us (SYN-1, SYN-4): none = it only reads our iCal link. */
export const calendarConnectionInbound = pgEnum("calendar_connection_inbound", [
  "none",
  "ical",
  "json",
  "push",
]);

/**
 * Another booking system an aircraft is connected to (SYN-1…5). Its busy times are rows in
 * calendar_entries (so the exclusion constraint covers them), and it reads ours from a private
 * iCal link (`export_token`, SYN-3) without its own. RLS: 0053_calendar_sync_security.sql.
 */
export const calendarConnections = pgTable(
  "calendar_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    aircraftId: uuid("aircraft_id")
      .notNull()
      .references(() => aircraft.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    inbound: calendarConnectionInbound("inbound").notNull(),
    /** The iCal or JSON link we read (may contain the other system's secret: owner only). */
    feedUrl: text("feed_url"),
    /** SHA-256 of the API key the other system pushes with; the key itself is shown once. */
    apiKeyHash: text("api_key_hash").unique(),
    /** Last characters of the key, to recognise it. */
    apiKeyHint: text("api_key_hint"),
    /** Secret of the iCal link with our busy times for this system. */
    exportToken: text("export_token")
      .notNull()
      .unique()
      .default(sql`replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')`),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    /** Why the last sync failed (null when it worked). */
    lastSyncError: text("last_sync_error"),
    lastSyncCount: integer("last_sync_count"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("calendar_connections_aircraft_idx").on(t.aircraftId),
    check("calendar_connections_name", sql`char_length(btrim(${t.name})) between 1 and 80`),
    check(
      "calendar_connections_feed",
      sql`(${t.inbound} in ('ical', 'json')) = (${t.feedUrl} is not null)
        and (${t.feedUrl} is null or (${t.feedUrl} ~ '^https://' and char_length(${t.feedUrl}) <= 2000))`,
    ),
    check(
      "calendar_connections_key",
      sql`(${t.inbound} = 'push') = (${t.apiKeyHash} is not null)
        and (${t.apiKeyHash} is null or ${t.apiKeyHash} ~ '^[0-9a-f]{64}$')`,
    ),
    check("calendar_connections_export", sql`char_length(${t.exportToken}) >= 32`),
    check("calendar_connections_error", sql`char_length(${t.lastSyncError}) <= 500`),
  ],
).enableRLS();

export type CalendarEntry = typeof calendarEntries.$inferSelect;
export type CalendarConnection = typeof calendarConnections.$inferSelect;
export type CalendarConnectionInbound = (typeof calendarConnectionInbound.enumValues)[number];
export type CalendarEntryKind = (typeof calendarEntryKind.enumValues)[number];
