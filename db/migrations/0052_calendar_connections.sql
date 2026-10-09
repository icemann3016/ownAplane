CREATE TYPE "public"."calendar_connection_inbound" AS ENUM('none', 'ical', 'json', 'push');--> statement-breakpoint
CREATE TABLE "calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"aircraft_id" uuid NOT NULL,
	"name" text NOT NULL,
	"inbound" "calendar_connection_inbound" NOT NULL,
	"feed_url" text,
	"api_key_hash" text,
	"api_key_hint" text,
	"export_token" text DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_error" text,
	"last_sync_count" integer,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_connections_api_key_hash_unique" UNIQUE("api_key_hash"),
	CONSTRAINT "calendar_connections_export_token_unique" UNIQUE("export_token"),
	CONSTRAINT "calendar_connections_name" CHECK (char_length(btrim("calendar_connections"."name")) between 1 and 80),
	CONSTRAINT "calendar_connections_feed" CHECK (("calendar_connections"."inbound" in ('ical', 'json')) = ("calendar_connections"."feed_url" is not null)
        and ("calendar_connections"."feed_url" is null or ("calendar_connections"."feed_url" ~ '^https://' and char_length("calendar_connections"."feed_url") <= 2000))),
	CONSTRAINT "calendar_connections_key" CHECK (("calendar_connections"."inbound" = 'push') = ("calendar_connections"."api_key_hash" is not null)
        and ("calendar_connections"."api_key_hash" is null or "calendar_connections"."api_key_hash" ~ '^[0-9a-f]{64}$')),
	CONSTRAINT "calendar_connections_export" CHECK (char_length("calendar_connections"."export_token") >= 32),
	CONSTRAINT "calendar_connections_error" CHECK (char_length("calendar_connections"."last_sync_error") <= 500)
);
--> statement-breakpoint
ALTER TABLE "calendar_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "calendar_entries" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
ALTER TABLE "calendar_entries" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "calendar_entries" ADD COLUMN "conflict" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_aircraft_id_aircraft_id_fk" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_connections_aircraft_idx" ON "calendar_connections" USING btree ("aircraft_id");--> statement-breakpoint
ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_connection_id_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."calendar_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_entries_external_unique" ON "calendar_entries" USING btree ("connection_id","external_id") WHERE "calendar_entries"."connection_id" is not null;--> statement-breakpoint
ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_external" CHECK (("calendar_entries"."connection_id" is null and "calendar_entries"."external_id" is null and not "calendar_entries"."conflict")
        or ("calendar_entries"."kind" = 'unavailable' and "calendar_entries"."booking_id" is null and "calendar_entries"."external_id" is not null
          and char_length("calendar_entries"."external_id") between 1 and 200));