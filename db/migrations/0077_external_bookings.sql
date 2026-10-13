-- Calendar types are Booking, External booking, Own use and Maintenance (Zlati, 2026-10-13):
-- `unavailable` now only means a booking from a connected system (shown as "External booking").
-- Owners' own "unavailable" blocks become own use.
UPDATE public.calendar_entries SET kind = 'owner_use'
WHERE kind = 'unavailable' AND connection_id IS NULL;
--> statement-breakpoint
-- Partner connections are made automatically from the owner's key, one per aircraft and partner
-- (SYN-7): keep the oldest if an aircraft has more than one.
DELETE FROM public.calendar_connections c
WHERE c.partner IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.calendar_connections o
  WHERE o.aircraft_id = c.aircraft_id AND o.partner = c.partner
    AND (o.created_at, o.id) < (c.created_at, c.id));
