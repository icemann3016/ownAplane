-- Plans and payments (SUB-1…10) and AI reading credits. Users read their own billing rows; only
-- trusted code (payment events, admins, the daily job) writes them. The plan a user has is
-- public.plan_of(): the highest of an active subscription, a plan grant and the beta switch.
-- Plan limits are enforced here (SUB-3): listed and featured aircraft, saved searches; instant
-- booking needs an owner plan. Plans in order: free < pilot (Pilot Plus) < owner < fleet; each
-- includes what the lower ones give. Limits mirror lib/billing/plans.ts (a test keeps them equal).

GRANT SELECT ON public.subscriptions, public.plan_grants, public.billing_checkouts,
  public.billing_payments, public.ai_credit_entries, public.billing_settings TO app_user;
--> statement-breakpoint
CREATE POLICY subscriptions_select ON public.subscriptions FOR SELECT TO app_user
  USING (user_id = app.current_user_id() OR public.user_has_role('admin'));
--> statement-breakpoint
CREATE POLICY plan_grants_select ON public.plan_grants FOR SELECT TO app_user
  USING (user_id = app.current_user_id() OR public.user_has_role('admin'));
--> statement-breakpoint
CREATE POLICY billing_checkouts_select ON public.billing_checkouts FOR SELECT TO app_user
  USING (user_id = app.current_user_id());
--> statement-breakpoint
CREATE POLICY billing_payments_select ON public.billing_payments FOR SELECT TO app_user
  USING (user_id = app.current_user_id() OR public.user_has_role('admin'));
--> statement-breakpoint
CREATE POLICY ai_credit_entries_select ON public.ai_credit_entries FOR SELECT TO app_user
  USING (user_id = app.current_user_id() OR public.user_has_role('admin'));
--> statement-breakpoint
CREATE POLICY billing_settings_select ON public.billing_settings FOR SELECT TO app_user
  USING (true);
--> statement-breakpoint
-- billing_events: no access for app_user.

INSERT INTO public.billing_settings (id, beta) VALUES (true, true) ON CONFLICT DO NOTHING;
--> statement-breakpoint
GRANT UPDATE (featured) ON public.aircraft TO app_user;
--> statement-breakpoint

