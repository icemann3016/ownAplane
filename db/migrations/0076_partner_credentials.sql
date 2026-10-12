-- Owners' API keys for partners (SYN-7), encrypted by the app; no app_user access (trusted code only).
CREATE TABLE "partner_credentials" (
	"user_id" uuid NOT NULL,
	"partner" text NOT NULL,
	"secret" text NOT NULL,
	"hint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"last_error" text,
	CONSTRAINT "partner_credentials_user_id_partner_pk" PRIMARY KEY("user_id","partner"),
	CONSTRAINT "partner_credentials_values" CHECK ("partner_credentials"."partner" in ('rafaviation') and char_length("partner_credentials"."secret") <= 2000
        and char_length("partner_credentials"."hint") <= 8 and char_length("partner_credentials"."last_error") <= 100)
);
--> statement-breakpoint
ALTER TABLE "partner_credentials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "partner_credentials" ADD CONSTRAINT "partner_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;