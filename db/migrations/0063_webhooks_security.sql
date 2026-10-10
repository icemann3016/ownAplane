-- Webhooks to connected systems (SYN-6): the owner (or the partner, through the API) sets where
-- changes go; the database queues an event per connection whenever a busy time it can see
-- changes. Delivery is trusted code (lib/calendar-sync/webhooks.ts).

GRANT UPDATE (webhook_url, webhook_secret) ON public.calendar_connections TO app_user;
--> statement-breakpoint

-- webhook_events: no access for app_user.

-- One event per connection of the aircraft with a webhook, except the system the busy time came
-- from (it knows already).
CREATE OR REPLACE FUNCTION public.queue_webhook_events(plane uuid, entry uuid, source uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.webhook_events (connection_id, entry_id)
  SELECT c.id, entry FROM public.calendar_connections c
  WHERE c.aircraft_id = plane AND c.webhook_url IS NOT NULL AND c.id IS DISTINCT FROM source
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.queue_webhook_events(uuid, uuid, uuid) FROM PUBLIC;
--> statement-breakpoint

-- Busy times appear, move, change kind or note, or go (deleted or released).
CREATE OR REPLACE FUNCTION public.calendar_entries_webhooks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.active THEN
      PERFORM public.queue_webhook_events(OLD.aircraft_id, OLD.id, OLD.connection_id);
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' AND NOT NEW.active THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND (NOT (NEW.active OR OLD.active)
      OR (NEW.period = OLD.period AND NEW.active = OLD.active AND NEW.kind = OLD.kind
          AND NEW.note IS NOT DISTINCT FROM OLD.note)) THEN
    RETURN NEW;
  END IF;
  PERFORM public.queue_webhook_events(NEW.aircraft_id, NEW.id, NEW.connection_id);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER calendar_entries_webhooks AFTER INSERT OR UPDATE OR DELETE ON public.calendar_entries
  FOR EACH ROW EXECUTE FUNCTION public.calendar_entries_webhooks();
--> statement-breakpoint

-- A booking's status (requested → accepted…) is part of what systems may get.
CREATE OR REPLACE FUNCTION public.bookings_webhooks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  e record;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    FOR e IN
      SELECT id, aircraft_id FROM public.calendar_entries WHERE booking_id = NEW.id AND active
    LOOP
      PERFORM public.queue_webhook_events(e.aircraft_id, e.id, NULL);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER bookings_webhooks AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_webhooks();
