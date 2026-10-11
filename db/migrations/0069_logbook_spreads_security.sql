-- Scanned logbook spreads (LOG-6): the pilot's own, of their own uploads; admins may read.
GRANT SELECT, INSERT, DELETE ON public.logbook_spreads TO app_user;
--> statement-breakpoint
CREATE POLICY logbook_spreads_select ON public.logbook_spreads FOR SELECT TO app_user
  USING (pilot_id = app.current_user_id() OR public.user_has_role('admin'));
--> statement-breakpoint
CREATE POLICY logbook_spreads_insert ON public.logbook_spreads FOR INSERT TO app_user
  WITH CHECK (pilot_id = app.current_user_id()
    AND (left_document_id IS NULL OR EXISTS (SELECT 1 FROM public.documents d
         WHERE d.id = left_document_id AND d.owner_id = app.current_user_id()))
    AND (right_document_id IS NULL OR EXISTS (SELECT 1 FROM public.documents d
         WHERE d.id = right_document_id AND d.owner_id = app.current_user_id())));
--> statement-breakpoint
CREATE POLICY logbook_spreads_delete ON public.logbook_spreads FOR DELETE TO app_user
  USING (pilot_id = app.current_user_id());
--> statement-breakpoint

-- Entries read from a spread must point to one of the pilot's own spreads.
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
  IF NEW.spread_id IS NOT NULL AND current_user = 'app_user' AND NOT EXISTS (
    SELECT 1 FROM public.logbook_spreads s
    WHERE s.id = NEW.spread_id AND s.pilot_id = NEW.pilot_id
  ) THEN
    RAISE EXCEPTION 'bad_spread';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;
