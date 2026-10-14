CREATE TYPE "public"."airport_request_purpose" AS ENUM('private', 'training', 'business', 'other');--> statement-breakpoint
CREATE TYPE "public"."airport_request_status" AS ENUM('pending', 'approved', 'declined', 'cancelled');--> statement-breakpoint
CREATE TABLE "airport_request_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"service_id" uuid,
	"category" "airport_service_category" NOT NULL,
	"label" text,
	"fuel_type" "fuel_type",
	"max_mtom_kg" integer,
	"unit" "airport_service_unit" NOT NULL,
	"price" numeric(10, 3),
	"quantity" numeric(8, 1) NOT NULL,
	CONSTRAINT "airport_request_items_quantity" CHECK ("airport_request_items"."quantity" > 0 and "airport_request_items"."quantity" < 100000)
);
--> statement-breakpoint
ALTER TABLE "airport_request_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "airport_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airport_ident" text NOT NULL,
	"pilot_id" uuid NOT NULL,
	"booking_id" uuid,
	"registration" text NOT NULL,
	"aircraft_type" text,
	"mtom_kg" integer,
	"arrival_at" timestamp with time zone,
	"from_ident" text,
	"departure_at" timestamp with time zone,
	"to_ident" text,
	"pob" smallint NOT NULL,
	"purpose" "airport_request_purpose" DEFAULT 'private' NOT NULL,
	"other_request" text,
	"status" "airport_request_status" DEFAULT 'pending' NOT NULL,
	"auto_confirmed" boolean DEFAULT false NOT NULL,
	"ppr_number" text,
	"conditions" text,
	"operator_note" text,
	"answered_by" uuid,
	"answered_at" timestamp with time zone,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "airport_requests_times" CHECK ("airport_requests"."arrival_at" is not null or "airport_requests"."departure_at" is not null),
	CONSTRAINT "airport_requests_order" CHECK ("airport_requests"."arrival_at" is null or "airport_requests"."departure_at" is null or "airport_requests"."departure_at" > "airport_requests"."arrival_at"),
	CONSTRAINT "airport_requests_registration" CHECK ("airport_requests"."registration" ~ '^[A-Z0-9]{1,3}-?[A-Z0-9]{1,6}$'),
	CONSTRAINT "airport_requests_type" CHECK ("airport_requests"."aircraft_type" ~ '^[A-Z0-9]{2,4}$'),
	CONSTRAINT "airport_requests_values" CHECK ("airport_requests"."pob" between 1 and 20 and "airport_requests"."mtom_kg" between 100 and 100000
        and char_length("airport_requests"."other_request") <= 1000 and char_length("airport_requests"."ppr_number") <= 40
        and char_length("airport_requests"."conditions") <= 500 and char_length("airport_requests"."operator_note") <= 500)
);
--> statement-breakpoint
ALTER TABLE "airport_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "airport_request_id" uuid;--> statement-breakpoint
ALTER TABLE "airport_request_items" ADD CONSTRAINT "airport_request_items_request_id_airport_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."airport_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airport_request_items" ADD CONSTRAINT "airport_request_items_service_id_airport_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."airport_services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airport_requests" ADD CONSTRAINT "airport_requests_airport_ident_airport_operators_airport_ident_fk" FOREIGN KEY ("airport_ident") REFERENCES "public"."airport_operators"("airport_ident") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airport_requests" ADD CONSTRAINT "airport_requests_pilot_id_users_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airport_requests" ADD CONSTRAINT "airport_requests_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airport_requests" ADD CONSTRAINT "airport_requests_from_ident_airports_ident_fk" FOREIGN KEY ("from_ident") REFERENCES "public"."airports"("ident") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airport_requests" ADD CONSTRAINT "airport_requests_to_ident_airports_ident_fk" FOREIGN KEY ("to_ident") REFERENCES "public"."airports"("ident") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airport_requests" ADD CONSTRAINT "airport_requests_answered_by_users_id_fk" FOREIGN KEY ("answered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "airport_request_items_request_idx" ON "airport_request_items" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "airport_requests_arrival_idx" ON "airport_requests" USING btree ("airport_ident","arrival_at");--> statement-breakpoint
CREATE INDEX "airport_requests_departure_idx" ON "airport_requests" USING btree ("airport_ident","departure_at");--> statement-breakpoint
CREATE INDEX "airport_requests_pilot_idx" ON "airport_requests" USING btree ("pilot_id","created_at");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_airport_request_id_airport_requests_id_fk" FOREIGN KEY ("airport_request_id") REFERENCES "public"."airport_requests"("id") ON DELETE cascade ON UPDATE no action;