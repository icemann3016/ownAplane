CREATE TABLE "document_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"document_id" uuid,
	"kind" text NOT NULL,
	"outcome" text NOT NULL,
	"pages" integer DEFAULT 1 NOT NULL,
	"consent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_reads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_reads" ADD CONSTRAINT "document_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_reads" ADD CONSTRAINT "document_reads_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_reads_user_idx" ON "document_reads" USING btree ("user_id","created_at");