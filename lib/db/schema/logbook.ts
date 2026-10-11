// The pilot's logbook in the EASA format (LOG-1…9, AMC1 FCL.050). Durations in minutes, times in
// UTC, places as written (codes outside our airport list are allowed). Certified entries are
// never changed or deleted: a correction is a new entry (corrects_id) that supersedes the old one
// when certified (database functions and a guard trigger in 0067_logbook_security).
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { flightLegs } from "./flight-logs";

export const logbookEntryKind = pgEnum("logbook_entry_kind", ["flight", "fstd", "brought_forward"]);
export const logbookEntryStatus = pgEnum("logbook_entry_status", [
  "draft",
  "certified",
  "superseded",
]);
export const logbookEntrySource = pgEnum("logbook_entry_source", ["manual", "ownaplane", "scan"]);

const minutes = (name: string) => integer(name);

export const logbookEntries = pgTable(
  "logbook_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pilotId: uuid("pilot_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: logbookEntryKind("kind").notNull().default("flight"),
    status: logbookEntryStatus("status").notNull().default("draft"),
    source: logbookEntrySource("source").notNull().default("manual"),
    /** Flight date; FSTD session date; for totals brought forward: the date they're as of. */
    date: date("date").notNull(),
    departurePlace: text("departure_place"),
    departureTime: time("departure_time"),
    arrivalPlace: text("arrival_place"),
    arrivalTime: time("arrival_time"),
    /** Make, model and variant as the pilot writes it, e.g. "C172S" or "Cessna 172 S". */
    aircraftType: text("aircraft_type"),
    registration: text("registration"),
    /** Single-pilot time on single-engine / multi-engine aircraft, and multi-pilot time. */
    seMinutes: minutes("se_minutes"),
    meMinutes: minutes("me_minutes"),
    mpMinutes: minutes("mp_minutes"),
    totalMinutes: minutes("total_minutes"),
    picName: text("pic_name"),
    landingsDay: smallint("landings_day"),
    landingsNight: smallint("landings_night"),
    /** Operational condition time. */
    nightMinutes: minutes("night_minutes"),
    ifrMinutes: minutes("ifr_minutes"),
    /** Pilot function time (PIC includes solo, SPIC and PICUS). */
    picMinutes: minutes("pic_minutes"),
    copilotMinutes: minutes("copilot_minutes"),
    dualMinutes: minutes("dual_minutes"),
    instructorMinutes: minutes("instructor_minutes"),
    /** FSTD session: device type and session time. */
    fstdType: text("fstd_type"),
    fstdMinutes: minutes("fstd_minutes"),
    remarks: text("remarks"),
    /** ownAplane rentals (LOG-4): the flight-log leg it came from. */
    flightLegId: uuid("flight_leg_id")
      .unique()
      .references(() => flightLegs.id, { onDelete: "set null" }),
    /** The certified entry this one corrects (LOG-2). */
    correctsId: uuid("corrects_id").references((): AnyPgColumn => logbookEntries.id, {
      onDelete: "set null",
    }),
    certifiedAt: timestamp("certified_at", { withTimezone: true }),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    /** Struck through without a replacement: why. */
    voidReason: text("void_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("logbook_entries_pilot_idx").on(t.pilotId, t.date),
    index("logbook_entries_corrects_idx").on(t.correctsId),
    check(
      "logbook_entries_minutes",
      sql`least(${t.seMinutes}, ${t.meMinutes}, ${t.mpMinutes}, ${t.totalMinutes},
        ${t.nightMinutes}, ${t.ifrMinutes}, ${t.picMinutes}, ${t.copilotMinutes},
        ${t.dualMinutes}, ${t.instructorMinutes}, ${t.fstdMinutes}) >= 0`,
    ),
    check(
      "logbook_entries_flight_minutes",
      sql`${t.kind} = 'brought_forward' or greatest(${t.totalMinutes}, ${t.fstdMinutes}) <= 1440`,
    ),
    check(
      "logbook_entries_landings",
      sql`least(${t.landingsDay}, ${t.landingsNight}) >= 0 and greatest(${t.landingsDay}, ${t.landingsNight}) <= 32000`,
    ),
    check(
      "logbook_entries_texts",
      sql`char_length(coalesce(${t.departurePlace}, '')) <= 60
        and char_length(coalesce(${t.arrivalPlace}, '')) <= 60
        and char_length(coalesce(${t.aircraftType}, '')) <= 60
        and char_length(coalesce(${t.registration}, '')) <= 20
        and char_length(coalesce(${t.picName}, '')) <= 100
        and char_length(coalesce(${t.fstdType}, '')) <= 60
        and char_length(coalesce(${t.remarks}, '')) <= 1000
        and char_length(coalesce(${t.voidReason}, '')) <= 500`,
    ),
  ],
).enableRLS();

export type LogbookEntry = typeof logbookEntries.$inferSelect;
export type LogbookEntryKind = (typeof logbookEntryKind.enumValues)[number];
