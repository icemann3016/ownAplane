CREATE TYPE "public"."logbook_entry_kind" AS ENUM('flight', 'fstd', 'brought_forward');--> statement-breakpoint
CREATE TYPE "public"."logbook_entry_source" AS ENUM('manual', 'ownaplane', 'scan');--> statement-breakpoint
CREATE TYPE "public"."logbook_entry_status" AS ENUM('draft', 'certified', 'superseded');--> statement-breakpoint
CREATE TABLE "logbook_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pilot_id" uuid NOT NULL,
	"kind" "logbook_entry_kind" DEFAULT 'flight' NOT NULL,
	"status" "logbook_entry_status" DEFAULT 'draft' NOT NULL,
	"source" "logbook_entry_source" DEFAULT 'manual' NOT NULL,
	"date" date NOT NULL,
	"departure_place" text,
	"departure_time" time,
	"arrival_place" text,
	"arrival_time" time,
	"aircraft_type" text,
	"registration" text,
	"se_minutes" integer,
	"me_minutes" integer,
	"mp_minutes" integer,
	"total_minutes" integer,
	"pic_name" text,
	"landings_day" smallint,
	"landings_night" smallint,
	"night_minutes" integer,
	"ifr_minutes" integer,
	"pic_minutes" integer,
	"copilot_minutes" integer,
	"dual_minutes" integer,
	"instructor_minutes" integer,
	"fstd_type" text,
	"fstd_minutes" integer,
	"remarks" text,
	"flight_leg_id" uuid,
	"corrects_id" uuid,
	"certified_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "logbook_entries_flight_leg_id_unique" UNIQUE("flight_leg_id"),
	CONSTRAINT "logbook_entries_minutes" CHECK (least("logbook_entries"."se_minutes", "logbook_entries"."me_minutes", "logbook_entries"."mp_minutes", "logbook_entries"."total_minutes",
        "logbook_entries"."night_minutes", "logbook_entries"."ifr_minutes", "logbook_entries"."pic_minutes", "logbook_entries"."copilot_minutes",
        "logbook_entries"."dual_minutes", "logbook_entries"."instructor_minutes", "logbook_entries"."fstd_minutes") >= 0),
	CONSTRAINT "logbook_entries_flight_minutes" CHECK ("logbook_entries"."kind" = 'brought_forward' or greatest("logbook_entries"."total_minutes", "logbook_entries"."fstd_minutes") <= 1440),
	CONSTRAINT "logbook_entries_landings" CHECK (least("logbook_entries"."landings_day", "logbook_entries"."landings_night") >= 0 and greatest("logbook_entries"."landings_day", "logbook_entries"."landings_night") <= 32000),
	CONSTRAINT "logbook_entries_texts" CHECK (char_length(coalesce("logbook_entries"."departure_place", '')) <= 60
        and char_length(coalesce("logbook_entries"."arrival_place", '')) <= 60
        and char_length(coalesce("logbook_entries"."aircraft_type", '')) <= 60
        and char_length(coalesce("logbook_entries"."registration", '')) <= 20
        and char_length(coalesce("logbook_entries"."pic_name", '')) <= 100
        and char_length(coalesce("logbook_entries"."fstd_type", '')) <= 60
        and char_length(coalesce("logbook_entries"."remarks", '')) <= 1000
        and char_length(coalesce("logbook_entries"."void_reason", '')) <= 500)
);
--> statement-breakpoint
ALTER TABLE "logbook_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "logbook_entries" ADD CONSTRAINT "logbook_entries_pilot_id_users_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logbook_entries" ADD CONSTRAINT "logbook_entries_flight_leg_id_flight_legs_id_fk" FOREIGN KEY ("flight_leg_id") REFERENCES "public"."flight_legs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logbook_entries" ADD CONSTRAINT "logbook_entries_corrects_id_logbook_entries_id_fk" FOREIGN KEY ("corrects_id") REFERENCES "public"."logbook_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "logbook_entries_pilot_idx" ON "logbook_entries" USING btree ("pilot_id","date");--> statement-breakpoint
CREATE INDEX "logbook_entries_corrects_idx" ON "logbook_entries" USING btree ("corrects_id");