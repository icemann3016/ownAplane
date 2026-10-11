import "server-only";

import { sql } from "drizzle-orm";

import { planOf } from "@/lib/billing/plan";
import { PLANS } from "@/lib/billing/plans";
import { getDb } from "@/lib/db";
import { getCurrency } from "./currency-data";

// Currency reminders (Pilot Plus), from the daily job: passenger recency that ends within a week,
// and an SEP rating expiring within 60 days whose experience isn't complete yet. Once each per
// lapse (deduplicated over 10 and 30 days); in-app notifications that open the currency page.

const addDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function notifyOnce(userId: string, type: string, days: number) {
  const rows = (await getDb().execute(sql`
    insert into public.notifications (user_id, type)
    select ${userId}::uuid, ${type}
    where not exists (
      select 1 from public.notifications n
      where n.user_id = ${userId}::uuid and n.type = ${type}
        and n.created_at > now() - make_interval(days => ${days}))
    returning id`)) as unknown as { id: string }[];
  return rows.length;
}

export async function sendCurrencyReminders(): Promise<number> {
  // Pilots who flew in the last 100 days or whose SEP rating expires within 60 days.
  const pilots = (await getDb().execute(sql`
    select distinct pilot_id as id from public.logbook_entries
    where status = 'certified' and date > current_date - 100
    union
    select user_id from public.pilot_ratings
    where kind = 'class' and code = 'SEP_LAND' and status <> 'rejected'
      and expires_on between current_date and current_date + 60`)) as unknown as { id: string }[];
  let sent = 0;
  const week = addDays(7);
  for (const { id } of pilots) {
    if (!PLANS[(await planOf(id)).plan].currencyTracker) continue;
    const c = await getCurrency(id);
    const day = c.passengers.day;
    if (day.current && day.until && day.until <= week) {
      sent += await notifyOnce(id, "currency_ending", 10);
    }
    if (c.sepExpiry && c.sepExpiry <= addDays(60) && !c.sep.expired && !c.sep.met) {
      sent += await notifyOnce(id, "revalidation_due", 30);
    }
  }
  return sent;
}
