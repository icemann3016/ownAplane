CREATE TABLE "api_rate_buckets" (
	"key" text NOT NULL,
	"minute" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "api_rate_buckets_key_minute_pk" PRIMARY KEY("key","minute")
);
--> statement-breakpoint
ALTER TABLE "api_rate_buckets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "api_usage_daily" (
	"day" date NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "api_usage_daily_day_subject_type_subject_id_pk" PRIMARY KEY("day","subject_type","subject_id")
);
--> statement-breakpoint
ALTER TABLE "api_usage_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "api_rate_buckets_minute_idx" ON "api_rate_buckets" USING btree ("minute");