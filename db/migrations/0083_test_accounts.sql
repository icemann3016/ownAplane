-- Test accounts on the live site (Zlati, 2026-10-13): a pilot, an owner with three aircraft and an
-- airfield manager, to try the whole app. The three accounts were signed up on the site, so their
-- password isn't in git; this does what only admins can: verified credentials and aircraft
-- documents (with placeholder files the owner uploaded), roles, a plan and an airfield team on a
-- made-up airfield. It does nothing where the accounts don't exist (development, CI, tests).
-- Remove them with Admin → Members → Delete member (the test airfield stays, without a team).
DO $$
DECLARE
  v_pilot uuid := (SELECT id FROM public.users WHERE email = 'pilot@test.ownaplane.eu');
  v_owner uuid := (SELECT id FROM public.users WHERE email = 'owner@test.ownaplane.eu');
  v_airport uuid := (SELECT id FROM public.users WHERE email = 'airport@test.ownaplane.eu');
  v_base text := CASE WHEN EXISTS (SELECT 1 FROM public.airports WHERE ident = 'LBSF')
                      THEN 'LBSF' END;
  v_plane uuid;
  v_doc uuid;
  r record;
  d record;
BEGIN
  -- Shared: confirmed email, no emails sent to the made-up addresses (in-app notifications stay).
  UPDATE public.users SET email_verified = true WHERE id IN (v_pilot, v_owner, v_airport);
  UPDATE public.user_settings
    SET email_bookings = false, email_reviews = false, email_messages = false
    WHERE user_id IN (v_pilot, v_owner, v_airport);

  -- The pilot: PPL(A) with SEP, MEP, IR and night, class 2 medical, 650 h -------------------------
  IF v_pilot IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.pilot_licences WHERE user_id = v_pilot)
  THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (v_pilot, 'pilot') ON CONFLICT DO NOTHING;
    UPDATE public.profiles
      SET bio = 'Test account: a pilot with SEP, MEP, IR and night ratings.',
          home_airport_ident = v_base
      WHERE id = v_pilot;
    INSERT INTO public.pilot_licences (user_id, type, issuing_state, number, issued_on, status,
        reviewed_at)
      VALUES (v_pilot, 'ppl_a', 'BG', 'BG.FCL.PPL.TEST1', '2015-05-20', 'verified', now());
    INSERT INTO public.pilot_ratings (user_id, kind, code, expires_on, status, reviewed_at) VALUES
      (v_pilot, 'class', 'SEP_LAND', current_date + 540, 'verified', now()),
      (v_pilot, 'class', 'MEP_LAND', current_date + 300, 'verified', now()),
      (v_pilot, 'privilege', 'IR', current_date + 300, 'verified', now()),
      (v_pilot, 'privilege', 'NIGHT', NULL, 'verified', now());
    INSERT INTO public.medicals (user_id, class, issuing_state, valid_until, status, reviewed_at)
      VALUES (v_pilot, 'class2', 'BG', current_date + 700, 'verified', now());
    INSERT INTO public.pilot_experience (user_id, total_hours, pic_hours, last_90_days_hours,
        birth_date)
      VALUES (v_pilot, 650, 540, 24, '1985-04-12')
      ON CONFLICT (user_id) DO NOTHING;
    INSERT INTO public.experience_by_type (user_id, aircraft_type, hours) VALUES
      (v_pilot, 'C172', 220), (v_pilot, 'P208', 40), (v_pilot, 'PA34', 35)
      ON CONFLICT DO NOTHING;
    INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, reason)
      VALUES (NULL, 'test_account', 'user', v_pilot, 'Test pilot (migration 0083)');
  END IF;

  -- The owner: Fleet plan, three aircraft with verified CofA, ARC and insurance -----------------
  IF v_owner IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.aircraft WHERE owner_id = v_owner)
  THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (v_owner, 'owner') ON CONFLICT DO NOTHING;
    UPDATE public.profiles
      SET bio = 'Test account: an owner with three test aircraft (ZZ-IFR, ZZ-VFR, ZZ-MEP).',
          home_airport_ident = v_base
      WHERE id = v_owner;
    INSERT INTO public.plan_grants (user_id, plan, reason, note)
      VALUES (v_owner, 'fleet', 'admin', 'Test account');

    FOR r IN SELECT * FROM (VALUES
      ('ZZ-IFR', 'Cessna', '172S Skyhawk SP', 'C172', 2008::smallint, 4::smallint,
       'Lycoming IO-360-L2A, 180 hp', 'avgas_100ll', 36.0, 120::smallint, 380::smallint,
       1157::smallint, 5.0, 'Garmin G1000 NXi, GFC 700 autopilot, ADS-B Out',
       true, 'adsb_out', true, true,
       'Test aircraft: IFR-equipped single-engine piston (SEP), approved for night VFR, with autopilot. Not a real aircraft.',
       190.00, 210.00, 'wet', 'hobbs', 1.0, 'moderate'),
      ('ZZ-VFR', 'Tecnam', 'P2008 JC', 'P208', 2019::smallint, 2::smallint,
       'Rotax 912 S2, 100 hp', 'ul91', 18.0, 105::smallint, 230::smallint,
       650::smallint, 4.5, 'Garmin G3X Touch, GTR 225 radio',
       false, 'mode_s', false, false,
       'Test aircraft: two-seat day VFR only, dry rate on the tachometer. Not a real aircraft.',
       130.00, NULL, 'dry', 'tach', NULL, 'flexible'),
      ('ZZ-MEP', 'Piper', 'PA-34-220T Seneca V', 'PA34', 2005::smallint, 6::smallint,
       '2 × Continental TSIO-360-RB, 220 hp', 'avgas_100ll', 85.0, 180::smallint, 590::smallint,
       2155::smallint, 5.5, 'Garmin GTN 750 + GTN 650, Aspen EFD1000, S-TEC 55X autopilot, weather radar, de-ice boots',
       true, 'adsb_out', true, true,
       'Test aircraft: multi-engine piston (MEP), IFR, night VFR, autopilot, over 2,000 kg (no LAPL). Not a real aircraft.',
       420.00, 450.00, 'wet', 'hobbs', 2.0, 'strict')
    ) AS t(reg, manufacturer, model, type, year, seats, engine, fuel, burn, cruise, useful, mtom,
           endurance, avionics, autopilot, transponder, night_vfr, ifr, description, price,
           weekend_price, price_basis, time_basis, min_hours, policy)
    LOOP
      INSERT INTO public.aircraft (owner_id, registration, manufacturer, model, type_designator,
          year, seats, engine, fuel_type, fuel_burn_lph, cruise_kt, useful_load_kg, mtom_kg,
          endurance_h, avionics, autopilot, transponder, night_vfr, ifr, description,
          home_airport_ident, price_per_hour, weekend_price_per_hour, currency, price_basis,
          time_basis, min_hours_per_day, cancellation_policy, status, unlisted_reason)
        VALUES (v_owner, r.reg, r.manufacturer, r.model, r.type, r.year, r.seats, r.engine,
          r.fuel::public.fuel_type, r.burn, r.cruise, r.useful, r.mtom, r.endurance, r.avionics,
          r.autopilot, r.transponder::public.transponder_type, r.night_vfr, r.ifr, r.description,
          v_base, r.price, r.weekend_price, 'EUR', r.price_basis::public.price_basis,
          r.time_basis::public.time_basis, r.min_hours,
          r.policy::public.cancellation_policy, 'unlisted', NULL)
        RETURNING id INTO v_plane;

      -- Who may rent it.
      INSERT INTO public.rental_requirements (aircraft_id, licence_types, required_ratings,
          min_total_hours, min_type_hours, min_90_days_hours, min_age, allow_unrated,
          checkout_first_rental, instant_booking)
        SELECT v_plane, x.licences::public.licence_type[], x.ratings, x.total, x.on_type,
            x.recent, x.age, true, x.checkout, x.instant
        FROM (VALUES
          ('ZZ-IFR', '{}'::text[], ARRAY['SEP_LAND'], 100.0, 5.0, 3.0, NULL::smallint, false, true),
          ('ZZ-VFR', '{}'::text[], ARRAY['SEP_LAND'], 50.0, NULL, NULL, NULL::smallint, true, false),
          ('ZZ-MEP', ARRAY['ppl_a', 'cpl_a', 'atpl_a'], ARRAY['MEP_LAND', 'IR'], 300.0, 10.0, 5.0,
            21::smallint, true, false)
        ) AS x(reg, licences, ratings, total, on_type, recent, age, checkout, instant)
        WHERE x.reg = r.reg;

      -- Documents: the placeholder files the owner uploaded, named "<registration>-<kind>.pdf".
      FOR d IN SELECT * FROM (VALUES
        ('cofa', NULL::date), ('arc', current_date + 300), ('insurance', current_date + 200),
        ('checklist', NULL::date), ('weight_balance', NULL::date)
      ) AS k(kind, expires_on)
      LOOP
        SELECT id INTO v_doc FROM public.documents
          WHERE owner_id = v_owner AND filename = r.reg || '-' || d.kind || '.pdf'
          ORDER BY created_at DESC LIMIT 1;
        IF v_doc IS NOT NULL THEN
          INSERT INTO public.aircraft_documents (aircraft_id, kind, title, document_id, expires_on,
              status, reviewed_at)
            VALUES (v_plane, d.kind::public.aircraft_document_kind,
              CASE d.kind WHEN 'checklist' THEN 'Normal checklist (test)'
                          WHEN 'weight_balance' THEN 'Weight and balance (test)' END,
              v_doc, d.expires_on,
              CASE WHEN d.kind IN ('cofa', 'arc', 'insurance') THEN 'verified' END
                ::public.verification_status,
              CASE WHEN d.kind IN ('cofa', 'arc', 'insurance') THEN now() END);
        END IF;
      END LOOP;
    END LOOP;
    INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, reason)
      VALUES (NULL, 'test_account', 'user', v_owner, 'Test owner (migration 0083)');
  END IF;

  -- The airfield manager: a made-up airfield with a verified team and a filled-in profile --------
  IF v_airport IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.airport_members WHERE user_id = v_airport)
  THEN
    INSERT INTO public.airports (ident, type, name, municipality, country, latitude, longitude,
        elevation_ft, timezone, keywords)
      VALUES ('OAP-TEST', 'small_airport', 'ownAplane Test Airfield', 'Test (not a real airfield)',
        'BG', 42.655, 23.655, 1800, 'Europe/Sofia', 'test')
      ON CONFLICT (ident) DO NOTHING;
    -- An earlier team of the test airfield (a deleted test account) leaves no profile behind.
    DELETE FROM public.airport_operators WHERE airport_ident = 'OAP-TEST';
    INSERT INTO public.airport_operators (airport_ident, description, ppr_required,
        ppr_notice_hours, hours_note, phone, email, website, currency, services, fuels)
      VALUES ('OAP-TEST',
        'Test airfield for trying ownAplane: not a real airfield, nothing here is real information.',
        true, 24, 'Outside these hours on request (PPR).', '+359 2 000 0000',
        'airport@test.ownaplane.eu', NULL, 'EUR',
        ARRAY['apron_parking', 'hangar', 'tie_downs', 'handling', 'restaurant'],
        ARRAY['avgas_100ll', 'ul91']::public.fuel_type[]);
    INSERT INTO public.airport_members (airport_ident, user_id, role)
      VALUES ('OAP-TEST', v_airport, 'manager');
    INSERT INTO public.airport_hours (airport_ident, weekday, opens, closes)
      SELECT 'OAP-TEST', w.day, '08:00', CASE WHEN w.day >= 6 THEN '20:00' ELSE '18:00' END::time
      FROM generate_series(1, 7) AS w(day);
    INSERT INTO public.airport_runways (airport_ident, designator, length_m, width_m, surface,
        lighted)
      VALUES ('OAP-TEST', '09/27', 850, 30, 'grass', false);
    INSERT INTO public.airport_frequencies (airport_ident, type, description, mhz)
      VALUES ('OAP-TEST', 'A/G', 'Test Radio', 123.500);
    INSERT INTO public.airport_fees (airport_ident, kind, label, max_mtom_kg, amount, unit) VALUES
      ('OAP-TEST', 'landing', NULL, 1000, 10.00, 'landing'),
      ('OAP-TEST', 'landing', NULL, 2000, 15.00, 'landing'),
      ('OAP-TEST', 'parking', NULL, NULL, 5.00, 'night'),
      ('OAP-TEST', 'hangar', NULL, NULL, 25.00, 'night');
    UPDATE public.profiles SET bio = 'Test account: manager of the ownAplane Test Airfield.'
      WHERE id = v_airport;
    INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, reason)
      VALUES (NULL, 'test_account', 'user', v_airport, 'Test airfield manager (migration 0083)');
  END IF;
END
$$;
