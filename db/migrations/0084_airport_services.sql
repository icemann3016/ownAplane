CREATE TYPE "public"."airport_service_category" AS ENUM('landing', 'ground_handling', 'pax_handling', 'parking_apron', 'parking_hangar', 'customs', 'fuel', 'oil', 'other');--> statement-breakpoint
CREATE TYPE "public"."airport_service_unit" AS ENUM('landing', 'movement', 'night', 'day', 'hour', 'pax', 'litre', 'once');--> statement-breakpoint
CREATE TABLE "airport_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airport_ident" text NOT NULL,
	"category" "airport_service_category" NOT NULL,
	"label" text,
	"fuel_type" "fuel_type",
	"max_mtom_kg" integer,
	"price" numeric(10, 3),
	"unit" "airport_service_unit" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "airport_services_values" CHECK (char_length("airport_services"."label") <= 80 and char_length("airport_services"."note") <= 200
        and ("airport_services"."price" is null or ("airport_services"."price" >= 0 and "airport_services"."price" < 100000))
        and ("airport_services"."max_mtom_kg" is null or "airport_services"."max_mtom_kg" between 1 and 100000)
        and ("airport_services"."category" <> 'other' or char_length(btrim("airport_services"."label")) > 0)
        and (("airport_services"."category" = 'fuel') = ("airport_services"."fuel_type" is not null)))
);
--> statement-breakpoint
ALTER TABLE "airport_services" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "airport_services" ADD CONSTRAINT "airport_services_airport_ident_airport_operators_airport_ident_fk" FOREIGN KEY ("airport_ident") REFERENCES "public"."airport_operators"("airport_ident") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "airport_services_airport_idx" ON "airport_services" USING btree ("airport_ident");