ALTER TABLE "aircraft" ADD COLUMN "mtom_kg" smallint;--> statement-breakpoint
ALTER TABLE "flight_logs" ADD COLUMN "recency_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "aircraft" ADD CONSTRAINT "aircraft_mtom" CHECK ("aircraft"."mtom_kg" between 100 and 20000);