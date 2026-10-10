// Flight log of a booking (M6, BKG-7, BKG-12…14; plan §4.8). A record between pilot and owner,
// not an official journey or technical log. Stored in UTC and SI units (litres, minutes).
// RLS, status functions and checks: db/migrations/0021_flight_log_security.sql.
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { aircraft, fuelType } from "./aircraft";
import { airports } from "./airports";
import { users } from "./auth";
import { bookings } from "./bookings";
import { documents } from "./documents";

export const flightLogStatus = pgEnum("flight_log_status", [
  "draft",
  "submitted",
  "correction_requested",
  "confirmed",
]);

/** Why the meters moved between two rentals, as the owner explains it. */
export const meterGapReason = pgEnum("meter_gap_reason", [
  "outside",
  "maintenance",
  "meter_replaced",
  "other",
]);

const meter = (name: string) => numeric(name, { precision: 8, scale: 2, mode: "number" });
const litres = (name: string) => numeric(name, { precision: 6, scale: 1, mode: "number" });

export const flightLogs = pgTable(
  "flight_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: "cascade" }),
    status: flightLogStatus("status").notNull().default("draft"),
    // Check-out (before the first flight)
    hobbsStart: meter("hobbs_start"),
    tachStart: meter("tach_start"),
    fuelStartL: litres("fuel_start_l"),
    oilStartL: litres("oil_start_l"),
    checkoutPhotoId: uuid("checkout_photo_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    checkedOutAt: timestamp("checked_out_at", { withTimezone: true }).notNull().defaultNow(),
    /** With passengers: the pilot confirmed the 90-day rule (FCL.060) at check-out. */
    recencyConfirmedAt: timestamp("recency_confirmed_at", { withTimezone: true }),
    // Result (set when the owner confirms)
    flownMinutes: integer("flown_minutes"),
    amountDue: numeric("amount_due", { precision: 10, scale: 2, mode: "number" }),
    fuelAdjustment: numeric("fuel_adjustment", { precision: 10, scale: 2, mode: "number" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    correctionNote: text("correction_note"),
    /** The owner's explanation of a meter gap before this rental (outside, maintenance…). */
    meterGapReason: meterGapReason("meter_gap_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "flight_logs_readings",
      sql`${t.hobbsStart} >= 0 and ${t.tachStart} >= 0 and ${t.fuelStartL} >= 0
        and ${t.oilStartL} >= 0`,
    ),
    check("flight_logs_note", sql`char_length(${t.correctionNote}) <= 500`),
  ],
).enableRLS();

export const flightLegs = pgTable(
  "flight_legs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flightLogId: uuid("flight_log_id")
      .notNull()
      .references(() => flightLogs.id, { onDelete: "cascade" }),
    seq: smallint("seq").notNull(),
    fromIdent: text("from_ident")
      .notNull()
      .references(() => airports.ident),
    toIdent: text("to_ident")
      .notNull()
      .references(() => airports.ident),
    blockOff: timestamp("block_off", { withTimezone: true }).notNull(),
    engineStart: timestamp("engine_start", { withTimezone: true }).notNull(),
    takeoffAt: timestamp("takeoff_at", { withTimezone: true }),
    landingAt: timestamp("landing_at", { withTimezone: true }),
    engineStop: timestamp("engine_stop", { withTimezone: true }).notNull(),
    blockOn: timestamp("block_on", { withTimezone: true }).notNull(),
    landings: smallint("landings").notNull().default(1),
    hobbsStart: meter("hobbs_start"),
    hobbsEnd: meter("hobbs_end"),
    tachStart: meter("tach_start"),
    tachEnd: meter("tach_end"),
    // Fuel and oil on board before and after (BKG-13, BKG-14)
    fuelBeforeL: litres("fuel_before_l"),
    fuelAfterL: litres("fuel_after_l"),
    oilBeforeL: litres("oil_before_l"),
    oilAfterL: litres("oil_after_l"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("flight_legs_seq").on(t.flightLogId, t.seq),
    index("flight_legs_log_idx").on(t.flightLogId),
    // Sanity checks from plan §4.8: times in the order they happen (engine start ≤ block off <
    // take-off < landing < block on ≤ engine stop, at most 12 h), meters move on, fuel goes down
    // and oil doesn't go up during a leg (added fuel/oil are flight_uplifts). Added NOT VALID in
    // 0051, so legs saved under the earlier rules stay readable.
    check(
      "flight_legs_times",
      sql`${t.engineStart} <= ${t.blockOff} and ${t.blockOff} < ${t.blockOn}
        and ${t.blockOn} <= ${t.engineStop}
        and (${t.takeoffAt} is null or (${t.blockOff} < ${t.takeoffAt}
          and ${t.takeoffAt} < coalesce(${t.landingAt}, ${t.blockOn})))
        and (${t.landingAt} is null or (${t.blockOff} < ${t.landingAt}
          and ${t.landingAt} < ${t.blockOn}))
        and ${t.engineStop} - ${t.engineStart} <= interval '12 hours'`,
    ),
    check(
      "flight_legs_meters",
      sql`(${t.hobbsEnd} is null or ${t.hobbsStart} is null or ${t.hobbsEnd} > ${t.hobbsStart})
        and (${t.tachEnd} is null or ${t.tachStart} is null or ${t.tachEnd} > ${t.tachStart})
        and ${t.hobbsStart} >= 0 and ${t.tachStart} >= 0`,
    ),
    check(
      "flight_legs_fuel_oil",
      sql`(${t.fuelAfterL} is null or ${t.fuelBeforeL} is null or ${t.fuelAfterL} < ${t.fuelBeforeL})
        and (${t.oilAfterL} is null or ${t.oilBeforeL} is null or ${t.oilAfterL} <= ${t.oilBeforeL})`,
    ),
    check(
      "flight_legs_amounts",
      sql`${t.landings} between 1 and 99 and ${t.fuelBeforeL} >= 0 and ${t.fuelAfterL} >= 0
        and ${t.oilBeforeL} >= 0 and ${t.oilAfterL} >= 0 and ${t.seq} between 1 and 50`,
    ),
  ],
).enableRLS();

export const upliftKind = pgEnum("uplift_kind", ["fuel", "oil"]);
export const upliftPayer = pgEnum("uplift_payer", ["pilot", "owner"]);

// Fuel and oil added during the rental (BKG-13, BKG-14). The price is in the booking's currency;
// who paid decides how it counts in the amount due (lib/domain/flight-log.ts).
export const flightUplifts = pgTable(
  "flight_uplifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flightLogId: uuid("flight_log_id")
      .notNull()
      .references(() => flightLogs.id, { onDelete: "cascade" }),
    kind: upliftKind("kind").notNull(),
    airportIdent: text("airport_ident")
      .notNull()
      .references(() => airports.ident),
    quantityL: litres("quantity_l").notNull(),
    fuelType: fuelType("fuel_type"),
    oilGrade: text("oil_grade"),
    price: numeric("price", { precision: 10, scale: 2, mode: "number" }),
    paidBy: upliftPayer("paid_by").notNull(),
    receiptId: uuid("receipt_id").references(() => documents.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("flight_uplifts_log_idx").on(t.flightLogId),
    check(
      "flight_uplifts_values",
      sql`${t.quantityL} > 0 and ${t.quantityL} <= 5000 and (${t.price} is null or ${t.price} >= 0)
        and char_length(${t.oilGrade}) <= 40
        and (${t.kind} = 'fuel' or ${t.fuelType} is null)
        and (${t.kind} = 'oil' or ${t.oilGrade} is null)`,
    ),
  ],
).enableRLS();

export const remarkKind = pgEnum("remark_kind", ["aircraft", "weather", "airfield"]);

// Remarks and PIREPs after a flight (BKG-15): notes on the aircraft that aren't defects, and on
// the weather or an airfield. The owner can mark an aircraft remark as a known item, which later
// renters see (known_items_for_aircraft()) until the owner marks it fixed.
export const flightRemarks = pgTable(
  "flight_remarks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flightLogId: uuid("flight_log_id")
      .notNull()
      .references(() => flightLogs.id, { onDelete: "cascade" }),
    // Set by a trigger from the log's booking, for the aircraft's history.
    aircraftId: uuid("aircraft_id")
      .notNull()
      .references(() => aircraft.id, { onDelete: "cascade" }),
    kind: remarkKind("kind").notNull(),
    airportIdent: text("airport_ident").references(() => airports.ident),
    body: text("body").notNull(),
    knownSince: timestamp("known_since", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("flight_remarks_log_idx").on(t.flightLogId),
    index("flight_remarks_aircraft_idx").on(t.aircraftId, t.createdAt),
    check(
      "flight_remarks_values",
      sql`char_length(btrim(${t.body})) between 1 and 1000
        and (${t.knownSince} is null or ${t.kind} = 'aircraft')`,
    ),
  ],
).enableRLS();

/**
 * Hobbs/tach readings the owner records between rentals (after flying outside ownAplane,
 * maintenance or a meter change): the starting point for the next rental's meter check.
 */
export const meterReadings = pgTable(
  "meter_readings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    aircraftId: uuid("aircraft_id")
      .notNull()
      .references(() => aircraft.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
    hobbs: meter("hobbs"),
    tach: meter("tach"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("meter_readings_aircraft_idx").on(t.aircraftId, t.readAt),
    check(
      "meter_readings_values",
      sql`(${t.hobbs} is not null or ${t.tach} is not null) and ${t.hobbs} >= 0
        and ${t.tach} >= 0 and char_length(${t.note}) <= 200`,
    ),
  ],
).enableRLS();

export type FlightLog = typeof flightLogs.$inferSelect;
export type MeterReading = typeof meterReadings.$inferSelect;
export type MeterGapReason = (typeof meterGapReason.enumValues)[number];
export type FlightLeg = typeof flightLegs.$inferSelect;
export type FlightUplift = typeof flightUplifts.$inferSelect;
export type FlightRemark = typeof flightRemarks.$inferSelect;
export type FlightLogStatus = (typeof flightLogStatus.enumValues)[number];
