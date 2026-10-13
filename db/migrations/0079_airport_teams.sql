CREATE TYPE "public"."airport_claim_status" AS ENUM('unconfirmed', 'pending', 'verified', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."airport_member_role" AS ENUM('manager', 'staff');--> statement-breakpoint
CREATE TABLE "airport_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airport_ident" text NOT NULL,
	"user_id" uuid NOT NULL,
	"position" text NOT NULL,
	"note" text,
	"document_id" uuid,
	"email" text,
	"email_code_hash" text,
	"email_code_sent_at" timestamp with time zone,
	"email_code_tries" integer DEFAULT 0 NOT NULL,
	"email_codes_sent" integer DEFAULT 0 NOT NULL,
	"email_confirmed_at" timestamp with time zone,
	"status" "airport_claim_status" DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "airport_claims_values" CHECK (char_length(btrim("airport_claims"."position")) between 1 and 80
        and char_length("airport_claims"."note") <= 500
        and ("airport_claims"."email" is null or ("airport_claims"."email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length("airport_claims"."email") <= 200))
        and ("airport_claims"."email" is null or "airport_claims"."document_id" is null)
        and char_length("airport_claims"."decision_note") <= 500),
	CONSTRAINT "airport_claims_unconfirmed" CHECK ("airport_claims"."status" <> 'unconfirmed' or ("airport_claims"."email" is not null and "airport_claims"."email_confirmed_at" is null))
);
--> statement-breakpoint
ALTER TABLE "airport_claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "airport_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airport_ident" text NOT NULL,
	"email" text NOT NULL,
	"role" "airport_member_role" DEFAULT 'staff' NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '14 days' NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" uuid,
	CONSTRAINT "airport_invites_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "airport_invites_values" CHECK ("airport_invites"."email" = lower("airport_invites"."email") and char_length("airport_invites"."email") between 3 and 200
        and "airport_invites"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "airport_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "airport_members" (
	"airport_ident" text NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "airport_member_role" DEFAULT 'staff' NOT NULL,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "airport_members_airport_ident_user_id_pk" PRIMARY KEY("airport_ident","user_id")
);
--> statement-breakpoint
ALTER TABLE "airport_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "airport_operators" (
	"airport_ident" text PRIMARY KEY NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_by" uuid
);
--> statement-breakpoint
ALTER TABLE "airport_operators" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "airport_claims" ADD CONSTRAINT "airport_claims_airport_ident_airports_ident_fk" FOREIGN KEY ("airport_ident") REFERENCES "public"."airports"("ident") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airport_claims" ADD CONSTRAINT "airport_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airport_claims" ADD CONSTRAINT "airport_claims_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airport_claims" ADD CONSTRAINT "airport_claims_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airport_invites" ADD CONSTRAINT "airport_invites_airport_ident_airport_operators_airport_ident_fk" FOREIGN KEY ("airport_ident") REFERENCES "public"."airport_operators"("airport_ident") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airport_invites" ADD CONSTRAINT "airport_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airport_invites" ADD CONSTRAINT "airport_invites_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airport_members" ADD CONSTRAINT "airport_members_airport_ident_airport_operators_airport_ident_fk" FOREIGN KEY ("airport_ident") REFERENCES "public"."airport_operators"("airport_ident") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airport_members" ADD CONSTRAINT "airport_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airport_members" ADD CONSTRAINT "airport_members_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airport_operators" ADD CONSTRAINT "airport_operators_airport_ident_airports_ident_fk" FOREIGN KEY ("airport_ident") REFERENCES "public"."airports"("ident") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airport_operators" ADD CONSTRAINT "airport_operators_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "airport_claims_user_idx" ON "airport_claims" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "airport_claims_status_idx" ON "airport_claims" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "airport_claims_open" ON "airport_claims" USING btree ("airport_ident","user_id") WHERE "airport_claims"."status" in ('unconfirmed', 'pending');--> statement-breakpoint
CREATE INDEX "airport_invites_airport_idx" ON "airport_invites" USING btree ("airport_ident");--> statement-breakpoint
CREATE INDEX "airport_members_user_idx" ON "airport_members" USING btree ("user_id");