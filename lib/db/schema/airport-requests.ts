// Pilots' requests to an airfield (APT-2…5, 7; M16): an arrival and/or a departure with the
// services they need, picked from the airfield's own list (airport_services) plus free text.
// Airfields that require PPR answer them; the others confirm them at once (Zlati, 2026-10-13).
// RLS: db/migrations/0087_airport_request_security.sql.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { fuelType } from "./aircraft";
import { airportServiceCategory, airportServices, airportServiceUnit } from "./airport-profiles";
import { airportOperators } from "./airport-teams";
import { airports } from "./airports";
import { users } from "./auth";
import { bookings } from "./bookings";

export const airportRequestStatus = pgEnum("airport_request_status", [
  "pending",
  "approved",
  "declined",
  "cancelled",
]);
export const airportRequestPurpose = pgEnum("airport_request_purpose", [
  "private",
  "training",
  "business",
  "other",
]);

export const airportRequests = pgTable(
  "airport_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    airportIdent: text("airport_ident")
      .notNull()
      .references(() => airportOperators.airportIdent, { onDelete: "cascade" }),
    pilotId: uuid("pilot_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The rental this trip belongs to, if any (APT-7). */
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    registration: text("registration").notNull(),
    /** ICAO type designator (C172). */
    aircraftType: text("aircraft_type"),
    mtomKg: integer("mtom_kg"),
    /** UTC. At least one of arrival and departure. */
    arrivalAt: timestamp("arrival_at", { withTimezone: true }),
    fromIdent: text("from_ident").references(() => airports.ident, { onDelete: "restrict" }),
    departureAt: timestamp("departure_at", { withTimezone: true }),
    toIdent: text("to_ident").references(() => airports.ident, { onDelete: "restrict" }),
    pob: smallint("pob").notNull(),
    purpose: airportRequestPurpose("purpose").notNull().default("private"),
    /** Anything not on the airfield's list, in the pilot's words. */
    otherRequest: text("other_request"),
    status: airportRequestStatus("status").notNull().default("pending"),
    /** Confirmed at once because the airfield doesn't require PPR. */
    autoConfirmed: boolean("auto_confirmed").notNull().default(false),
    pprNumber: text("ppr_number"),
    conditions: text("conditions"),
    /** The airfield's note to the pilot (e.g. why it was declined). */
    operatorNote: text("operator_note"),
    answeredBy: uuid("answered_by").references(() => users.id, { onDelete: "set null" }),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    /** The airfield's currency when the request was sent (its prices are in it). */
    currency: text("currency").notNull().default("EUR"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("airport_requests_arrival_idx").on(t.airportIdent, t.arrivalAt),
    index("airport_requests_departure_idx").on(t.airportIdent, t.departureAt),
    index("airport_requests_pilot_idx").on(t.pilotId, t.createdAt),
    check(
      "airport_requests_times",
      sql`${t.arrivalAt} is not null or ${t.departureAt} is not null`,
    ),
    check(
      "airport_requests_order",
      sql`${t.arrivalAt} is null or ${t.departureAt} is null or ${t.departureAt} > ${t.arrivalAt}`,
    ),
    check(
      "airport_requests_registration",
      sql`${t.registration} ~ '^[A-Z0-9]{1,3}-?[A-Z0-9]{1,6}$'`,
    ),
    check("airport_requests_type", sql`${t.aircraftType} ~ '^[A-Z0-9]{2,4}$'`),
    check(
      "airport_requests_values",
      sql`${t.pob} between 1 and 20 and ${t.mtomKg} between 100 and 100000
        and char_length(${t.otherRequest}) <= 1000 and char_length(${t.pprNumber}) <= 40
        and char_length(${t.conditions}) <= 500 and char_length(${t.operatorNote}) <= 500`,
    ),
  ],
).enableRLS();

/**
 * The services asked for, with the airfield's name and price as they were when the request was
 * sent (filled in by the database from airport_services, never by the pilot).
 */
export const airportRequestItems = pgTable(
  "airport_request_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => airportRequests.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").references(() => airportServices.id, { onDelete: "set null" }),
    category: airportServiceCategory("category").notNull(),
    label: text("label"),
    fuelType: fuelType("fuel_type"),
    maxMtomKg: integer("max_mtom_kg"),
    unit: airportServiceUnit("unit").notNull(),
    price: numeric("price", { precision: 10, scale: 3, mode: "number" }),
    quantity: numeric("quantity", { precision: 8, scale: 1, mode: "number" }).notNull(),
  },
  (t) => [
    index("airport_request_items_request_idx").on(t.requestId),
    check("airport_request_items_quantity", sql`${t.quantity} > 0 and ${t.quantity} < 100000`),
  ],
).enableRLS();

export type AirportRequest = typeof airportRequests.$inferSelect;
export type AirportRequestItem = typeof airportRequestItems.$inferSelect;
