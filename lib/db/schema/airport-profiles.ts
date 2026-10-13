// An airfield's details for pilots (APT-1, M16 step 2). Runways and frequencies come from
// OurAirports' open data for every airfield (npm run airports:import) and are the team's to keep
// once the airfield has one; hours, closures and fees are the team's. All public to read; only
// the airfield's managers change them. RLS: db/migrations/0082_airport_profile_security.sql.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { airportOperators } from "./airport-teams";
import { airports } from "./airports";

export const runwaySurface = pgEnum("runway_surface", [
  "asphalt",
  "concrete",
  "grass",
  "gravel",
  "dirt",
  "sand",
  "water",
  "other",
]);

export const airportRunways = pgTable(
  "airport_runways",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    airportIdent: text("airport_ident")
      .notNull()
      .references(() => airports.ident, { onDelete: "cascade" }),
    /** e.g. "09/27". */
    designator: text("designator").notNull(),
    lengthM: integer("length_m"),
    widthM: integer("width_m"),
    surface: runwaySurface("surface").notNull().default("other"),
    lighted: boolean("lighted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("airport_runways_airport_idx").on(t.airportIdent),
    check(
      "airport_runways_values",
      sql`char_length(btrim(${t.designator})) between 1 and 20
        and (${t.lengthM} is null or ${t.lengthM} between 1 and 10000)
        and (${t.widthM} is null or ${t.widthM} between 1 and 200)`,
    ),
  ],
).enableRLS();

export const airportFrequencies = pgTable(
  "airport_frequencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    airportIdent: text("airport_ident")
      .notNull()
      .references(() => airports.ident, { onDelete: "cascade" }),
    /** e.g. TWR, INFO, A/G, AFIS. */
    type: text("type").notNull(),
    description: text("description"),
    mhz: numeric("mhz", { precision: 7, scale: 3, mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("airport_frequencies_airport_idx").on(t.airportIdent),
    check(
      "airport_frequencies_values",
      sql`char_length(btrim(${t.type})) between 1 and 12 and char_length(${t.description}) <= 80
        and ${t.mhz} > 0 and ${t.mhz} < 1000`,
    ),
  ],
).enableRLS();

/** Weekly opening hours in the airfield's local time (ISO weekday 1 = Monday). */
export const airportHours = pgTable(
  "airport_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    airportIdent: text("airport_ident")
      .notNull()
      .references(() => airportOperators.airportIdent, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(),
    opens: time("opens").notNull(),
    closes: time("closes").notNull(),
  },
  (t) => [
    index("airport_hours_airport_idx").on(t.airportIdent),
    check("airport_hours_values", sql`${t.weekday} between 1 and 7 and ${t.opens} < ${t.closes}`),
  ],
).enableRLS();

/** Days the airfield is closed (local dates, inclusive). */
export const airportClosures = pgTable(
  "airport_closures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    airportIdent: text("airport_ident")
      .notNull()
      .references(() => airportOperators.airportIdent, { onDelete: "cascade" }),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    note: text("note"),
  },
  (t) => [
    index("airport_closures_airport_idx").on(t.airportIdent),
    check(
      "airport_closures_values",
      sql`${t.endsOn} >= ${t.startsOn} and ${t.endsOn} - ${t.startsOn} <= 366
        and char_length(${t.note}) <= 200`,
    ),
  ],
).enableRLS();

export const airportFeeKind = pgEnum("airport_fee_kind", ["landing", "parking", "hangar", "other"]);
export const airportFeeUnit = pgEnum("airport_fee_unit", [
  "landing",
  "night",
  "day",
  "hour",
  "once",
]);

/** Fees shown to pilots (no payments through the app); amounts in the airfield's currency. */
export const airportFees = pgTable(
  "airport_fees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    airportIdent: text("airport_ident")
      .notNull()
      .references(() => airportOperators.airportIdent, { onDelete: "cascade" }),
    kind: airportFeeKind("kind").notNull(),
    label: text("label"),
    /** Applies to aircraft up to this MTOM; null = any weight. */
    maxMtomKg: integer("max_mtom_kg"),
    amount: numeric("amount", { precision: 10, scale: 2, mode: "number" }).notNull(),
    unit: airportFeeUnit("unit").notNull(),
  },
  (t) => [
    index("airport_fees_airport_idx").on(t.airportIdent),
    check(
      "airport_fees_values",
      sql`char_length(${t.label}) <= 80 and ${t.amount} >= 0 and ${t.amount} < 100000
        and (${t.maxMtomKg} is null or ${t.maxMtomKg} between 1 and 100000)`,
    ),
  ],
).enableRLS();

export type AirportRunway = typeof airportRunways.$inferSelect;
export type AirportFrequency = typeof airportFrequencies.$inferSelect;
export type AirportFee = typeof airportFees.$inferSelect;
