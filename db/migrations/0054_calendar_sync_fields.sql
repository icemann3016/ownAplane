ALTER TABLE "calendar_entries" DROP CONSTRAINT "calendar_entries_external";--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD COLUMN "export_fields" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD COLUMN "import_fields" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_fields" CHECK ("calendar_connections"."export_fields" <@ array['type', 'status', 'route', 'pilot', 'reference', 'note', 'registration']::text[]
        and "calendar_connections"."import_fields" <@ array['title', 'type', 'status', 'registration']::text[]);--> statement-breakpoint
ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_external" CHECK (("calendar_entries"."connection_id" is null and "calendar_entries"."external_id" is null and not "calendar_entries"."conflict")
        or ("calendar_entries"."kind" in ('unavailable', 'maintenance') and "calendar_entries"."booking_id" is null
          and "calendar_entries"."external_id" is not null
          and char_length("calendar_entries"."external_id") between 1 and 200));