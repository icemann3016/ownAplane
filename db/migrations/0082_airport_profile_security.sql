-- Airport profiles (APT-1, M16 step 2): everyone reads an airfield's details; only its managers
-- change them (airport_role_of(), 0080). Runways and frequencies of airfields without a team are
-- open data kept by the import script (owner connection).

-- The profile lives on airport_operators (already readable by everyone).
GRANT UPDATE (description, ppr_required, ppr_notice_hours, hours_note, phone, email, website,
  currency, services, fuels) ON public.airport_operators TO app_user;
--> statement-breakpoint
CREATE POLICY airport_operators_update ON public.airport_operators FOR UPDATE TO app_user
  USING (public.airport_role_of(airport_ident) = 'manager')
  WITH CHECK (public.airport_role_of(airport_ident) = 'manager');
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.airport_profile_touched()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.profile_updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER airport_operators_profile_touched BEFORE UPDATE OF description, ppr_required,
  ppr_notice_hours, hours_note, phone, email, website, currency, services, fuels
  ON public.airport_operators FOR EACH ROW EXECUTE FUNCTION public.airport_profile_touched();
--> statement-breakpoint

-- At most TG_ARGV[0] rows per airfield when its team adds them (the import isn't limited).
CREATE OR REPLACE FUNCTION public.airport_rows_limited()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  n integer;
BEGIN
  IF current_user = 'app_user' THEN
    EXECUTE format('SELECT count(*) FROM public.%I WHERE airport_ident = $1', TG_TABLE_NAME)
      INTO n USING NEW.airport_ident;
    IF n >= TG_ARGV[0]::integer THEN
      RAISE EXCEPTION 'too_many_rows';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

GRANT SELECT, INSERT, DELETE ON public.airport_runways TO app_user;
--> statement-breakpoint
GRANT UPDATE (designator, length_m, width_m, surface, lighted) ON public.airport_runways TO app_user;
--> statement-breakpoint
CREATE POLICY airport_runways_select ON public.airport_runways FOR SELECT TO app_user USING (true);
--> statement-breakpoint
CREATE POLICY airport_runways_insert ON public.airport_runways FOR INSERT TO app_user
  WITH CHECK (public.airport_role_of(airport_ident) = 'manager');
--> statement-breakpoint
CREATE POLICY airport_runways_update ON public.airport_runways FOR UPDATE TO app_user
  USING (public.airport_role_of(airport_ident) = 'manager')
  WITH CHECK (public.airport_role_of(airport_ident) = 'manager');
--> statement-breakpoint
CREATE POLICY airport_runways_delete ON public.airport_runways FOR DELETE TO app_user
  USING (public.airport_role_of(airport_ident) = 'manager');
--> statement-breakpoint
CREATE TRIGGER airport_runways_limited BEFORE INSERT ON public.airport_runways
  FOR EACH ROW EXECUTE FUNCTION public.airport_rows_limited('20');
--> statement-breakpoint

GRANT SELECT, INSERT, DELETE ON public.airport_frequencies TO app_user;
--> statement-breakpoint
GRANT UPDATE (type, description, mhz) ON public.airport_frequencies TO app_user;
--> statement-breakpoint
CREATE POLICY airport_frequencies_select ON public.airport_frequencies FOR SELECT TO app_user
  USING (true);
--> statement-breakpoint
CREATE POLICY airport_frequencies_insert ON public.airport_frequencies FOR INSERT TO app_user
  WITH CHECK (public.airport_role_of(airport_ident) = 'manager');
--> statement-breakpoint
CREATE POLICY airport_frequencies_update ON public.airport_frequencies FOR UPDATE TO app_user
  USING (public.airport_role_of(airport_ident) = 'manager')
  WITH CHECK (public.airport_role_of(airport_ident) = 'manager');
--> statement-breakpoint
CREATE POLICY airport_frequencies_delete ON public.airport_frequencies FOR DELETE TO app_user
  USING (public.airport_role_of(airport_ident) = 'manager');
--> statement-breakpoint
CREATE TRIGGER airport_frequencies_limited BEFORE INSERT ON public.airport_frequencies
  FOR EACH ROW EXECUTE FUNCTION public.airport_rows_limited('30');
--> statement-breakpoint

GRANT SELECT, INSERT, DELETE ON public.airport_hours TO app_user;
--> statement-breakpoint
CREATE POLICY airport_hours_select ON public.airport_hours FOR SELECT TO app_user USING (true);
--> statement-breakpoint
CREATE POLICY airport_hours_insert ON public.airport_hours FOR INSERT TO app_user
  WITH CHECK (public.airport_role_of(airport_ident) = 'manager');
--> statement-breakpoint
CREATE POLICY airport_hours_delete ON public.airport_hours FOR DELETE TO app_user
  USING (public.airport_role_of(airport_ident) = 'manager');
--> statement-breakpoint
CREATE TRIGGER airport_hours_limited BEFORE INSERT ON public.airport_hours
  FOR EACH ROW EXECUTE FUNCTION public.airport_rows_limited('28');
--> statement-breakpoint

GRANT SELECT, INSERT, DELETE ON public.airport_closures TO app_user;
--> statement-breakpoint
CREATE POLICY airport_closures_select ON public.airport_closures FOR SELECT TO app_user
  USING (true);
--> statement-breakpoint
CREATE POLICY airport_closures_insert ON public.airport_closures FOR INSERT TO app_user
  WITH CHECK (public.airport_role_of(airport_ident) = 'manager');
--> statement-breakpoint
CREATE POLICY airport_closures_delete ON public.airport_closures FOR DELETE TO app_user
  USING (public.airport_role_of(airport_ident) = 'manager');
--> statement-breakpoint
CREATE TRIGGER airport_closures_limited BEFORE INSERT ON public.airport_closures
  FOR EACH ROW EXECUTE FUNCTION public.airport_rows_limited('100');
--> statement-breakpoint

GRANT SELECT, INSERT, DELETE ON public.airport_fees TO app_user;
--> statement-breakpoint
CREATE POLICY airport_fees_select ON public.airport_fees FOR SELECT TO app_user USING (true);
--> statement-breakpoint
CREATE POLICY airport_fees_insert ON public.airport_fees FOR INSERT TO app_user
  WITH CHECK (public.airport_role_of(airport_ident) = 'manager');
--> statement-breakpoint
CREATE POLICY airport_fees_delete ON public.airport_fees FOR DELETE TO app_user
  USING (public.airport_role_of(airport_ident) = 'manager');
--> statement-breakpoint
CREATE TRIGGER airport_fees_limited BEFORE INSERT ON public.airport_fees
  FOR EACH ROW EXECUTE FUNCTION public.airport_rows_limited('50');
