-- Airport teams and claims (APT-1, M16). Everyone may see which airfields are on ownAplane;
-- team members see their team; claimants see their own claims; admins read claims and decide
-- them with trusted code (lib/airport-teams/claims.ts) after requireAdmin(). People join a team by a
-- verified claim or by accepting an invitation (accept_airport_invite(), with the link's token).

-- The current user's role on an airfield's team, if any. SECURITY DEFINER so policies on
-- airport_members can use it without recursion.
CREATE OR REPLACE FUNCTION public.airport_role_of(p_airport text)
RETURNS public.airport_member_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.airport_members
  WHERE airport_ident = p_airport AND user_id = app.current_user_id()
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.airport_role_of(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.airport_role_of(text) TO app_user;
--> statement-breakpoint

GRANT SELECT ON public.airport_operators TO app_user;
--> statement-breakpoint
CREATE POLICY airport_operators_select ON public.airport_operators FOR SELECT TO app_user
  USING (true);
--> statement-breakpoint

-- Members: the team sees itself; managers change roles and remove people; anyone may leave.
GRANT SELECT, DELETE ON public.airport_members TO app_user;
--> statement-breakpoint
GRANT UPDATE (role) ON public.airport_members TO app_user;
--> statement-breakpoint
CREATE POLICY airport_members_select ON public.airport_members FOR SELECT TO app_user
  USING (user_id = app.current_user_id()
    OR public.airport_role_of(airport_ident) IS NOT NULL
    OR public.user_has_role('admin'));
--> statement-breakpoint
CREATE POLICY airport_members_update ON public.airport_members FOR UPDATE TO app_user
  USING (public.airport_role_of(airport_ident) = 'manager')
  WITH CHECK (public.airport_role_of(airport_ident) = 'manager');
--> statement-breakpoint
CREATE POLICY airport_members_delete ON public.airport_members FOR DELETE TO app_user
  USING (user_id = app.current_user_id() OR public.airport_role_of(airport_ident) = 'manager');
--> statement-breakpoint

-- A team keeps at least one manager while its people change it themselves (deleting an account
-- or admin changes go through trusted code and may leave it without one).
CREATE OR REPLACE FUNCTION public.airport_members_keep_manager()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user = 'app_user' AND OLD.role = 'manager'
     AND (TG_OP = 'DELETE' OR NEW.role <> 'manager')
     AND NOT EXISTS (SELECT 1 FROM public.airport_members m
                     WHERE m.airport_ident = OLD.airport_ident AND m.role = 'manager'
                       AND m.user_id <> OLD.user_id) THEN
    RAISE EXCEPTION 'last_manager';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER airport_members_keep_manager BEFORE UPDATE OR DELETE ON public.airport_members
  FOR EACH ROW EXECUTE FUNCTION public.airport_members_keep_manager();
--> statement-breakpoint

-- Claims: people see and file their own (with their own document), and may withdraw an open one.
-- (Insert on the whole row: the trigger below resets everything that isn't the claimant's.)
GRANT SELECT, INSERT ON public.airport_claims TO app_user;
--> statement-breakpoint
GRANT UPDATE (status) ON public.airport_claims TO app_user;
--> statement-breakpoint
CREATE POLICY airport_claims_select ON public.airport_claims FOR SELECT TO app_user
  USING (user_id = app.current_user_id() OR public.user_has_role('admin'));
--> statement-breakpoint
CREATE POLICY airport_claims_insert ON public.airport_claims FOR INSERT TO app_user
  WITH CHECK (user_id = app.current_user_id()
    AND (document_id IS NOT NULL OR email IS NOT NULL)
    AND (document_id IS NULL OR EXISTS (SELECT 1 FROM public.documents d
                                        WHERE d.id = document_id
                                          AND d.owner_id = app.current_user_id())));
--> statement-breakpoint
CREATE POLICY airport_claims_withdraw ON public.airport_claims FOR UPDATE TO app_user
  USING (user_id = app.current_user_id() AND status IN ('unconfirmed', 'pending'))
  WITH CHECK (user_id = app.current_user_id() AND status = 'withdrawn');
--> statement-breakpoint

-- New claims start unconfirmed (email proof) or pending (document); timestamps are ours; at most
-- 5 open claims per person, and 10 new ones a day.
CREATE OR REPLACE FUNCTION public.airport_claim_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.email := lower(btrim(NEW.email));
    NEW.status := CASE WHEN NEW.email IS NOT NULL THEN 'unconfirmed' ELSE 'pending' END;
    NEW.email_code_hash := NULL;
    NEW.email_code_sent_at := NULL;
    NEW.email_code_tries := 0;
    NEW.email_codes_sent := 0;
    NEW.email_confirmed_at := NULL;
    NEW.decided_by := NULL;
    NEW.decided_at := NULL;
    NEW.decision_note := NULL;
    NEW.created_at := now();
    IF (SELECT count(*) FROM public.airport_claims c
        WHERE c.user_id = NEW.user_id AND c.status IN ('unconfirmed', 'pending')) >= 5
       OR (SELECT count(*) FROM public.airport_claims c
           WHERE c.user_id = NEW.user_id AND c.created_at > now() - interval '1 day') >= 10 THEN
      RAISE EXCEPTION 'too_many_claims';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER airport_claims_defaults BEFORE INSERT OR UPDATE ON public.airport_claims
  FOR EACH ROW EXECUTE FUNCTION public.airport_claim_defaults();
--> statement-breakpoint

-- Invitations: managers see, send and cancel their airfield's; the link's token is stored hashed.
-- (Insert on the whole row: the trigger below resets sender, dates and acceptance.)
GRANT SELECT, INSERT, DELETE ON public.airport_invites TO app_user;
--> statement-breakpoint
CREATE POLICY airport_invites_select ON public.airport_invites FOR SELECT TO app_user
  USING (public.airport_role_of(airport_ident) = 'manager');
--> statement-breakpoint
CREATE POLICY airport_invites_insert ON public.airport_invites FOR INSERT TO app_user
  WITH CHECK (public.airport_role_of(airport_ident) = 'manager');
--> statement-breakpoint
CREATE POLICY airport_invites_delete ON public.airport_invites FOR DELETE TO app_user
  USING (public.airport_role_of(airport_ident) = 'manager');
--> statement-breakpoint

-- Sender, dates and acceptance are ours; at most 20 open invitations per airfield.
CREATE OR REPLACE FUNCTION public.airport_invite_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.email := lower(btrim(NEW.email));
  NEW.invited_by := coalesce(app.current_user_id(), NEW.invited_by);
  NEW.created_at := now();
  NEW.expires_at := now() + interval '14 days';
  NEW.accepted_at := NULL;
  NEW.accepted_by := NULL;
  IF (SELECT count(*) FROM public.airport_invites i
      WHERE i.airport_ident = NEW.airport_ident AND i.accepted_at IS NULL
        AND i.expires_at > now()) >= 20 THEN
    RAISE EXCEPTION 'too_many_invites';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER airport_invites_defaults BEFORE INSERT ON public.airport_invites
  FOR EACH ROW EXECUTE FUNCTION public.airport_invite_defaults();
--> statement-breakpoint

-- Join a team with an invitation's token (its SHA-256): only the invited email address, once,
-- within 14 days. Returns the airfield.
CREATE OR REPLACE FUNCTION public.accept_airport_invite(p_token_hash text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inv public.airport_invites;
  me uuid := app.current_user_id();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not_signed_in';
  END IF;
  SELECT * INTO inv FROM public.airport_invites WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND OR inv.accepted_at IS NOT NULL OR inv.expires_at <= now() THEN
    RAISE EXCEPTION 'invite_invalid';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = me AND lower(u.email) = inv.email) THEN
    RAISE EXCEPTION 'invite_other_email';
  END IF;
  INSERT INTO public.airport_members (airport_ident, user_id, role, added_by)
  VALUES (inv.airport_ident, me, inv.role, inv.invited_by)
  ON CONFLICT (airport_ident, user_id) DO NOTHING;
  UPDATE public.airport_invites SET accepted_at = now(), accepted_by = me WHERE id = inv.id;
  RETURN inv.airport_ident;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.accept_airport_invite(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.accept_airport_invite(text) TO app_user;