-- Plans, in order, and their limits (as lib/billing/plans.ts).
CREATE OR REPLACE FUNCTION public.plan_rank(p public.plan_name)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p WHEN 'fleet' THEN 3 WHEN 'owner' THEN 2 WHEN 'pilot' THEN 1 ELSE 0 END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.plan_limit(p public.plan_name, what text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE what
    WHEN 'aircraft' THEN CASE p WHEN 'fleet' THEN 10 WHEN 'owner' THEN 2 ELSE 1 END
    WHEN 'featured' THEN CASE p WHEN 'fleet' THEN 3 WHEN 'owner' THEN 1 ELSE 0 END
    WHEN 'saved_searches' THEN CASE p WHEN 'free' THEN 2 ELSE 20 END
  END
$$;
--> statement-breakpoint

-- The plan a user has at a moment (now by default, or ahead for warnings): the highest of
--   an active subscription (after its period ends it renews into the scheduled plan unless
--   cancelled), a subscription whose payment failed until its grace ends (SUB-6),
--   an unrevoked plan grant, and the beta switch (Owner for everyone);
-- else free. `until`: when that source ends, if known. Without `with_beta` (the AI allowance)
-- the beta doesn't count.
CREATE OR REPLACE FUNCTION public.plan_of(uid uuid, at timestamptz DEFAULT now(),
  with_beta boolean DEFAULT true)
RETURNS TABLE (plan public.plan_name, source text, until timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.plan, c.source, c.until FROM (
    SELECT CASE WHEN at < s.current_period_end THEN s.plan
                ELSE coalesce(s.scheduled_plan, s.plan) END AS plan,
           'subscription' AS source,
           CASE WHEN s.cancel_at_period_end OR at < s.current_period_end
                THEN s.current_period_end END AS until
    FROM public.subscriptions s
    WHERE s.user_id = uid AND s.status = 'active'
      AND (at < s.current_period_end OR NOT s.cancel_at_period_end)
    UNION ALL
    SELECT s.plan, 'subscription', s.grace_until
    FROM public.subscriptions s
    WHERE s.user_id = uid AND s.status = 'past_due' AND at < s.grace_until
    UNION ALL
    SELECT g.plan, g.reason::text, g.ends_at
    FROM public.plan_grants g
    WHERE g.user_id = uid AND g.revoked_at IS NULL AND g.starts_at <= at
      AND (g.ends_at IS NULL OR at < g.ends_at)
    UNION ALL
    SELECT 'owner'::public.plan_name, 'beta', b.beta_ends_at
    FROM public.billing_settings b
    WHERE with_beta AND b.beta AND (b.beta_ends_at IS NULL OR at < b.beta_ends_at)
    UNION ALL
    SELECT 'free'::public.plan_name, 'free', NULL::timestamptz
  ) c
  ORDER BY public.plan_rank(c.plan) DESC, (c.source = 'subscription') DESC,
    (c.source = 'beta'), c.until DESC NULLS FIRST
  LIMIT 1
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.plan_of(uuid, timestamptz, boolean) FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.my_plan()
RETURNS TABLE (plan public.plan_name, source text, until timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT * FROM public.plan_of(app.current_user_id())
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.my_plan() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.my_plan() TO app_user;
--> statement-breakpoint

-- Refuses one more listed (or featured) aircraft beyond the owner's plan: 'plan_limit' with
-- the kind and the limit as detail. Users can only ask about themselves.
CREATE OR REPLACE FUNCTION public.check_plan_limit(owner uuid, target uuid, what text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  lim integer;
  used integer;
BEGIN
  IF app.current_user_id() IS NOT NULL AND app.current_user_id() <> owner THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  SELECT public.plan_limit(p.plan, what) INTO lim FROM public.plan_of(owner) p;
  SELECT count(*) INTO used FROM public.aircraft a
  WHERE a.owner_id = owner AND a.id <> target AND a.status = 'listed'
    AND (what = 'aircraft' OR a.featured);
  IF used >= lim THEN
    RAISE EXCEPTION 'plan_limit' USING ERRCODE = 'check_violation', DETAIL = what || ':' || lim;
  END IF;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.check_plan_limit(uuid, uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.check_plan_limit(uuid, uuid, text) TO app_user;
--> statement-breakpoint

-- Listing: as before (0046), plus the plan's limit on listed aircraft; a featured aircraft
-- beyond the plan's featured spots is listed without the label. Remembers when it was listed.
CREATE OR REPLACE FUNCTION public.check_aircraft_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  gaps text[];
BEGIN
  IF NEW.status = 'draft' AND OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'aircraft_cannot_return_to_draft' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'listed' AND OLD.status <> 'listed' THEN
    IF OLD.unlisted_reason IN ('admin', 'suspended')
       OR EXISTS (SELECT 1 FROM public.profiles p
                  WHERE p.id = NEW.owner_id AND p.suspended_at IS NOT NULL) THEN
      RAISE EXCEPTION 'aircraft_blocked' USING ERRCODE = 'check_violation';
    END IF;
    gaps := public.aircraft_listing_gaps(NEW.id);
    IF cardinality(gaps) > 0 THEN
      RAISE EXCEPTION 'aircraft_not_listable'
        USING ERRCODE = 'check_violation', DETAIL = array_to_string(gaps, ',');
    END IF;
    PERFORM public.check_plan_limit(NEW.owner_id, NEW.id, 'aircraft');
    IF NEW.featured THEN
      BEGIN
        PERFORM public.check_plan_limit(NEW.owner_id, NEW.id, 'featured');
      EXCEPTION WHEN check_violation THEN
        NEW.featured := false;
      END;
    END IF;
    NEW.unlisted_reason := NULL;
    NEW.listed_at := now();
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.check_aircraft_featured()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.featured AND NOT OLD.featured AND NEW.status = 'listed' THEN
    PERFORM public.check_plan_limit(NEW.owner_id, NEW.id, 'featured');
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER aircraft_check_featured BEFORE UPDATE OF featured ON public.aircraft
  FOR EACH ROW EXECUTE FUNCTION public.check_aircraft_featured();
--> statement-breakpoint

-- Founding owners (SUB-9): listing a first aircraft during the beta, or after it until the
-- cut-off day, gives the Owner plan for 12 months (counted from the end of the beta).
CREATE OR REPLACE FUNCTION public.grant_founding_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  b public.billing_settings%ROWTYPE;
  in_beta boolean;
BEGIN
  SELECT * INTO b FROM public.billing_settings WHERE id;
  in_beta := b.beta AND (b.beta_ends_at IS NULL OR now() < b.beta_ends_at);
  IF in_beta OR (b.founding_cutoff IS NOT NULL
                 AND (now() AT TIME ZONE 'utc')::date <= b.founding_cutoff) THEN
    INSERT INTO public.plan_grants (user_id, plan, reason, ends_at, note)
    VALUES (NEW.owner_id, 'owner', 'founding',
            CASE WHEN in_beta AND b.beta_ends_at IS NULL THEN NULL
                 ELSE greatest(now(), coalesce(b.beta_ends_at, now())) + interval '12 months'
            END,
            'Founding owner')
    ON CONFLICT (user_id) WHERE reason = 'founding' DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER aircraft_founding_owner AFTER UPDATE OF status ON public.aircraft
  FOR EACH ROW WHEN (NEW.status = 'listed' AND OLD.status <> 'listed')
  EXECUTE FUNCTION public.grant_founding_owner();
--> statement-breakpoint

-- Owners who listed before plans existed are founding owners (Fleet when more than the Owner
-- plan's 2 aircraft are listed, so nothing gets unlisted); their aircraft keep their order.
INSERT INTO public.plan_grants (user_id, plan, reason, note)
SELECT a.owner_id,
  CASE WHEN count(*) FILTER (WHERE a.status = 'listed') > 2 THEN 'fleet'::public.plan_name
       ELSE 'owner'::public.plan_name END,
  'founding'::public.plan_grant_reason, 'Founding owner'
FROM public.aircraft a WHERE a.status <> 'draft'
GROUP BY a.owner_id
ON CONFLICT (user_id) WHERE reason = 'founding' DO NOTHING;
--> statement-breakpoint
UPDATE public.aircraft SET listed_at = updated_at WHERE status = 'listed' AND listed_at IS NULL;
--> statement-breakpoint

-- Instant booking (BKG-4) is a paid feature (SUB-10): as in 0036, plus the owner's plan.
CREATE OR REPLACE FUNCTION public.request_booking(
  target uuid,
  wanted tstzrange,
  departure text,
  arrival text,
  stops text[],
  purpose public.booking_purpose,
  passengers integer,
  planned_hours numeric,
  message text,
  estimate numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  me uuid := app.current_user_id();
  plane public.aircraft%ROWTYPE;
  fields text[] := ARRAY[departure] || coalesce(stops, '{}') || ARRAY[arrival];
  failed text;
  new_id uuid;
  instant boolean;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not_logged_in' USING ERRCODE = '42501';
  END IF;
  PERFORM public.expire_booking_requests();
  SELECT * INTO plane FROM public.aircraft WHERE id = target;
  IF NOT FOUND OR plane.status <> 'listed' OR plane.price_per_hour IS NULL THEN
    RAISE EXCEPTION 'aircraft_unavailable';
  END IF;
  IF wanted IS NULL OR isempty(wanted) OR lower(wanted) < now() THEN
    RAISE EXCEPTION 'period_in_past';
  END IF;
  IF upper(wanted) - lower(wanted) < interval '30 minutes'
     OR upper(wanted) - lower(wanted) > interval '14 days' THEN
    RAISE EXCEPTION 'period_length';
  END IF;
  IF passengers < 0 OR passengers > plane.seats - 1 THEN
    RAISE EXCEPTION 'too_many_passengers' USING DETAIL = (plane.seats - 1)::text;
  END IF;
  IF (SELECT count(*) FROM public.airports a WHERE a.ident = ANY (fields))
     < (SELECT count(DISTINCT f) FROM unnest(fields) f) THEN
    RAISE EXCEPTION 'unknown_airfield';
  END IF;
  SELECT string_agg(f.requirement, ',') INTO failed
  FROM public.eligibility_failures(me, target, wanted, fields) f WHERE f.blocking;
  IF failed IS NOT NULL THEN
    RAISE EXCEPTION 'not_eligible' USING DETAIL = failed;
  END IF;

  INSERT INTO public.bookings (
    aircraft_id, pilot_id, owner_id, period, departure_ident, arrival_ident, stops, purpose,
    passengers, planned_hours, message, price_per_hour, currency, price_basis, time_basis,
    estimate, checkout_required, expires_at)
  VALUES (
    target, me, plane.owner_id, wanted, departure, arrival, coalesce(stops, '{}'), purpose,
    passengers, planned_hours, nullif(btrim(message), ''), plane.price_per_hour, plane.currency,
    plane.price_basis, plane.time_basis, estimate,
    EXISTS (SELECT 1 FROM public.eligibility_failures(me, target, wanted, fields) f
            WHERE f.requirement = 'checkout'),
    least(now() + interval '24 hours', lower(wanted)))
  RETURNING id INTO new_id;
  -- Holds the time; a clash with another entry raises exclusion_violation (23P01).
  INSERT INTO public.calendar_entries (aircraft_id, period, kind, booking_id, created_by)
  VALUES (target, wanted, 'booking', new_id, me);
  -- Instant booking (BKG-4): the owner allows it and has an owner plan (SUB-10), no checkout
  -- flight is pending, and the pilot has completed a rental of it before.
  instant := EXISTS (SELECT 1 FROM public.rental_requirements r
                     WHERE r.aircraft_id = target AND r.instant_booking)
    AND (SELECT public.plan_rank(p.plan) FROM public.plan_of(plane.owner_id) p) >= 2
    -- Blocking failures were refused above; of the conditions, a checkout flight is for the
    -- owner to arrange (a night flight is only a note to the pilot).
    AND NOT EXISTS (SELECT 1 FROM public.eligibility_failures(me, target, wanted, fields) f
                    WHERE f.requirement = 'checkout')
    AND EXISTS (SELECT 1 FROM public.bookings b
                WHERE b.aircraft_id = target AND b.pilot_id = me AND b.status = 'completed');
  IF instant THEN
    UPDATE public.bookings SET status = 'accepted', responded_at = now() WHERE id = new_id;
    INSERT INTO public.booking_events (booking_id, actor_id, type, payload)
    VALUES (new_id, me, 'instant_booked', jsonb_build_object('estimate', estimate));
  ELSE
    INSERT INTO public.booking_events (booking_id, actor_id, type, payload)
    VALUES (new_id, me, 'requested', jsonb_build_object('estimate', estimate));
  END IF;
  RETURN new_id;
END;
$$;
--> statement-breakpoint

-- A limit of the signed-in user's plan (saved searches…), for the app's own triggers.
CREATE OR REPLACE FUNCTION public.my_plan_limit(what text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.plan_limit(p.plan, what) FROM public.plan_of(app.current_user_id()) p
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.my_plan_limit(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.my_plan_limit(text) TO app_user;
--> statement-breakpoint

-- Saved searches (SRC-6): as in 0061, but as many as the plan allows (Free 2, Pilot Plus and up 20).
CREATE OR REPLACE FUNCTION public.saved_search_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.created_at := now();
  NEW.last_alert_at := NULL;
  IF (SELECT count(*) FROM public.saved_searches WHERE user_id = NEW.user_id)
     >= coalesce(public.my_plan_limit('saved_searches'), 20) THEN
    RAISE EXCEPTION 'too_many_searches';
  END IF;
  RETURN NEW;
END;
$$;
