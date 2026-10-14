-- Pilots' requests to airfields (APT-2…5, 7): the pilot sees theirs, the airfield's team sees its
-- airfield's, admins see all; nobody else. Pilots send and cancel; the team answers. Whether a
-- request waits for an answer is the airfield's choice (PPR required), never the pilot's.
GRANT SELECT, INSERT ON public.airport_requests TO app_user;
--> statement-breakpoint
GRANT UPDATE (status, ppr_number, conditions, operator_note) ON public.airport_requests TO app_user;
--> statement-breakpoint
CREATE POLICY airport_requests_select ON public.airport_requests FOR SELECT TO app_user
  USING (pilot_id = app.current_user_id()
    OR public.airport_role_of(airport_ident) IS NOT NULL
    OR public.user_has_role('admin'));
--> statement-breakpoint
CREATE POLICY airport_requests_insert ON public.airport_requests FOR INSERT TO app_user
  WITH CHECK (pilot_id = app.current_user_id() AND public.user_has_role('pilot'));
--> statement-breakpoint
CREATE POLICY airport_requests_update ON public.airport_requests FOR UPDATE TO app_user
  USING (pilot_id = app.current_user_id() OR public.airport_role_of(airport_ident) IS NOT NULL)
  WITH CHECK (pilot_id = app.current_user_id() OR public.airport_role_of(airport_ident) IS NOT NULL);
--> statement-breakpoint

-- A new request: the airfield's PPR setting decides its status (Zlati, 2026-10-13: without PPR
-- it's confirmed at once); the answer fields start empty; at most 20 a day per pilot.
CREATE OR REPLACE FUNCTION public.airport_request_new()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  op public.airport_operators%ROWTYPE;
BEGIN
  SELECT * INTO op FROM public.airport_operators WHERE airport_ident = NEW.airport_ident;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_airfield';
  END IF;
  IF current_user = 'app_user' THEN
    NEW.status := CASE WHEN op.ppr_required THEN 'pending' ELSE 'approved' END;
    NEW.auto_confirmed := NOT op.ppr_required;
    NEW.ppr_number := NULL;
    NEW.conditions := NULL;
    NEW.operator_note := NULL;
    NEW.answered_by := NULL;
    NEW.answered_at := NULL;
    NEW.currency := op.currency;
    NEW.created_at := now();
    NEW.updated_at := now();
    IF NEW.booking_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.bookings WHERE id = NEW.booking_id AND pilot_id = NEW.pilot_id
    ) THEN
      RAISE EXCEPTION 'booking_not_yours';
    END IF;
    IF least(NEW.arrival_at, NEW.departure_at) < now() - interval '1 hour' THEN
      RAISE EXCEPTION 'in_the_past';
    END IF;
    IF (SELECT count(*) FROM public.airport_requests
        WHERE pilot_id = NEW.pilot_id AND created_at > now() - interval '1 day') >= 20 THEN
      RAISE EXCEPTION 'too_many_requests';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER airport_requests_new BEFORE INSERT ON public.airport_requests
  FOR EACH ROW EXECUTE FUNCTION public.airport_request_new();
--> statement-breakpoint

-- The team approves or declines (also an auto-confirmed request, when something can't be
-- provided) and keeps the PPR number, conditions and note; the pilot can only cancel an open or
-- approved request. A cancelled request is closed.
CREATE OR REPLACE FUNCTION public.airport_request_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  me uuid := app.current_user_id();
BEGIN
  IF current_user = 'app_user' THEN
    IF OLD.status = 'cancelled' THEN
      RAISE EXCEPTION 'request_closed';
    END IF;
    IF public.airport_role_of(OLD.airport_ident) IS NOT NULL THEN
      IF NEW.status NOT IN ('approved', 'declined') THEN
        RAISE EXCEPTION 'not_allowed';
      END IF;
      NEW.answered_by := me;
      NEW.answered_at := now();
    ELSIF OLD.pilot_id = me THEN
      IF NEW.status <> 'cancelled' OR OLD.status NOT IN ('pending', 'approved')
         OR NEW.ppr_number IS DISTINCT FROM OLD.ppr_number
         OR NEW.conditions IS DISTINCT FROM OLD.conditions
         OR NEW.operator_note IS DISTINCT FROM OLD.operator_note THEN
        RAISE EXCEPTION 'not_allowed';
      END IF;
    ELSE
      RAISE EXCEPTION 'not_allowed';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER airport_requests_change BEFORE UPDATE ON public.airport_requests
  FOR EACH ROW EXECUTE FUNCTION public.airport_request_change();
