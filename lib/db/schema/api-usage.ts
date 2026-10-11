// API request limits and usage (API-6). Trusted code only (lib/api/rate-limit.ts): RLS on,
// no access for app_user.
import {
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/** Requests per caller per minute, for the limits (rows older than an hour are removed). */
export const apiRateBuckets = pgTable(
  "api_rate_buckets",
  {
    /** tok:<hash of the token or key> or ip:<address>. */
    key: text("key").notNull(),
    minute: timestamp("minute", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.minute] }),
    index("api_rate_buckets_minute_idx").on(t.minute),
  ],
).enableRLS();

/** Requests per signed-in user or partner connection per day, for admins. */
export const apiUsageDaily = pgTable(
  "api_usage_daily",
  {
    day: date("day").notNull(),
    /** user or connection. */
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    requests: integer("requests").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.subjectType, t.subjectId] })],
).enableRLS();
