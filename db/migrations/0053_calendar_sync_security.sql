-- Calendar sync (SYN-1…5, plan §4.10): connections to other booking systems and their busy times.

-- Owners manage their aircraft's connections; admins can read them. The feed link may contain the
-- other system's secret and the export token is ours, so nobody else sees a connection. The sync
-- status columns are written only by trusted sync code (owner connection).
GRANT SELECT, INSERT, DELETE ON public.calendar_connections TO app_user;
--> statement-breakpoint
GRANT UPDATE (name, feed_url, api_key_hash, api_key_hint, export_token)
  ON public.calendar_connections TO app_user;
--> statement-breakpoint
CREATE POLICY calendar_connections_select ON public.calendar_connections FOR SELECT TO app_user
  USING (public.user_has_role('admin') OR EXISTS (
    SELECT 1 FROM public.aircraft a
    WHERE a.id = aircraft_id AND a.owner_id = app.current_user_id()));
--> statement-breakpoint
CREATE POLICY calendar_connections_insert ON public.calendar_connections FOR INSERT TO app_user
  WITH CHECK (last_sync_at IS NULL AND last_sync_error IS NULL AND last_sync_count IS NULL
    AND EXISTS (SELECT 1 FROM public.aircraft a
                WHERE a.id = aircraft_id AND a.owner_id = app.current_user_id()));
--> statement-breakpoint
CREATE POLICY calendar_connections_update ON public.calendar_connections FOR UPDATE TO app_user
  USING (EXISTS (SELECT 1 FROM public.aircraft a
                 WHERE a.id = aircraft_id AND a.owner_id = app.current_user_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.aircraft a
                      WHERE a.id = aircraft_id AND a.owner_id = app.current_user_id()));
--> statement-breakpoint
CREATE POLICY calendar_connections_delete ON public.calendar_connections FOR DELETE TO app_user
  USING (EXISTS (SELECT 1 FROM public.aircraft a
                 WHERE a.id = aircraft_id AND a.owner_id = app.current_user_id()));
--> statement-breakpoint

-- Author and timestamps are ours; at most 10 connections per aircraft.
CREATE OR REPLACE FUNCTION public.calendar_connection_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.created_by := coalesce(app.current_user_id(), NEW.created_by);
    IF (SELECT count(*) FROM public.calendar_connections c
        WHERE c.aircraft_id = NEW.aircraft_id) >= 10 THEN
      RAISE EXCEPTION 'too_many_connections';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER calendar_connections_defaults BEFORE INSERT OR UPDATE ON public.calendar_connections
  FOR EACH ROW EXECUTE FUNCTION public.calendar_connection_defaults();
--> statement-breakpoint

-- Owners still block time themselves, but external busy times come only from sync code.
DROP POLICY calendar_entries_insert ON public.calendar_entries;
--> statement-breakpoint
CREATE POLICY calendar_entries_insert ON public.calendar_entries FOR INSERT TO app_user
  WITH CHECK (kind <> 'booking' AND booking_id IS NULL AND active
    AND connection_id IS NULL AND external_id IS NULL AND NOT conflict
    AND EXISTS (SELECT 1 FROM public.aircraft a
                WHERE a.id = aircraft_id AND a.owner_id = app.current_user_id()));
--> statement-breakpoint

-- When an active entry is released (a booking cancelled or declined, a block removed), external
-- busy times that were held back because of it become active, if nothing else is in the way
-- (SYN-5). The rest stay inactive; `conflict` says whether a booking still overlaps them.
CREATE OR REPLACE FUNCTION public.calendar_reactivate_external()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  candidate uuid;
BEGIN
  FOR candidate IN
    SELECT c.id FROM public.calendar_entries c
    WHERE c.aircraft_id = OLD.aircraft_id AND c.connection_id IS NOT NULL AND NOT c.active
      AND c.period && OLD.period AND c.id <> OLD.id
    ORDER BY c.created_at
  LOOP
    BEGIN
      UPDATE public.calendar_entries SET active = true, conflict = false WHERE id = candidate;
    EXCEPTION WHEN exclusion_violation THEN
      UPDATE public.calendar_entries c SET conflict = EXISTS (
        SELECT 1 FROM public.calendar_entries b
        WHERE b.aircraft_id = c.aircraft_id AND b.active AND b.kind = 'booking'
          AND b.period && c.period)
      WHERE c.id = candidate;
    END;
  END LOOP;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.calendar_reactivate_external() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER calendar_entries_released AFTER UPDATE OF active ON public.calendar_entries
  FOR EACH ROW WHEN (OLD.active AND NOT NEW.active)
  EXECUTE FUNCTION public.calendar_reactivate_external();
--> statement-breakpoint
CREATE TRIGGER calendar_entries_removed AFTER DELETE ON public.calendar_entries
  FOR EACH ROW WHEN (OLD.active)
  EXECUTE FUNCTION public.calendar_reactivate_external();
