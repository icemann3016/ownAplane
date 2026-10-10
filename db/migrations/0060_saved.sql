CREATE TABLE "favourite_aircraft" (
	"user_id" uuid NOT NULL,
	"aircraft_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favourite_aircraft_user_id_aircraft_id_pk" PRIMARY KEY("user_id","aircraft_id")
);
--> statement-breakpoint
ALTER TABLE "favourite_aircraft" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "saved_search_hits" (
	"saved_search_id" uuid NOT NULL,
	"aircraft_id" uuid NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_search_hits_saved_search_id_aircraft_id_pk" PRIMARY KEY("saved_search_id","aircraft_id")
);
--> statement-breakpoint
ALTER TABLE "saved_search_hits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "saved_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"query" text NOT NULL,
	"alerts" boolean DEFAULT true NOT NULL,
	"last_alert_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_searches_values" CHECK (char_length(btrim("saved_searches"."name")) between 1 and 80 and char_length("saved_searches"."query") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "saved_searches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "saved_search_id" uuid;--> statement-breakpoint
ALTER TABLE "favourite_aircraft" ADD CONSTRAINT "favourite_aircraft_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favourite_aircraft" ADD CONSTRAINT "favourite_aircraft_aircraft_id_aircraft_id_fk" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_search_hits" ADD CONSTRAINT "saved_search_hits_saved_search_id_saved_searches_id_fk" FOREIGN KEY ("saved_search_id") REFERENCES "public"."saved_searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_search_hits" ADD CONSTRAINT "saved_search_hits_aircraft_id_aircraft_id_fk" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "favourite_aircraft_aircraft_idx" ON "favourite_aircraft" USING btree ("aircraft_id");--> statement-breakpoint
CREATE INDEX "saved_searches_user_idx" ON "saved_searches" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_saved_search_id_saved_searches_id_fk" FOREIGN KEY ("saved_search_id") REFERENCES "public"."saved_searches"("id") ON DELETE cascade ON UPDATE no action;