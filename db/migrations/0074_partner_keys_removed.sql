-- Partners are read with ownAplane's own key, a server secret (Zlati, 2026-10-12; SYN-7), not
-- keys owners paste. Remove any stored keys and their hints now; the empty table is dropped in a
-- later migration, once no live version uses it.
DELETE FROM public.calendar_partner_keys;
--> statement-breakpoint
UPDATE public.calendar_connections SET api_key_hint = NULL WHERE inbound::text = 'partner';