--> statement-breakpoint

-- The services asked for: seen with their request; added by its pilot while it's open. Name,
-- unit and price come from the airfield's list, never from the pilot. At most 30 per request.
GRANT SELECT, INSERT ON public.airport_request_items TO app_user;
--> statement-breakpoint
CREATE POLICY airport_request_items_select ON public.airport_request_items FOR SELECT TO app_user
  USING (EXISTS (SELECT 1 FROM public.airport_requests r WHERE r.id = request_id));
--> statement-breakpoint
CREATE POLICY airport_request_items_insert ON public.airport_request_items FOR INSERT TO app_user
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.airport_requests r
    WHERE r.id = request_id AND r.pilot_id = app.current_user_id()
      AND r.status IN ('pending', 'approved')));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.airport_request_item_new()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  s public.airport_services%ROWTYPE;
BEGIN
  SELECT x.* INTO s FROM public.airport_services x
  JOIN public.airport_requests r ON r.airport_ident = x.airport_ident
  WHERE x.id = NEW.service_id AND r.id = NEW.request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_service';
  END IF;
  NEW.category := s.category;
  NEW.label := s.label;
  NEW.fuel_type := s.fuel_type;
  NEW.max_mtom_kg := s.max_mtom_kg;
  NEW.unit := s.unit;
  NEW.price := s.price;
  IF (SELECT count(*) FROM public.airport_request_items WHERE request_id = NEW.request_id) >= 30 THEN
    RAISE EXCEPTION 'too_many_rows';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER airport_request_items_new BEFORE INSERT ON public.airport_request_items
  FOR EACH ROW EXECUTE FUNCTION public.airport_request_item_new();
--> statement-breakpoint

-- Notifications (in the app and by email, following the booking switches in user_settings):
-- the team hears of new and cancelled requests, the pilot of answers and changes.
CREATE OR REPLACE FUNCTION public.notify_airport_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  kind text;
  recipients uuid[];
  actor uuid := app.current_user_id();
BEGIN
  IF TG_OP = 'INSERT' THEN
    kind := CASE WHEN NEW.status = 'approved' THEN 'apt_notice' ELSE 'apt_requested' END;
  ELSIF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    kind := 'apt_cancelled';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    kind := CASE NEW.status WHEN 'approved' THEN 'apt_approved' ELSE 'apt_declined' END;
  ELSIF NEW.ppr_number IS DISTINCT FROM OLD.ppr_number
     OR NEW.conditions IS DISTINCT FROM OLD.conditions
     OR NEW.operator_note IS DISTINCT FROM OLD.operator_note THEN
    kind := 'apt_updated';
  ELSE
    RETURN NEW;
  END IF;
  IF kind IN ('apt_requested', 'apt_notice', 'apt_cancelled') THEN
    SELECT array_agg(user_id) INTO recipients
    FROM public.airport_members WHERE airport_ident = NEW.airport_ident;
  ELSE
    recipients := ARRAY[NEW.pilot_id];
  END IF;
  INSERT INTO public.notifications (user_id, type, airport_request_id, actor_id, in_app, emailed_at)
  SELECT person, kind, NEW.id, actor, p.in_app, CASE WHEN NOT p.email THEN now() END
  FROM unnest(coalesce(recipients, ARRAY[]::uuid[])) AS person
  CROSS JOIN LATERAL (
    SELECT coalesce(s.email_bookings, true) AS email, coalesce(s.in_app_bookings, true) AS in_app
    FROM (SELECT 1) one
    LEFT JOIN public.user_settings s ON s.user_id = person) p
  WHERE person IS DISTINCT FROM actor AND (p.email OR p.in_app);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER airport_requests_notify AFTER INSERT OR UPDATE ON public.airport_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_airport_request();
