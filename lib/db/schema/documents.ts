// Uploaded private files (licences, medicals; later aircraft documents). The file itself is in
// private storage; access goes through app/api/documents/[id] which checks permissions.
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("documents_owner_id_idx").on(t.ownerId)],
).enableRLS();

/** Audit log of admin actions (document views, verifications, suspensions…). */
export const adminActions = pgTable(
  "admin_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminId: uuid("admin_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("admin_actions_target_idx").on(t.targetType, t.targetId)],
).enableRLS();

/**
 * Documents read by the AI (VER-9, LOG-6): who, what and the outcome, never the content. Used for
 * the daily limit per user and for admins. Trusted code only (no access for app_user).
 */
export const documentReads = pgTable(
  "document_reads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    /** licence, medical or logbook. */
    kind: text("kind").notNull(),
    /** ok, unreadable or failed. */
    outcome: text("outcome").notNull(),
    pages: integer("pages").notNull().default(1),
    /** When the user agreed to send it to the AI provider (medicals). */
    consentAt: timestamp("consent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("document_reads_user_idx").on(t.userId, t.createdAt)],
).enableRLS();

export type Document = typeof documents.$inferSelect;
