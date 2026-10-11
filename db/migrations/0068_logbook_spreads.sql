CREATE TABLE "logbook_spreads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pilot_id" uuid NOT NULL,
	"left_document_id" uuid,
	"right_document_id" uuid,
	"lines_read" smallint DEFAULT 0 NOT NULL,
	"lines_skipped" smallint DEFAULT 0 NOT NULL,
	"page_totals" jsonb,
	"differences" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "logbook_spreads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "logbook_entries" ADD COLUMN "spread_id" uuid;--> statement-breakpoint
ALTER TABLE "logbook_entries" ADD COLUMN "spread_line" smallint;--> statement-breakpoint
ALTER TABLE "logbook_spreads" ADD CONSTRAINT "logbook_spreads_pilot_id_users_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logbook_spreads" ADD CONSTRAINT "logbook_spreads_left_document_id_documents_id_fk" FOREIGN KEY ("left_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logbook_spreads" ADD CONSTRAINT "logbook_spreads_right_document_id_documents_id_fk" FOREIGN KEY ("right_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "logbook_spreads_pilot_idx" ON "logbook_spreads" USING btree ("pilot_id","created_at");--> statement-breakpoint
ALTER TABLE "logbook_entries" ADD CONSTRAINT "logbook_entries_spread_id_logbook_spreads_id_fk" FOREIGN KEY ("spread_id") REFERENCES "public"."logbook_spreads"("id") ON DELETE set null ON UPDATE no action;