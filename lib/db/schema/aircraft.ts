// Aircraft listings (M4): the aircraft, its photos, documents and rental requirements.
// Owners edit their own aircraft; everyone may read listed ones. RLS, grants and triggers:
// db/migrations/0008_aircraft_security.sql. Quantities are stored in SI units (litres, kg).
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
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { airports } from "./airports";
import { users } from "./auth";
import { documents } from "./documents";
import { licenceType, verificationStatus } from "./pilots";

export const aircraftCategory = pgEnum("aircraft_category", [
  "aeroplane",
  "tmg",
  "ultralight",
  "helicopter",
]);
export const fuelType = pgEnum("fuel_type", ["avgas_100ll", "ul91", "mogas", "jet_a1"]);
export const priceBasis = pgEnum("price_basis", ["wet", "dry"]);
export const timeBasis = pgEnum("time_basis", ["hobbs", "tach", "block"]);
export const oilUnit = pgEnum("oil_unit", ["qt", "l"]);
export const transponderType = pgEnum("transponder_type", ["none", "mode_c", "mode_s", "adsb_out"]);
export const cancellationPolicy = pgEnum("cancellation_policy", ["flexible", "moderate", "strict"]);
export const aircraftStatus = pgEnum("aircraft_status", [
  "draft",
  "listed",
  "paused",
  "unlisted",
  "grounded",
]);
export const aircraftDocumentKind = pgEnum("aircraft_document_kind", [
  "cofa",
  "arc",
  "insurance",
  "poh",
  "checklist",
  "weight_balance",
]);

