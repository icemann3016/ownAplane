-- Favourite aircraft and saved searches with alerts (SRC-6). Each user sees and changes only
-- their own; the alert job (trusted, owner connection) keeps the hits.

GRANT SELECT, INSERT, DELETE ON public.favourite_aircraft TO app_user;
--> statement-breakpoint
CREATE POLICY favourite_aircraft_select ON public.favourite_aircraft FOR SELECT TO app_user
  USING (user_id = app.current_user_id());
--> statement-breakpoint
-- Only aircraft the user may see (RLS on aircraft applies inside the check).
CREATE POLICY favourite_aircraft_insert ON public.favourite_aircraft FOR INSERT TO app_user
  WITH CHECK (user_id = app.current_user_id()
    AND EXISTS (SELECT 1 FROM public.aircraft a WHERE a.id = aircraft_id));
--> statement-breakpoint
CREATE POLICY favourite_aircraft_delete ON public.favourite_aircraft FOR DELETE TO app_user
  USING (user_id = app.current_user_id());
--> statement-breakpoint

GRANT SELECT, INSERT, DELETE ON public.saved_searches TO app_user;
--> statement-breakpoint
GRANT UPDATE (name, query, alerts) ON public.saved_searches TO app_user;
--> statement-breakpoint
CREATE POLICY saved_searches_select ON public.saved_searches FOR SELECT TO app_user
  USING (user_id = app.current_user_id());
--> statement-breakpoint
CREATE POLICY saved_searches_insert ON public.saved_searches FOR INSERT TO app_user
  WITH CHECK (user_id = app.current_user_id());
--> statement-breakpoint
CREATE POLICY saved_searches_update ON public.saved_searches FOR UPDATE TO app_user
  USING (user_id = app.current_user_id()) WITH CHECK (user_id = app.current_user_id());
--> statement-breakpoint
CREATE POLICY saved_searches_delete ON public.saved_searches FOR DELETE TO app_user
  USING (user_id = app.current_user_id());
--> statement-breakpoint

-- Timestamps are ours; at most 20 saved searches per user.
CREATE OR REPLACE FUNCTION public.saved_search_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.created_at := now();
  NEW.last_alert_at := NULL;
  IF (SELECT count(*) FROM public.saved_searches WHERE user_id = NEW.user_id) >= 20 THEN
    RAISE EXCEPTION 'too_many_searches';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER saved_searches_defaults BEFORE INSERT ON public.saved_searches
  FOR EACH ROW EXECUTE FUNCTION public.saved_search_defaults();
--> statement-breakpoint

-- saved_search_hits: no access for app_user (the alert job keeps them).
