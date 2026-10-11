import "server-only";

import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";
import { after } from "next/server";

import { getDb, isDatabaseConfigured } from "@/lib/db";
import { reportError } from "@/lib/monitoring";

// Request limits per minute (API-6): per app token, per partner API key, and per address for
// calls without one. Counted in Postgres (one row per caller and minute), so every server
// instance sees the same count and no extra service is needed. Rejected tokens also count
// against the address, so made-up tokens can't get round the limit.

export const LIMITS = { user: 240, partner: 600, anonymous: 120, badTokens: 30 } as const;

export type Caller = {
  /** tok:<hash> (app token), key:<hash> (partner key) or ip:<address>. */
  key: string;
  limit: number;
  /** Bucket of the address's rejected tokens. */
  badKey: string;
};

const hash32 = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 32);

/** Who is calling, as far as the request says (the token itself is checked later). */
export function callerOf(request: Request): Caller {
  const address =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";
  const badKey = `bad:${address}`;
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const token = /^bearer\s+(\S+)$/i.exec(authorization)?.[1];
  if (token?.startsWith("oap_"))
    return { key: `key:${hash32(token)}`, limit: LIMITS.partner, badKey };
  // App tokens are "<session token>.<signature>": the session token names the session.
  if (token) return { key: `tok:${hash32(token.split(".")[0]!)}`, limit: LIMITS.user, badKey };
  return { key: `ip:${address}`, limit: LIMITS.anonymous, badKey };
}

/**
 * Count this request; returns the caller's count in the current minute, the address's rejected
 * tokens in it and the seconds until it ends.
 */
export async function takeRequest(
  caller: Pick<Caller, "key" | "badKey">,
): Promise<{ count: number; badTokens: number; resetIn: number }> {
  const [row] = (await getDb().execute(sql`
    with hit as (
      insert into public.api_rate_buckets (key, minute, count)
      values (${caller.key}, date_trunc('minute', now()), 1)
      on conflict (key, minute) do update set count = public.api_rate_buckets.count + 1
      returning count
    )
    select hit.count,
      coalesce((select b.count from public.api_rate_buckets b
        where b.key = ${caller.badKey} and b.minute = date_trunc('minute', now())), 0) as bad,
      60 - extract(second from now())::int as reset_in
    from hit`)) as unknown as { count: number; bad: number; reset_in: number }[];
  return { count: row!.count, badTokens: row!.bad, resetIn: Math.max(1, row!.reset_in) };
}

/** A token or key was refused (401): count it against the address. */
export async function countBadToken(badKey: string) {
  await getDb()
    .execute(
      sql`
      insert into public.api_rate_buckets (key, minute, count)
      values (${badKey}, date_trunc('minute', now()), 1)
      on conflict (key, minute) do update set count = public.api_rate_buckets.count + 1`,
    )
    .catch((e) => reportError(e, { where: "api bad token" }));
}

/** After the response: count a request of a signed-in user or partner connection (admins). */
export function recordUsage(
  subjectType: "user" | "connection",
  subjectId: string,
): Promise<void> | undefined {
  if (!isDatabaseConfigured()) return;
  const write = () =>
    getDb()
      .execute(
        sql`
        insert into public.api_usage_daily (day, subject_type, subject_id, requests)
        values ((now() at time zone 'utc')::date, ${subjectType}, ${subjectId}::uuid, 1)
        on conflict (day, subject_type, subject_id)
        do update set requests = public.api_usage_daily.requests + 1`,
      )
      .then(
        () => undefined,
        async (e) => {
          await reportError(e, { where: "api usage" });
        },
      );
  try {
    after(write);
  } catch {
    // Outside a request (tests): write now.
    return write();
  }
}

/** Daily job: forget per-minute counts older than an hour and daily usage after 90 days. */
export async function pruneApiUsage() {
  await getDb().execute(
    sql`delete from public.api_rate_buckets where minute < now() - interval '1 hour'`,
  );
  await getDb().execute(sql`delete from public.api_usage_daily where day < current_date - 90`);
}
