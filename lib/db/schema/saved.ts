// Favourite aircraft and saved searches with alerts (SRC-6). RLS:
// db/migrations/0061_saved_security.sql.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { aircraft } from "./aircraft";
import { users } from "./auth";

export const favouriteAircraft = pgTable(
  "favourite_aircraft",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    aircraftId: uuid("aircraft_id")
      .notNull()
      .references(() => aircraft.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.aircraftId] }),
    index("favourite_aircraft_aircraft_idx").on(t.aircraftId),
  ],
).enableRLS();

export const savedSearches = pgTable(
  "saved_searches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** The search's filters as a URL query string (lib/validation/search.ts). */
    query: text("query").notNull(),
    /** Tell the user about aircraft that newly match (in the app and by email). */
    alerts: boolean("alerts").notNull().default(true),
    lastAlertAt: timestamp("last_alert_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("saved_searches_user_idx").on(t.userId),
    check(
      "saved_searches_values",
      sql`char_length(btrim(${t.name})) between 1 and 80 and char_length(${t.query}) <= 1000`,
    ),
  ],
).enableRLS();

/** Aircraft a saved search has already shown or alerted about (trusted job only). */
export const savedSearchHits = pgTable(
  "saved_search_hits",
  {
    savedSearchId: uuid("saved_search_id")
      .notNull()
      .references(() => savedSearches.id, { onDelete: "cascade" }),
    aircraftId: uuid("aircraft_id")
      .notNull()
      .references(() => aircraft.id, { onDelete: "cascade" }),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.savedSearchId, t.aircraftId] })],
).enableRLS();

export type SavedSearch = typeof savedSearches.$inferSelect;
