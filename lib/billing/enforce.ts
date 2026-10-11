import "server-only";

import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db";

// A smaller plan never deletes anything (SUB-6). A week before it starts, owners with more listed
// aircraft than it allows are told (once a fortnight); once it is in force and they were told at
// least 7 days before, the most recently listed aircraft beyond the limit are unlisted (reason
// "plan_limit", listed again after an upgrade). A plan that drops without notice (an admin takes
// a plan back) gets its warning first and waits the week. Featured labels beyond the plan's spots
// come off. Accepted bookings carry on. The daily job runs it, warnings first.

type Row = { owner_id: string; listed: number; lim: number };

const owners = (at: string) =>
  getDb().execute(sql`
    select a.owner_id, count(*)::int as listed,
      (select public.plan_limit(p.plan, 'aircraft')
       from public.plan_of(a.owner_id, ${at}::timestamptz) p) as lim
    from public.aircraft a
    where a.status = 'listed'
    group by a.owner_id`) as unknown as Promise<Row[]>;

/** Tell owners whose plan in 7 days lists fewer aircraft than they have listed. */
export async function warnPlanChanges(now = new Date()): Promise<number> {
  const soon = await owners(new Date(now.getTime() + 7 * 86_400_000).toISOString());
  let warned = 0;
  for (const o of soon.filter((r) => r.listed > r.lim)) {
    const rows = (await getDb().execute(sql`
      insert into public.notifications (user_id, type)
      select ${o.owner_id}::uuid, 'plan_ending'
      where not exists (
        select 1 from public.notifications n
        where n.user_id = ${o.owner_id}::uuid and n.type = 'plan_ending'
          and n.created_at > ${now.toISOString()}::timestamptz - interval '14 days')
      returning id`)) as unknown as { id: string }[];
    warned += rows.length;
  }
  return warned;
}

/** Unlist aircraft beyond the plan now in force (after a week's warning), newest first. */
export async function enforcePlanLimits(now = new Date()): Promise<number> {
  const at = now.toISOString();
  const warned = new Set(
    (
      (await getDb().execute(sql`
        select distinct user_id from public.notifications
        where type = 'plan_ending'
          and created_at <= ${at}::timestamptz - interval '167 hours'
          and created_at > ${at}::timestamptz - interval '30 days'`)) as unknown as {
        user_id: string;
      }[]
    ).map((r) => r.user_id),
  );
  const over = (await owners(at)).filter((r) => r.listed > r.lim && warned.has(r.owner_id));
  let unlisted = 0;
  for (const o of over) {
    const rows = (await getDb().execute(sql`
      update public.aircraft set status = 'unlisted', unlisted_reason = 'plan_limit'
      where id in (
        select id from public.aircraft
        where owner_id = ${o.owner_id}::uuid and status = 'listed'
        order by listed_at desc nulls last, created_at desc
        limit ${o.listed - o.lim})
      returning id`)) as unknown as { id: string }[];
    unlisted += rows.length;
    if (rows.length) {
      await getDb().execute(
        sql`insert into public.notifications (user_id, type) values (${o.owner_id}::uuid, 'plan_unlisted')`,
      );
    }
  }
  // Featured labels beyond the plan's spots (the newest listings lose theirs first).
  await getDb().execute(sql`
    update public.aircraft a set featured = false
    from (
      select x.id, row_number() over (partition by x.owner_id
        order by x.listed_at asc nulls first, x.created_at) as n,
        (select public.plan_limit(p.plan, 'featured')
         from public.plan_of(x.owner_id, ${now.toISOString()}::timestamptz) p) as lim
      from public.aircraft x where x.featured and x.status = 'listed'
    ) f
    where a.id = f.id and f.n > f.lim`);
  return unlisted;
}
