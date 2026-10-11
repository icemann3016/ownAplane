import "server-only";

import { sql } from "drizzle-orm";

import { LIMITS } from "@/lib/api/rate-limit";
import { getDb } from "@/lib/db";

// API usage for admins (API-6). Trusted code: callers must have called requireAdmin().

export type ApiUsageRow = {
  type: "user" | "connection";
  id: string;
  /** User's name, or the connection's name. */
  name: string | null;
  /** User's email, or the connected aircraft's registration. */
  detail: string | null;
  aircraftId: string | null;
  today: number;
  week: number;
};

export type LimitedCaller = {
  kind: "token" | "partner" | "address" | "badTokens";
  /** The address for address limits; else null. */
  address: string | null;
  userId: string | null;
  name: string | null;
  aircraftId: string | null;
  /** Minutes over the limit in the last hour, the highest count in a minute, the last one. */
  minutes: number;
  peak: number;
  last: Date;
};

const KINDS = { tok: "token", key: "partner", ip: "address", bad: "badTokens" } as const;

/** Requests per signed-in user and connection over the last 7 UTC days, busiest first. */
export async function apiUsage(limit = 50): Promise<ApiUsageRow[]> {
  const rows = (await getDb().execute(sql`
    with today as (select (now() at time zone 'utc')::date as day)
    select u.subject_type as type, u.subject_id as id,
      coalesce(sum(u.requests) filter (where u.day = (select day from today)), 0)::int as today,
      sum(u.requests)::int as week,
      coalesce(min(us.name), min(c.name)) as name,
      coalesce(min(us.email), min(a.registration)) as detail,
      min(c.aircraft_id::text) as "aircraftId"
    from public.api_usage_daily u
    left join public.users us on u.subject_type = 'user' and us.id = u.subject_id
    left join public.calendar_connections c on u.subject_type = 'connection' and c.id = u.subject_id
    left join public.aircraft a on a.id = c.aircraft_id
    where u.day > (select day from today) - 7
    group by u.subject_type, u.subject_id
    order by week desc, today desc
    limit ${limit}`)) as unknown as ApiUsageRow[];
  return rows;
}

/** Callers that went over their limit in the last hour, with the user or connection when known. */
export async function limitedCallers(): Promise<LimitedCaller[]> {
  const rows = (await getDb().execute(sql`
    with over as (
      select b.key, split_part(b.key, ':', 1) as prefix,
        substr(b.key, position(':' in b.key) + 1) as rest,
        count(*)::int as minutes, max(b.count)::int as peak, max(b.minute) as last
      from public.api_rate_buckets b
      where b.minute >= now() - interval '1 hour'
        and b.count > case split_part(b.key, ':', 1)
          when 'tok' then ${LIMITS.user}::int when 'key' then ${LIMITS.partner}::int
          when 'ip' then ${LIMITS.anonymous}::int else ${LIMITS.badTokens - 1}::int end
      group by b.key
    )
    select o.prefix, o.minutes, o.peak, o.last,
      case when o.prefix in ('ip', 'bad') then o.rest end as address,
      s.user_id as "userId", coalesce(us.name, c.name) as name, c.aircraft_id as "aircraftId"
    from over o
    left join lateral (
      select se.user_id from public.sessions se
      where o.prefix = 'tok'
        and left(encode(sha256(convert_to(se.token, 'UTF8')), 'hex'), 32) = o.rest
      limit 1
    ) s on true
    left join public.users us on us.id = s.user_id
    left join public.calendar_connections c
      on o.prefix = 'key' and left(c.api_key_hash, 32) = o.rest
    order by o.last desc
    limit 50`)) as unknown as (Omit<LimitedCaller, "kind" | "last"> & {
    prefix: keyof typeof KINDS;
    last: Date | string;
  })[];
  return rows.map(({ prefix, last, ...r }) => ({
    ...r,
    kind: KINDS[prefix],
    last: new Date(last),
  }));
}
