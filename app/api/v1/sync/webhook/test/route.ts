import { requireConnection } from "@/lib/api/connection-auth";
import { apiRoute, json } from "@/lib/api/http";
import { sendTestWebhook } from "@/lib/calendar-sync/webhooks";

/** POST /api/v1/sync/webhook/test: we send a signed `ping` now and say how it went (SYN-6). */
export const POST = apiRoute(async (request) => {
  const connection = await requireConnection(request);
  const result = await sendTestWebhook(connection.id);
  return json({ data: result.ok ? { ok: true } : { ok: false, error: result.error } });
});
