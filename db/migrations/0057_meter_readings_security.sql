-- Meter continuity between rentals (BKG-7): readings the owner records between rentals, and the
-- owner's explanation of a gap before a rental.

-- Only the aircraft's owner records, sees and removes its readings; admins can read them.
-- The author and creation time are set by the trigger below, whatever is sent.
GRANT SELECT, INSERT, DELETE ON public.meter_readings TO app_user;
--> statement-breakpoint
CREATE POLICY meter_readings_select ON public.meter_readings FOR SELECT TO app_user
  USING (public.user_has_role('admin') OR EXISTS (
    SELECT 1 FROM public.aircraft a
    WHERE a.id = aircraft_id AND a.owner_id = app.current_user_id()));
--> statement-breakpoint
CREATE POLICY meter_readings_insert ON public.meter_readings FOR INSERT TO app_user
  WITH CHECK (EXISTS (SELECT 1 FROM public.aircraft a
                      WHERE a.id = aircraft_id AND a.owner_id = app.current_user_id()));
--> statement-breakpoint
CREATE POLICY meter_readings_delete ON public.meter_readings FOR DELETE TO app_user
  USING (EXISTS (SELECT 1 FROM public.aircraft a
                 WHERE a.id = aircraft_id AND a.owner_id = app.current_user_id()));
--> statement-breakpoint

-- The author and creation time are ours; a reading can't be from the future.
CREATE OR REPLACE FUNCTION public.meter_reading_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.created_by := app.current_user_id();
  NEW.created_at := now();
  IF NEW.read_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'reading_in_future';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER meter_readings_defaults BEFORE INSERT ON public.meter_readings
  FOR EACH ROW EXECUTE FUNCTION public.meter_reading_defaults();
--> statement-breakpoint

-- The owner explains a meter gap before a rental (or clears the explanation with NULL).
CREATE OR REPLACE FUNCTION public.explain_meter_gap(log_id uuid, reason public.meter_gap_reason)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.flight_logs l SET meter_gap_reason = reason
  FROM public.bookings b
  WHERE l.id = log_id AND b.id = l.booking_id AND b.owner_id = app.current_user_id();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.explain_meter_gap(uuid, public.meter_gap_reason) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.explain_meter_gap(uuid, public.meter_gap_reason) TO app_user;
