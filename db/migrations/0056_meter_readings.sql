CREATE TYPE "public"."meter_gap_reason" AS ENUM('outside', 'maintenance', 'meter_replaced', 'other');--> statement-breakpoint
CREATE TABLE "meter_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"aircraft_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hobbs" numeric(8, 2),
	"tach" numeric(8, 2),
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meter_readings_values" CHECK (("meter_readings"."hobbs" is not null or "meter_readings"."tach" is not null) and "meter_readings"."hobbs" >= 0
        and "meter_readings"."tach" >= 0 and char_length("meter_readings"."note") <= 200)
);
--> statement-breakpoint
ALTER TABLE "meter_readings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "flight_logs" ADD COLUMN "meter_gap_reason" "meter_gap_reason";--> statement-breakpoint
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_aircraft_id_aircraft_id_fk" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meter_readings_aircraft_idx" ON "meter_readings" USING btree ("aircraft_id","read_at");