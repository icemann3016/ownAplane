-- The pilot's logbook (LOG-1…4): only the pilot (and admins, to read) see it; drafts are the
-- pilot's to change; certified entries are never changed or deleted. Certifying, corrections and
-- striking through go through the functions below; ownAplane rentals arrive as drafts.

GRANT SELECT, INSERT, DELETE ON public.logbook_entries TO app_user;
--> statement-breakpoint
GRANT UPDATE (date, departure_place, departure_time, arrival_place, arrival_time, aircraft_type,
  registration, se_minutes, me_minutes, mp_minutes, total_minutes, pic_name, landings_day,
  landings_night, night_minutes, ifr_minutes, pic_minutes, copilot_minutes, dual_minutes,
  instructor_minutes, fstd_type, fstd_minutes, remarks) ON public.logbook_entries TO app_user;
--> statement-breakpoint
CREATE POLICY logbook_entries_select ON public.logbook_entries FOR SELECT TO app_user
  USING (pilot_id = app.current_user_id() OR public.user_has_role('admin'));
--> statement-breakpoint
CREATE POLICY logbook_entries_insert ON public.logbook_entries FOR INSERT TO app_user
  WITH CHECK (pilot_id = app.current_user_id() AND status = 'draft'
    AND source IN ('manual', 'scan') AND flight_leg_id IS NULL
    AND certified_at IS NULL AND superseded_at IS NULL AND void_reason IS NULL);
--> statement-breakpoint
CREATE POLICY logbook_entries_update ON public.logbook_entries FOR UPDATE TO app_user
  USING (pilot_id = app.current_user_id() AND status = 'draft')
  WITH CHECK (pilot_id = app.current_user_id() AND status = 'draft');
--> statement-breakpoint
CREATE POLICY logbook_entries_delete ON public.logbook_entries FOR DELETE TO app_user
  USING (pilot_id = app.current_user_id() AND status = 'draft');
--> statement-breakpoint

-- A certified entry is locked for the app, whatever the policies say; a correction must point
-- to one of the pilot's own certified entries.
CREATE OR REPLACE FUNCTION public.logbook_entries_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user = 'app_user' AND TG_OP IN ('UPDATE', 'DELETE') AND OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'certified_locked';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF NEW.corrects_id IS NOT NULL AND current_user = 'app_user' AND NOT EXISTS (
    SELECT 1 FROM public.logbook_entries e
    WHERE e.id = NEW.corrects_id AND e.pilot_id = NEW.pilot_id AND e.status = 'certified'
  ) THEN
    RAISE EXCEPTION 'bad_correction';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER logbook_entries_guard BEFORE INSERT OR UPDATE OR DELETE ON public.logbook_entries
  FOR EACH ROW EXECUTE FUNCTION public.logbook_entries_guard();
--> statement-breakpoint

-- The pilot certifies drafts (all or nothing). A certified correction supersedes the entry it
-- corrects. Returns how many were certified.
CREATE OR REPLACE FUNCTION public.certify_logbook_entries(entry_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := app.current_user_id();
  e public.logbook_entries%ROWTYPE;
  n integer := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  FOR e IN
    SELECT * FROM public.logbook_entries
    WHERE id = ANY (entry_ids) AND pilot_id = uid AND status = 'draft'
    ORDER BY date, departure_time NULLS FIRST, created_at
    FOR UPDATE
  LOOP
    IF e.date > (now() AT TIME ZONE 'utc')::date THEN
      RAISE EXCEPTION 'date_in_future';
    END IF;
    IF (e.kind = 'flight' AND (e.total_minutes IS NULL OR e.departure_place IS NULL
          OR e.arrival_place IS NULL OR e.aircraft_type IS NULL OR e.registration IS NULL
          OR e.pic_name IS NULL))
       OR (e.kind = 'fstd' AND (e.fstd_minutes IS NULL OR e.fstd_type IS NULL)) THEN
      RAISE EXCEPTION 'incomplete';
    END IF;
    IF e.corrects_id IS NOT NULL THEN
      UPDATE public.logbook_entries SET status = 'superseded', superseded_at = now()
      WHERE id = e.corrects_id AND pilot_id = uid AND status = 'certified';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'already_corrected';
      END IF;
    END IF;
    UPDATE public.logbook_entries SET status = 'certified', certified_at = now() WHERE id = e.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.certify_logbook_entries(uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.certify_logbook_entries(uuid[]) TO app_user;
--> statement-breakpoint

-- Strike through a certified entry without a replacement (e.g. a flight recorded twice).
CREATE OR REPLACE FUNCTION public.void_logbook_entry(entry_id uuid, reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF reason IS NULL OR char_length(btrim(reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;
  UPDATE public.logbook_entries
  SET status = 'superseded', superseded_at = now(), void_reason = btrim(reason)
  WHERE id = entry_id AND pilot_id = app.current_user_id() AND status = 'certified';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.void_logbook_entry(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.void_logbook_entry(uuid, text) TO app_user;
--> statement-breakpoint

-- LOG-4: when the owner confirms a flight log, each leg becomes a draft entry in the pilot's
-- logbook (block off to block on, as PIC, single-engine by default; the pilot completes it).
CREATE OR REPLACE FUNCTION public.logbook_from_flight_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' THEN
    INSERT INTO public.logbook_entries (pilot_id, kind, status, source, date, departure_place,
      departure_time, arrival_place, arrival_time, aircraft_type, registration, se_minutes,
      total_minutes, pic_name, landings_day, landings_night, pic_minutes, flight_leg_id)
    SELECT b.pilot_id, 'flight', 'draft', 'ownaplane',
      (leg.block_off AT TIME ZONE 'utc')::date,
      coalesce(fa.icao_code, leg.from_ident), (leg.block_off AT TIME ZONE 'utc')::time(0),
      coalesce(ta.icao_code, leg.to_ident), (leg.block_on AT TIME ZONE 'utc')::time(0),
      left(btrim(a.manufacturer || ' ' || a.model), 60), a.registration,
      m.minutes, m.minutes, left(p.display_name, 100), leg.landings, 0, m.minutes, leg.id
    FROM public.flight_legs leg
    JOIN public.bookings b ON b.id = NEW.booking_id
    JOIN public.aircraft a ON a.id = b.aircraft_id
    JOIN public.profiles p ON p.id = b.pilot_id
    LEFT JOIN public.airports fa ON fa.ident = leg.from_ident
    LEFT JOIN public.airports ta ON ta.ident = leg.to_ident
    CROSS JOIN LATERAL (
      SELECT least(1440, round(extract(epoch FROM leg.block_on - leg.block_off) / 60))::integer
        AS minutes
    ) m
    WHERE leg.flight_log_id = NEW.id
    ON CONFLICT (flight_leg_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.logbook_from_flight_log() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER flight_logs_to_logbook AFTER UPDATE OF status ON public.flight_logs
  FOR EACH ROW EXECUTE FUNCTION public.logbook_from_flight_log();
