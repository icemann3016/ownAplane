// Airports on ownAplane (APT-1, M16): an airfield is run by a team; people join it by a claim an
// admin verifies, or by a manager's invitation. RLS: db/migrations/0080_airport_team_security.sql.
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { airports } from "./airports";
import { users } from "./auth";
import { documents } from "./documents";

/** unconfirmed = waiting for the email code; pending = waiting for an admin. */
export const airportClaimStatus = pgEnum("airport_claim_status", [
  "unconfirmed",
  "pending",
  "verified",
  "rejected",
  "withdrawn",
]);

/** Managers run the team and the profile; staff handle requests. */
export const airportMemberRole = pgEnum("airport_member_role", ["manager", "staff"]);

/** An airfield run on ownAplane: made when an admin verifies its first claim. Public. */
export const airportOperators = pgTable("airport_operators", {
  airportIdent: text("airport_ident")
    .primaryKey()
    .references(() => airports.ident, { onDelete: "cascade" }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
  verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
}).enableRLS();

export const airportMembers = pgTable(
  "airport_members",
  {
    airportIdent: text("airport_ident")
      .notNull()
      .references(() => airportOperators.airportIdent, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: airportMemberRole("role").notNull().default("staff"),
    addedBy: uuid("added_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.airportIdent, t.userId] }),
    index("airport_members_user_idx").on(t.userId),
  ],
).enableRLS();

/**
 * Someone asks to run an airfield, proven by a document (letter, operator certificate) or an
 * email address on the airport's own domain, confirmed with a code. An admin decides.
 */
export const airportClaims = pgTable(
  "airport_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    airportIdent: text("airport_ident")
      .notNull()
      .references(() => airports.ident, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Their job at the airport, e.g. "Airport manager". */
    position: text("position").notNull(),
    /** Anything the admin should know. */
    note: text("note"),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    email: text("email"),
    /** SHA-256 of the code sent to `email`; trusted code only. */
    emailCodeHash: text("email_code_hash"),
    emailCodeSentAt: timestamp("email_code_sent_at", { withTimezone: true }),
    emailCodeTries: integer("email_code_tries").notNull().default(0),
    /** How many codes were sent for this claim (capped, against inbox flooding). */
    emailCodesSent: integer("email_codes_sent").notNull().default(0),
    emailConfirmedAt: timestamp("email_confirmed_at", { withTimezone: true }),
    status: airportClaimStatus("status").notNull().default("pending"),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** Why it was rejected (shown to the claimant). */
    decisionNote: text("decision_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("airport_claims_user_idx").on(t.userId),
    index("airport_claims_status_idx").on(t.status, t.createdAt),
    // One open claim per person and airfield.
    uniqueIndex("airport_claims_open")
      .on(t.airportIdent, t.userId)
      .where(sql`${t.status} in ('unconfirmed', 'pending')`),
    check(
      "airport_claims_values",
      sql`char_length(btrim(${t.position})) between 1 and 80
        and char_length(${t.note}) <= 500
        and (${t.email} is null or (${t.email} ~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' and char_length(${t.email}) <= 200))
        and (${t.email} is null or ${t.documentId} is null)
        and char_length(${t.decisionNote}) <= 500`,
    ),
    check(
      "airport_claims_unconfirmed",
      sql`${t.status} <> 'unconfirmed' or (${t.email} is not null and ${t.emailConfirmedAt} is null)`,
    ),
  ],
).enableRLS();

/** A manager's invitation to join the team, sent by email; the link's token is stored hashed. */
export const airportInvites = pgTable(
  "airport_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    airportIdent: text("airport_ident")
      .notNull()
      .references(() => airportOperators.airportIdent, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: airportMemberRole("role").notNull().default("staff"),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '14 days'`),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: uuid("accepted_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    index("airport_invites_airport_idx").on(t.airportIdent),
    check(
      "airport_invites_values",
      sql`${t.email} = lower(${t.email}) and char_length(${t.email}) between 3 and 200
        and ${t.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
).enableRLS();

export type AirportClaim = typeof airportClaims.$inferSelect;
export type AirportMember = typeof airportMembers.$inferSelect;
