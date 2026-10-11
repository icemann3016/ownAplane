CREATE TABLE "booking_feeds" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_feeds_token_unique" UNIQUE("token"),
	CONSTRAINT "booking_feeds_token" CHECK (char_length("booking_feeds"."token") >= 32)
);
--> statement-breakpoint
ALTER TABLE "booking_feeds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "booking_feeds" ADD CONSTRAINT "booking_feeds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;