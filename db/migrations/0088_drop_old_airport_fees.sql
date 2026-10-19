-- The old fees and the ticked services and fuels were copied into airport_services by 0085, and
-- the previous release stopped reading them (APT-1). The profile's "touched" trigger names its
-- columns, so it is made again without the two dropped ones first.
DROP TRIGGER airport_operators_profile_touched ON public.airport_operators;--> statement-breakpoint
CREATE TRIGGER airport_operators_profile_touched BEFORE UPDATE OF description, ppr_required,
  ppr_notice_hours, hours_note, phone, email, website, currency
  ON public.airport_operators FOR EACH ROW EXECUTE FUNCTION public.airport_profile_touched();--> statement-breakpoint
DROP TABLE "airport_fees" CASCADE;--> statement-breakpoint
ALTER TABLE "airport_operators" DROP CONSTRAINT "airport_operators_profile";--> statement-breakpoint
ALTER TABLE "airport_operators" DROP COLUMN "services";--> statement-breakpoint
ALTER TABLE "airport_operators" DROP COLUMN "fuels";--> statement-breakpoint
ALTER TABLE "airport_operators" ADD CONSTRAINT "airport_operators_profile" CHECK (char_length("airport_operators"."description") <= 2000 and char_length("airport_operators"."hours_note") <= 300
        and ("airport_operators"."ppr_notice_hours" is null or "airport_operators"."ppr_notice_hours" between 0 and 720)
        and char_length("airport_operators"."phone") <= 40 and char_length("airport_operators"."email") <= 200
        and ("airport_operators"."website" is null or ("airport_operators"."website" ~ '^https?://' and char_length("airport_operators"."website") <= 300))
        and "airport_operators"."currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
DROP TYPE "public"."airport_fee_kind";--> statement-breakpoint
DROP TYPE "public"."airport_fee_unit";