CREATE TYPE "public"."airport_fee_kind" AS ENUM('landing', 'parking', 'hangar', 'other');--> statement-breakpoint
CREATE TYPE "public"."airport_fee_unit" AS ENUM('landing', 'night', 'day', 'hour', 'once');--> statement-breakpoint
CREATE TYPE "public"."runway_surface" AS ENUM('asphalt', 'concrete', 'grass', 'gravel', 'dirt', 'sand', 'water', 'other');--> statement-breakpoint
CREATE TABLE "airport_closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airport_ident" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"note" text,
	CONSTRAINT "airport_closures_values" CHECK ("airport_closures"."ends_on" >= "airport_closures"."starts_on" and "airport_closures"."ends_on" - "airport_closures"."starts_on" <= 366
        and char_length("airport_closures"."note") <= 200)
);
--> statement-breakpoint
ALTER TABLE "airport_closures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "airport_fees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airport_ident" text NOT NULL,
	"kind" "airport_fee_kind" NOT NULL,
	"label" text,
	"max_mtom_kg" integer,
	"amount" numeric(10, 2) NOT NULL,
	"unit" "airport_fee_unit" NOT NULL,
	CONSTRAINT "airport_fees_values" CHECK (char_length("airport_fees"."label") <= 80 and "airport_fees"."amount" >= 0 and "airport_fees"."amount" < 100000
        and ("airport_fees"."max_mtom_kg" is null or "airport_fees"."max_mtom_kg" between 1 and 100000))
);
--> statement-breakpoint
ALTER TABLE "airport_fees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "airport_frequencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airport_ident" text NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"mhz" numeric(7, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "airport_frequencies_values" CHECK (char_length(btrim("airport_frequencies"."type")) between 1 and 12 and char_length("airport_frequencies"."description") <= 80
        and "airport_frequencies"."mhz" > 0 and "airport_frequencies"."mhz" < 1000)
);
--> statement-breakpoint
ALTER TABLE "airport_frequencies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "airport_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airport_ident" text NOT NULL,
	"weekday" smallint NOT NULL,
	"opens" time NOT NULL,
	"closes" time NOT NULL,
	CONSTRAINT "airport_hours_values" CHECK ("airport_hours"."weekday" between 1 and 7 and "airport_hours"."opens" < "airport_hours"."closes")
);
--> statement-breakpoint
ALTER TABLE "airport_hours" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "airport_runways" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airport_ident" text NOT NULL,
	"designator" text NOT NULL,
	"length_m" integer,
	"width_m" integer,
	"surface" "runway_surface" DEFAULT 'other' NOT NULL,
	"lighted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "airport_runways_values" CHECK (char_length(btrim("airport_runways"."designator")) between 1 and 20
        and ("airport_runways"."length_m" is null or "airport_runways"."length_m" between 1 and 10000)
        and ("airport_runways"."width_m" is null or "airport_runways"."width_m" between 1 and 200))
);
--> statement-breakpoint
ALTER TABLE "airport_runways" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "airport_operators" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "airport_operators" ADD COLUMN "ppr_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "airport_operators" ADD COLUMN "ppr_notice_hours" integer;--> statement-breakpoint
ALTER TABLE "airport_operators" ADD COLUMN "hours_note" text;--> statement-breakpoint
ALTER TABLE "airport_operators" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "airport_operators" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "airport_operators" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "airport_operators" ADD COLUMN "currency" text DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE "airport_operators" ADD COLUMN "services" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "airport_operators" ADD COLUMN "fuels" "fuel_type"[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "airport_operators" ADD COLUMN "profile_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "airport_closures" ADD CONSTRAINT "airport_closures_airport_ident_airport_operators_airport_ident_fk" FOREIGN KEY ("airport_ident") REFERENCES "public"."airport_operators"("airport_ident") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airport_fees" ADD CONSTRAINT "airport_fees_airport_ident_airport_operators_airport_ident_fk" FOREIGN KEY ("airport_ident") REFERENCES "public"."airport_operators"("airport_ident") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airport_frequencies" ADD CONSTRAINT "airport_frequencies_airport_ident_airports_ident_fk" FOREIGN KEY ("airport_ident") REFERENCES "public"."airports"("ident") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airport_hours" ADD CONSTRAINT "airport_hours_airport_ident_airport_operators_airport_ident_fk" FOREIGN KEY ("airport_ident") REFERENCES "public"."airport_operators"("airport_ident") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airport_runways" ADD CONSTRAINT "airport_runways_airport_ident_airports_ident_fk" FOREIGN KEY ("airport_ident") REFERENCES "public"."airports"("ident") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "airport_closures_airport_idx" ON "airport_closures" USING btree ("airport_ident");--> statement-breakpoint
CREATE INDEX "airport_fees_airport_idx" ON "airport_fees" USING btree ("airport_ident");--> statement-breakpoint
CREATE INDEX "airport_frequencies_airport_idx" ON "airport_frequencies" USING btree ("airport_ident");--> statement-breakpoint
CREATE INDEX "airport_hours_airport_idx" ON "airport_hours" USING btree ("airport_ident");--> statement-breakpoint
CREATE INDEX "airport_runways_airport_idx" ON "airport_runways" USING btree ("airport_ident");--> statement-breakpoint
ALTER TABLE "airport_operators" ADD CONSTRAINT "airport_operators_profile" CHECK (char_length("airport_operators"."description") <= 2000 and char_length("airport_operators"."hours_note") <= 300
        and ("airport_operators"."ppr_notice_hours" is null or "airport_operators"."ppr_notice_hours" between 0 and 720)
        and char_length("airport_operators"."phone") <= 40 and char_length("airport_operators"."email") <= 200
        and ("airport_operators"."website" is null or ("airport_operators"."website" ~ '^https?://' and char_length("airport_operators"."website") <= 300))
        and "airport_operators"."currency" ~ '^[A-Z]{3}$'
        and "airport_operators"."services" <@ array['apron_parking', 'hangar', 'tie_downs', 'handling', 'customs',
          'immigration', 'maintenance', 'catering', 'transport', 'restaurant', 'accommodation',
          'briefing_room']::text[]);