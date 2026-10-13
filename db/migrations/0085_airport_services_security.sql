-- Services and prices of an airfield (Zlati, 2026-10-13): everyone reads them; only the
-- airfield's managers change them (airport_role_of(), 0080), at most 100 per airfield.
GRANT SELECT, INSERT, DELETE ON public.airport_services TO app_user;
--> statement-breakpoint
GRANT UPDATE (category, label, fuel_type, max_mtom_kg, price, unit, note)
  ON public.airport_services TO app_user;
--> statement-breakpoint
CREATE POLICY airport_services_select ON public.airport_services FOR SELECT TO app_user
  USING (true);
--> statement-breakpoint
CREATE POLICY airport_services_insert ON public.airport_services FOR INSERT TO app_user
  WITH CHECK (public.airport_role_of(airport_ident) = 'manager');
--> statement-breakpoint
CREATE POLICY airport_services_update ON public.airport_services FOR UPDATE TO app_user
  USING (public.airport_role_of(airport_ident) = 'manager')
  WITH CHECK (public.airport_role_of(airport_ident) = 'manager');
--> statement-breakpoint
CREATE POLICY airport_services_delete ON public.airport_services FOR DELETE TO app_user
  USING (public.airport_role_of(airport_ident) = 'manager');
--> statement-breakpoint
CREATE TRIGGER airport_services_limited BEFORE INSERT ON public.airport_services
  FOR EACH ROW EXECUTE FUNCTION public.airport_rows_limited('100');
--> statement-breakpoint

-- Copy the fees, the ticked services and the fuels into the new list. The old fees table and
-- columns stay until the next release (the version live during this deploy still reads them).
INSERT INTO public.airport_services (airport_ident, category, label, max_mtom_kg, price, unit)
SELECT airport_ident,
  (CASE kind WHEN 'landing' THEN 'landing' WHEN 'parking' THEN 'parking_apron'
             WHEN 'hangar' THEN 'parking_hangar' ELSE 'other' END)::public.airport_service_category,
  CASE WHEN kind = 'other' THEN coalesce(nullif(btrim(label), ''), 'Other') ELSE label END,
  max_mtom_kg, amount, unit::text::public.airport_service_unit
FROM public.airport_fees;
--> statement-breakpoint
INSERT INTO public.airport_services (airport_ident, category, label, unit)
SELECT o.airport_ident, m.category::public.airport_service_category, m.label,
  m.unit::public.airport_service_unit
FROM public.airport_operators o
CROSS JOIN LATERAL unnest(o.services) AS s(code)
JOIN (VALUES
  ('apron_parking', 'parking_apron', NULL, 'night'),
  ('hangar', 'parking_hangar', NULL, 'night'),
  ('handling', 'ground_handling', NULL, 'movement'),
  ('customs', 'customs', NULL, 'once'),
  ('immigration', 'other', 'Border control', 'once'),
  ('tie_downs', 'other', 'Tie-downs', 'night'),
  ('maintenance', 'other', 'Maintenance', 'once'),
  ('catering', 'other', 'Catering', 'once'),
  ('transport', 'other', 'Taxi / transport', 'once'),
  ('restaurant', 'other', 'Restaurant', 'once'),
  ('accommodation', 'other', 'Accommodation', 'night'),
  ('briefing_room', 'other', 'Briefing room', 'once')
) AS m(code, category, label, unit) ON m.code = s.code
-- A fee already gives the price of apron parking or the hangar.
WHERE m.category = 'other' OR NOT EXISTS (
  SELECT 1 FROM public.airport_services x
  WHERE x.airport_ident = o.airport_ident
    AND x.category = m.category::public.airport_service_category
);
--> statement-breakpoint
INSERT INTO public.airport_services (airport_ident, category, fuel_type, unit)
SELECT o.airport_ident, 'fuel', f, 'litre'
FROM public.airport_operators o CROSS JOIN LATERAL unnest(o.fuels) AS f;
--> statement-breakpoint

-- Airfield accounts aren't pilot accounts (Zlati, 2026-10-13): someone on an airfield's team,
-- or with an open claim for one, can't have the pilot role, and a pilot can't claim or join an
-- airfield (they use a separate account). The owner role stays possible: airfields rent out
-- aircraft too.
CREATE OR REPLACE FUNCTION public.airport_team_not_pilot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id AND role = 'pilot') THEN
    RAISE EXCEPTION 'operator_not_pilot' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER airport_members_not_pilot BEFORE INSERT ON public.airport_members
  FOR EACH ROW EXECUTE FUNCTION public.airport_team_not_pilot();
--> statement-breakpoint
CREATE TRIGGER airport_claims_not_pilot BEFORE INSERT ON public.airport_claims
  FOR EACH ROW EXECUTE FUNCTION public.airport_team_not_pilot();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.pilot_role_not_operator()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.role = 'pilot' AND (
    EXISTS (SELECT 1 FROM public.airport_members WHERE user_id = NEW.user_id)
    OR EXISTS (SELECT 1 FROM public.airport_claims
               WHERE user_id = NEW.user_id AND status IN ('unconfirmed', 'pending'))
  ) THEN
    RAISE EXCEPTION 'operator_not_pilot' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER user_roles_pilot_not_operator BEFORE INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.pilot_role_not_operator();
