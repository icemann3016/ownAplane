// Plans and payments (SUB-1…10) and AI reading credits. The plan a user has comes from a paid
// subscription (kept in step with the payment provider), plan grants (admins, founding owners)
// and the beta switch: public.plan_of() picks the highest. Payments are in test mode until a
// provider is connected (lib/billing). Trusted code writes; users read only their own rows
// (RLS in 0071_billing_security).
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";

export const planName = pgEnum("plan_name", ["free", "pilot", "owner", "fleet"]);
export const billingInterval = pgEnum("billing_interval", ["month", "year"]);
export const subscriptionStatus = pgEnum("subscription_status", ["active", "past_due", "ended"]);

/** The user's paid subscription (one at a time), as the payment provider last reported it. */
export const subscriptions = pgTable(
  "subscriptions",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "test" (no money moves) or the provider's name. */
    provider: text("provider").notNull(),
    providerSubscriptionId: text("provider_subscription_id").notNull().unique(),
    plan: planName("plan").notNull(),
    interval: billingInterval("interval").notNull(),
    status: subscriptionStatus("status").notNull(),
    /** What each period costs, incl. VAT. */
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull().default("EUR"),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    /** A downgrade or yearly → monthly switch that starts at the next renewal. */
    scheduledPlan: planName("scheduled_plan"),
    scheduledInterval: billingInterval("scheduled_interval"),
    /** Payment failed: the plan stays until then (SUB-6), then the subscription ends. */
    graceUntil: timestamp("grace_until", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** Test mode only: the next payment fails, to try what happens. */
    testFailNext: boolean("test_fail_next").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("subscriptions_paid_plan", sql`${t.plan} <> 'free'`),
    check("subscriptions_period", sql`${t.currentPeriodEnd} > ${t.currentPeriodStart}`),
    check("subscriptions_price", sql`${t.priceCents} >= 0`),
  ],
).enableRLS();

export const planGrantReason = pgEnum("plan_grant_reason", ["admin", "founding"]);

/** A plan given without payment: by an admin (SUB-7) or to a founding owner (SUB-9). */
export const planGrants = pgTable(
  "plan_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    plan: planName("plan").notNull(),
    reason: planGrantReason("reason").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    /** Null: no end yet (founding grants get theirs when the beta ends). */
    endsAt: timestamp("ends_at", { withTimezone: true }),
    grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("plan_grants_user_idx").on(t.userId),
    uniqueIndex("plan_grants_one_founding")
      .on(t.userId)
      .where(sql`${t.reason} = 'founding'`),
    check("plan_grants_paid_plan", sql`${t.plan} <> 'free'`),
    check("plan_grants_note", sql`char_length(${t.note}) <= 500`),
  ],
).enableRLS();

/** One row: the beta switch and the founding-owner cut-off, changed by admins. */
export const billingSettings = pgTable(
  "billing_settings",
  {
    id: boolean("id").primaryKey().default(true),
    /** While on (and before beta_ends_at), everyone has the Owner plan's features. */
    beta: boolean("beta").notNull().default(true),
    betaEndsAt: timestamp("beta_ends_at", { withTimezone: true }),
    /** After the beta, owners listing their first aircraft until this day are founding owners. */
    foundingCutoff: date("founding_cutoff"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("billing_settings_single", sql`${t.id}`)],
).enableRLS();

/** A checkout the user started: a plan or a credit pack, and what became of it. */
export const billingCheckouts = pgTable(
  "billing_checkouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerCheckoutId: text("provider_checkout_id"),
    /** { type: "plan", plan, interval } or { type: "credits", pack }. */
    item: jsonb("item").$type<CheckoutItem>().notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("EUR"),
    /** open, paid, failed or canceled. */
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("billing_checkouts_user_idx").on(t.userId, t.createdAt)],
).enableRLS();

export type CheckoutItem =
  | { type: "plan"; plan: "pilot" | "owner" | "fleet"; interval: "month" | "year" }
  | { type: "credits"; pack: string };

/** Payments (and failed attempts), for the user's billing history. */
export const billingPayments = pgTable(
  "billing_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerPaymentId: text("provider_payment_id"),
    /** plan or credits. */
    kind: text("kind").notNull(),
    /** What was paid for, as a key with parameters: { key, plan?, interval?, credits? }. */
    details: jsonb("details").$type<Record<string, string | number>>().notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("EUR"),
    /** paid, failed or refunded. */
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("billing_payments_user_idx").on(t.userId, t.createdAt)],
).enableRLS();

/** Everything the payment provider reported (and test-mode events), once each. Trusted only. */
export const billingEvents = pgTable(
  "billing_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    type: text("type").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("billing_events_once").on(t.provider, t.eventId)],
).enableRLS();

/**
 * AI reading credits as a ledger: "credits" (welcome, bought, given by admins) never expire;
 * "allowance" is the plan's monthly reads, counted per UTC month. One credit reads one
 * document or one logbook spread.
 */
export const aiCreditEntries = pgTable(
  "ai_credit_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pool: text("pool").notNull(),
    /** welcome, purchase, admin, read or refund. */
    reason: text("reason").notNull(),
    delta: integer("delta").notNull(),
    paymentId: uuid("payment_id").references(() => billingPayments.id, { onDelete: "set null" }),
    /** A refund: the read it gives back. */
    refundOf: uuid("refund_of"),
    adminId: uuid("admin_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ai_credit_entries_user_idx").on(t.userId, t.createdAt),
    uniqueIndex("ai_credit_entries_one_welcome")
      .on(t.userId)
      .where(sql`${t.reason} = 'welcome'`),
    uniqueIndex("ai_credit_entries_one_refund")
      .on(t.refundOf)
      .where(sql`${t.refundOf} is not null`),
    check("ai_credit_entries_pool", sql`${t.pool} in ('credits', 'allowance')`),
    check(
      "ai_credit_entries_reason",
      sql`${t.reason} in ('welcome', 'purchase', 'admin', 'read', 'refund')`,
    ),
  ],
).enableRLS();

export type Subscription = typeof subscriptions.$inferSelect;
export type PlanGrant = typeof planGrants.$inferSelect;
export type PlanName = (typeof planName.enumValues)[number];
export type BillingInterval = (typeof billingInterval.enumValues)[number];