export const aircraft = pgTable(
  "aircraft",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Upper case, e.g. LZ-ABC, D-EFGH, G-ABCD */
    registration: text("registration").notNull(),
    manufacturer: text("manufacturer").notNull(),
    model: text("model").notNull(),
    /** ICAO type designator (C172, P28A…): matches pilots' hours on type. */
    typeDesignator: text("type_designator").notNull(),
    year: smallint("year"),
    category: aircraftCategory("category").notNull().default("aeroplane"),
    seats: smallint("seats").notNull(),
    engine: text("engine"),
    fuelType: fuelType("fuel_type").notNull(),
    fuelBurnLph: numeric("fuel_burn_lph", { precision: 5, scale: 1, mode: "number" }),
    cruiseKt: smallint("cruise_kt"),
    usefulLoadKg: smallint("useful_load_kg"),
    /** Maximum take-off mass: LAPL(A) holders may fly up to 2,000 kg (FCL.105.A). */
    mtomKg: smallint("mtom_kg"),
    enduranceH: numeric("endurance_h", { precision: 3, scale: 1, mode: "number" }),
    // Equipment (LST-2)
    avionics: text("avionics"),
    autopilot: boolean("autopilot").notNull().default(false),
    transponder: transponderType("transponder").notNull().default("mode_s"),
    nightVfr: boolean("night_vfr").notNull().default(false),
    ifr: boolean("ifr").notNull().default(false),
    description: text("description"),
    homeAirportIdent: text("home_airport_ident").references(() => airports.ident, {
      onDelete: "restrict",
    }),
    // Pricing (LST-5)
    pricePerHour: numeric("price_per_hour", { precision: 8, scale: 2, mode: "number" }),
    weekendPricePerHour: numeric("weekend_price_per_hour", {
      precision: 8,
      scale: 2,
      mode: "number",
    }),
    currency: text("currency").notNull().default("EUR"),
    priceBasis: priceBasis("price_basis").notNull().default("wet"),
    timeBasis: timeBasis("time_basis").notNull().default("hobbs"),
    minHoursPerDay: numeric("min_hours_per_day", { precision: 3, scale: 1, mode: "number" }),
    oilUnit: oilUnit("oil_unit").notNull().default("qt"),
    cancellationPolicy: cancellationPolicy("cancellation_policy").notNull().default("moderate"),
    status: aircraftStatus("status").notNull().default("draft"),
    /** Set by the system (daily job) when a required document expired; cleared on re-listing. */
    unlistedReason: text("unlisted_reason"),
    /** When it was last listed (set by the status trigger); the plan limit keeps the oldest. */
    listedAt: timestamp("listed_at", { withTimezone: true }),
    /** Shown first in search, labelled "Featured" (SUB-10; as many as the plan allows). */
    featured: boolean("featured").notNull().default(false),
    ratingAvg: numeric("rating_avg", { precision: 3, scale: 2, mode: "number" }),
    ratingCount: integer("rating_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("aircraft_owner_id_idx").on(t.ownerId),
    index("aircraft_home_airport_idx").on(t.homeAirportIdent),
    index("aircraft_status_idx").on(t.status),
    // Drafts don't block the real owner of a registration; anything past draft is unique.
    uniqueIndex("aircraft_registration_unique")
      .on(t.registration)
      .where(sql`${t.status} <> 'draft'`),
    check("aircraft_registration", sql`${t.registration} ~ '^[A-Z0-9]{1,3}-?[A-Z0-9]{1,6}$'`),
    check(
      "aircraft_names",
      sql`char_length(btrim(${t.manufacturer})) between 1 and 60
        and char_length(btrim(${t.model})) between 1 and 60
        and char_length(${t.engine}) <= 80 and char_length(${t.avionics}) <= 300`,
    ),
    check("aircraft_type_designator", sql`${t.typeDesignator} ~ '^[A-Z0-9]{2,4}$'`),
    check("aircraft_year", sql`${t.year} between 1903 and 2100`),
    check("aircraft_seats", sql`${t.seats} between 1 and 20`),
    check(
      "aircraft_performance",
      sql`${t.fuelBurnLph} > 0 and ${t.cruiseKt} > 0 and ${t.usefulLoadKg} > 0
        and ${t.enduranceH} > 0`,
    ),
    check("aircraft_mtom", sql`${t.mtomKg} between 100 and 20000`),
    check("aircraft_description", sql`char_length(${t.description}) <= 4000`),
    check(
      "aircraft_prices",
      sql`${t.pricePerHour} > 0 and ${t.weekendPricePerHour} > 0
        and ${t.minHoursPerDay} > 0 and ${t.minHoursPerDay} <= 12`,
    ),
    check("aircraft_currency", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
).enableRLS();

/** Public photos (storage kind "public"); the lowest sort_order is the cover. */
export const aircraftPhotos = pgTable(
  "aircraft_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    aircraftId: uuid("aircraft_id")
      .notNull()
      .references(() => aircraft.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
    width: integer("width"),
    height: integer("height"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("aircraft_photos_aircraft_idx").on(t.aircraftId, t.sortOrder)],
).enableRLS();

/**
 * Aircraft documents. CofA, ARC and insurance are verified by an admin (status); POH extracts,
 * checklists and weight & balance are reference documents for renters (no status).
 */
export const aircraftDocuments = pgTable(
  "aircraft_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    aircraftId: uuid("aircraft_id")
      .notNull()
      .references(() => aircraft.id, { onDelete: "cascade" }),
    kind: aircraftDocumentKind("kind").notNull(),
    /** Optional name for reference documents, e.g. "POH section 4: normal procedures". */
    title: text("title"),
    // Uploads are only deleted when unused, or with the whole account.
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    expiresOn: date("expires_on"),
    status: verificationStatus("status"),
    rejectionReason: text("rejection_reason"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("aircraft_documents_aircraft_idx").on(t.aircraftId),
    check(
      "aircraft_documents_status",
      sql`(${t.kind} in ('cofa', 'arc', 'insurance')) = (${t.status} is not null)`,
    ),
    check(
      "aircraft_documents_expiry",
      sql`${t.kind} not in ('arc', 'insurance') or ${t.expiresOn} is not null`,
    ),
    check("aircraft_documents_title", sql`char_length(${t.title}) <= 100`),
  ],
).enableRLS();

/**
 * Pilots whose checkout flight on the aircraft the owner has recorded (BKG-10); they no longer
 * need one before renting it. RLS: db/migrations/0034_checkout_security.sql.
 */
export const aircraftCheckouts = pgTable(
  "aircraft_checkouts",
  {
    aircraftId: uuid("aircraft_id")
      .notNull()
      .references(() => aircraft.id, { onDelete: "cascade" }),
    pilotId: uuid("pilot_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    doneOn: date("done_on").notNull(),
    instructor: text("instructor"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.aircraftId, t.pilotId] }),
    check(
      "aircraft_checkouts_text",
      sql`char_length(${t.instructor}) <= 100 and char_length(${t.note}) <= 500`,
    ),
  ],
).enableRLS();

/** Who may rent the aircraft (RAT-6, RAT-7). One row per aircraft; empty = no requirement. */
export const rentalRequirements = pgTable(
  "rental_requirements",
  {
    aircraftId: uuid("aircraft_id")
      .primaryKey()
      .references(() => aircraft.id, { onDelete: "cascade" }),
    /** Minimum average rating of pilots who have reviews, e.g. 4.0 */
    minPilotRating: numeric("min_pilot_rating", { precision: 2, scale: 1, mode: "number" }),
    /** Pilots without reviews yet may request… */
    allowUnrated: boolean("allow_unrated").notNull().default(true),
    /** …but only after a checkout flight with an instructor. */
    unratedNeedsCheckout: boolean("unrated_needs_checkout").notNull().default(false),
    /** Every pilot new to this aircraft needs a checkout flight with an instructor (BKG-10). */
    checkoutFirstRental: boolean("checkout_first_rental").notNull().default(false),
    /**
     * Requests are accepted at once from pilots who meet every requirement (no conditions left)
     * and have completed a rental of this aircraft before (BKG-4).
     */
    instantBooking: boolean("instant_booking").notNull().default(false),
    /** Accepted licences; empty = any. */
    licenceTypes: licenceType("licence_types")
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** Class ratings / privileges (SEP_LAND, NIGHT…) and type ratings (ICAO) the pilot needs. */
    requiredRatings: text("required_ratings")
      .array()
      .notNull()
      .default(sql`'{}'`),
    minTotalHours: numeric("min_total_hours", { precision: 6, scale: 1, mode: "number" }),
    minTypeHours: numeric("min_type_hours", { precision: 6, scale: 1, mode: "number" }),
    min90DaysHours: numeric("min_90_days_hours", { precision: 5, scale: 1, mode: "number" }),
    minAge: smallint("min_age"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("rental_requirements_rating", sql`${t.minPilotRating} between 1 and 5`),
    check(
      "rental_requirements_hours",
      sql`${t.minTotalHours} >= 0 and ${t.minTypeHours} >= 0 and ${t.min90DaysHours} >= 0`,
    ),
    check("rental_requirements_age", sql`${t.minAge} between 16 and 99`),
    check("rental_requirements_checkout", sql`not ${t.unratedNeedsCheckout} or ${t.allowUnrated}`),
    check("rental_requirements_ratings", sql`cardinality(${t.requiredRatings}) <= 10`),
  ],
).enableRLS();

export type Aircraft = typeof aircraft.$inferSelect;
export type AircraftPhoto = typeof aircraftPhotos.$inferSelect;
export type AircraftDocument = typeof aircraftDocuments.$inferSelect;
export type RentalRequirements = typeof rentalRequirements.$inferSelect;
export type AircraftStatus = (typeof aircraftStatus.enumValues)[number];
export type AircraftCategory = (typeof aircraftCategory.enumValues)[number];
export type AircraftDocumentKind = (typeof aircraftDocumentKind.enumValues)[number];
