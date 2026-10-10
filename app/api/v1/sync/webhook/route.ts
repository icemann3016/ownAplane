import { requireConnection } from "@/lib/api/connection-auth";
import { webhookDto } from "@/lib/api/dto";
import { apiRoute, bodyOf, json, parse } from "@/lib/api/http";
import { webhookBody } from "@/lib/api/schemas";
import { getWebhook, removeWebhookFor, setWebhook } from "@/lib/calendar-sync/webhook-settings";

/** GET /api/v1/sync/webhook: where we send changes to our busy times, and how it went (SYN-6). */
export const GET = apiRoute(async (request) => {
  const connection = await requireConnection(request);
  return json({ data: webhookDto(await getWebhook(connection.id)) });
});

/**
 * PUT /api/v1/sync/webhook `{ url, newSecret? }`: send changes there. The first call (or
 * `newSecret: true`) returns a signing secret, once; check the ownaplane-signature header with it.
 */
export const PUT = apiRoute(async (request) => {
  const connection = await requireConnection(request);
  const { url, newSecret } = parse(webhookBody, await bodyOf(request));
  const saved = await setWebhook(connection.id, url, newSecret ?? false);
  return json({ data: { ...webhookDto(saved), secret: saved.secret } });
});

/** DELETE /api/v1/sync/webhook: stop sending changes. */
export const DELETE = apiRoute(async (request) => {
  const connection = await requireConnection(request);
  await removeWebhookFor(connection.id);
  return json({ data: { deleted: true } });
});
