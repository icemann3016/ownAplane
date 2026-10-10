CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD COLUMN "webhook_url" text;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD COLUMN "webhook_secret" text;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD COLUMN "webhook_last_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD COLUMN "webhook_last_error" text;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_connection_id_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."calendar_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_events_due_idx" ON "webhook_events" USING btree ("next_attempt_at") WHERE delivered_at is null;--> statement-breakpoint
CREATE INDEX "webhook_events_connection_idx" ON "webhook_events" USING btree ("connection_id","entry_id");--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_webhook" CHECK (("calendar_connections"."webhook_url" is null) = ("calendar_connections"."webhook_secret" is null)
        and ("calendar_connections"."webhook_url" is null or ("calendar_connections"."webhook_url" ~ '^https://' and char_length("calendar_connections"."webhook_url") <= 500))
        and ("calendar_connections"."webhook_secret" is null or "calendar_connections"."webhook_secret" ~ '^[0-9a-f]{64}$')
        and char_length("calendar_connections"."webhook_last_error") <= 200);