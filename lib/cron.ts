import { timingSafeEqual } from "node:crypto";

/**
 * Scheduled jobs call us with `Authorization: Bearer $CRON_SECRET` (Vercel Cron, a GitHub
 * Actions schedule, Cloud Scheduler…). Constant-time comparison; no secret = never authorized.
 */
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
