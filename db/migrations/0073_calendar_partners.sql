ALTER TYPE "public"."calendar_connection_inbound" ADD VALUE 'partner';--> statement-breakpoint
CREATE TABLE "calendar_partner_keys" (
	"connection_id" uuid PRIMARY KEY NOT NULL,
	"api_key" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_partner_keys_key" CHECK (char_length("calendar_partner_keys"."api_key") between 8 and 500)
);
--> statement-breakpoint
ALTER TABLE "calendar_partner_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD COLUMN "partner" text;--> statement-breakpoint
ALTER TABLE "calendar_partner_keys" ADD CONSTRAINT "calendar_partner_keys_connection_id_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."calendar_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_partner" CHECK (("calendar_connections"."inbound"::text = 'partner') = ("calendar_connections"."partner" is not null)
        and ("calendar_connections"."partner" is null or "calendar_connections"."partner" in ('rafaviation')));