CREATE TYPE "public"."billing_interval" AS ENUM('month', 'year');--> statement-breakpoint
CREATE TYPE "public"."plan_grant_reason" AS ENUM('admin', 'founding');--> statement-breakpoint
CREATE TYPE "public"."plan_name" AS ENUM('free', 'pilot', 'owner', 'fleet');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'past_due', 'ended');--> statement-breakpoint
CREATE TABLE "ai_credit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pool" text NOT NULL,
	"reason" text NOT NULL,
	"delta" integer NOT NULL,
	"payment_id" uuid,
	"refund_of" uuid,
	"admin_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_credit_entries_pool" CHECK ("ai_credit_entries"."pool" in ('credits', 'allowance')),
	CONSTRAINT "ai_credit_entries_reason" CHECK ("ai_credit_entries"."reason" in ('welcome', 'purchase', 'admin', 'read', 'refund'))
);
--> statement-breakpoint
ALTER TABLE "ai_credit_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "billing_checkouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_checkout_id" text,
	"item" jsonb NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "billing_checkouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"user_id" uuid,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "billing_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_payment_id" text,
	"kind" text NOT NULL,
	"details" jsonb NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "billing_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"beta" boolean DEFAULT true NOT NULL,
	"beta_ends_at" timestamp with time zone,
	"founding_cutoff" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_settings_single" CHECK ("billing_settings"."id")
);
--> statement-breakpoint
ALTER TABLE "billing_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plan_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan" "plan_name" NOT NULL,
	"reason" "plan_grant_reason" NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"granted_by" uuid,
	"note" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_grants_paid_plan" CHECK ("plan_grants"."plan" <> 'free'),
	CONSTRAINT "plan_grants_note" CHECK (char_length("plan_grants"."note") <= 500)
);
--> statement-breakpoint
ALTER TABLE "plan_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"provider_subscription_id" text NOT NULL,
	"plan" "plan_name" NOT NULL,
	"interval" "billing_interval" NOT NULL,
	"status" "subscription_status" NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"scheduled_plan" "plan_name",
	"scheduled_interval" "billing_interval",
	"grace_until" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"test_fail_next" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_provider_subscription_id_unique" UNIQUE("provider_subscription_id"),
	CONSTRAINT "subscriptions_paid_plan" CHECK ("subscriptions"."plan" <> 'free'),
	CONSTRAINT "subscriptions_period" CHECK ("subscriptions"."current_period_end" > "subscriptions"."current_period_start"),
	CONSTRAINT "subscriptions_price" CHECK ("subscriptions"."price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "aircraft" ADD COLUMN "listed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "aircraft" ADD COLUMN "featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_credit_entries" ADD CONSTRAINT "ai_credit_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_entries" ADD CONSTRAINT "ai_credit_entries_payment_id_billing_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."billing_payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_entries" ADD CONSTRAINT "ai_credit_entries_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_checkouts" ADD CONSTRAINT "billing_checkouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_grants" ADD CONSTRAINT "plan_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_grants" ADD CONSTRAINT "plan_grants_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_credit_entries_user_idx" ON "ai_credit_entries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_credit_entries_one_welcome" ON "ai_credit_entries" USING btree ("user_id") WHERE "ai_credit_entries"."reason" = 'welcome';--> statement-breakpoint
CREATE UNIQUE INDEX "ai_credit_entries_one_refund" ON "ai_credit_entries" USING btree ("refund_of") WHERE "ai_credit_entries"."refund_of" is not null;--> statement-breakpoint
CREATE INDEX "billing_checkouts_user_idx" ON "billing_checkouts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_events_once" ON "billing_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "billing_payments_user_idx" ON "billing_payments" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "plan_grants_user_idx" ON "plan_grants" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_grants_one_founding" ON "plan_grants" USING btree ("user_id") WHERE "plan_grants"."reason" = 'founding';