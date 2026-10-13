import "server-only";

import { sql } from "drizzle-orm";

import { listOwnAircraft } from "@/lib/aircraft/queries";
import { type BookingListItem, listBookings } from "@/lib/bookings/queries";
import { asUser } from "@/lib/db/rls";
import { unreadConversations } from "@/lib/messages";
import { unreadCount } from "@/lib/notifications";
import { credentialItems, getPilotCredentials } from "@/lib/pilot/credentials";
import { pilotSummary } from "@/lib/pilot/summary";

type OpenDefects = { aircraftId: string; registration: string; count: number };

type Expiring = {
  aircraftId: string;
  registration: string;
  kind: "arc" | "insurance";
  expiresOn: string;
};

/** Things waiting for the user, read with their own rights (RLS). */
async function openItems(userId: string) {
  const [row] = (await asUser(userId, (tx) =>
    tx.execute(sql`select
      (select coalesce(json_agg(b.id), '[]') from public.bookings b
        where b.status = 'completed' and b.pilot_id is not null
          and ${userId}::uuid in (b.pilot_id, b.owner_id)
          and public.review_window_closes(b.id) > now()
          and not exists (select 1 from public.reviews r
                          where r.booking_id = b.id and r.author_id = ${userId}::uuid))
        as reviews_due,
      (select coalesce(json_agg(l.booking_id), '[]') from public.flight_logs l
        join public.bookings b on b.id = l.booking_id
        where l.status = 'submitted' and b.owner_id = ${userId}::uuid) as logs_to_confirm,
      (select coalesce(json_agg(l.booking_id), '[]') from public.flight_logs l
        join public.bookings b on b.id = l.booking_id
        where l.status in ('draft', 'correction_requested') and b.pilot_id = ${userId}::uuid)
        as logs_to_finish,
      (select coalesce(json_agg(json_build_object('aircraftId', x.id,
          'registration', x.registration, 'count', x.count) order by x.registration), '[]')
        from (select a.id, a.registration, count(*)::int as count
              from public.defects d join public.aircraft a on a.id = d.aircraft_id
              where a.owner_id = ${userId}::uuid and d.resolved_at is null
              group by a.id, a.registration) x) as open_defects,
      (select coalesce(json_agg(json_build_object('aircraftId', x.id,
          'registration', x.registration, 'kind', x.kind, 'expiresOn', x.expires_on)), '[]')
        from (select a.id, a.registration, d.kind, max(d.expires_on) as expires_on
              from public.aircraft a join public.aircraft_documents d on d.aircraft_id = a.id
              where a.owner_id = ${userId}::uuid and a.status <> 'draft'
                and d.kind in ('arc', 'insurance') and d.status = 'verified'
              group by a.id, a.registration, d.kind
              having max(d.expires_on) <= (now() at time zone 'utc')::date + 30) x)
        as docs_expiring,
      (select count(*) from public.aircraft_documents d join public.aircraft a on a.id = d.aircraft_id
        where a.owner_id = ${userId}::uuid and d.status = 'pending')::int as docs_pending,
      (select row_to_json(p) from (select rating_avg, rating_count, owner_rating_avg,
          owner_rating_count from public.profiles where id = ${userId}::uuid) p) as ratings`),
  )) as unknown as {
    reviews_due: string[];
    logs_to_confirm: string[];
    logs_to_finish: string[];
    open_defects: OpenDefects[];
    docs_expiring: Expiring[];
    docs_pending: number;
    ratings: {
      rating_avg: number | null;
      rating_count: number;
      owner_rating_avg: number | null;
      owner_rating_count: number;
    } | null;
  }[];
  return row!;
}

const ACTIVE = ["requested", "accepted", "in_progress"];
const byStart = (a: BookingListItem, b: BookingListItem) => a.from.getTime() - b.from.getTime();

/** Everything the dashboard shows: bookings on both sides, credentials, aircraft, open items. */
export async function getDashboard(userId: string, roles: { pilot: boolean; owner: boolean }) {
  const now = new Date();
  const [bookings, items, creds, aircraft, unreadMessages, unreadNotifications] = await Promise.all(
    [
      listBookings(userId),
      openItems(userId),
      roles.pilot ? getPilotCredentials(userId) : null,
      roles.owner ? listOwnAircraft(userId) : [],
      unreadConversations(userId),
      unreadCount(userId),
    ],
  );
  const side = (role: "pilot" | "owner") => {
    const mine = bookings.filter((b) => b.role === role);
    return {
      upcoming: mine.filter((b) => ACTIVE.includes(b.status) && b.to > now).sort(byStart),
      past: mine.filter(
        (b) => b.status === "completed" || (b.to <= now && b.status !== "requested"),
      ),
      completed: mine.filter((b) => b.status === "completed").length,
    };
  };
  const byId = new Map(bookings.map((b) => [b.id, b]));
  const pick = (ids: string[]) => ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const pilot = side("pilot");
  const owner = side("owner");
  return {
    pilot: roles.pilot
      ? {
          ...pilot,
          credentials: creds ? pilotSummary(credentialItems(creds)) : null,
          rating: {
            avg: items.ratings?.rating_avg ?? null,
            count: items.ratings?.rating_count ?? 0,
          },
        }
      : null,
    owner: roles.owner
      ? {
          ...owner,
          aircraft,
          rating: {
            avg: items.ratings?.owner_rating_avg ?? null,
            count: items.ratings?.owner_rating_count ?? 0,
          },
        }
      : null,
    todo: {
      requestsToAnswer: owner.upcoming.filter((b) => b.status === "requested"),
      logsToConfirm: pick(items.logs_to_confirm),
      logsToFinish: pick(items.logs_to_finish),
      reviewsDue: pick(items.reviews_due),
      openDefects: items.open_defects,
      docsExpiring: items.docs_expiring,
      docsPending: items.docs_pending,
      unreadMessages,
      unreadNotifications,
    },
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
