import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { busyTimeDto } from "@/lib/api/dto";
import type { WebhookEventDto } from "@/lib/api/responses";
import { getDb } from "@/lib/db";
import { aircraft, calendarConnections, webhookEvents } from "@/lib/db/schema";
import { reportError } from "@/lib/monitoring";
import { busyTimesById } from "./busy";
import { assertPublic, FeedError } from "./feeds";
import { exportFields } from "./fields";
import { SIGNATURE_HEADER, signWebhook } from "./signature";

// Webhooks to connected systems (SYN-6). The database queues an event whenever a busy time a
// connection can see changes (0063_webhooks_security.sql); this sends them, signed, as the
// current state of that busy time: right after the action that caused them, and from the
// scheduled jobs for retries. Trusted code.

const TIMEOUT_MS = 8000;
/** Minutes to wait after each failed attempt; after the last one the change is dropped. */
const BACKOFF_MINUTES = [1, 5, 15, 60, 180, 360, 720, 1440];
export const MAX_ATTEMPTS = BACKOFF_MINUTES.length;

export type PostResult = { ok: true } | { ok: false; error: string };
export type Poster = (
  url: string,
  body: string,
  headers: Record<string, string>,
) => Promise<PostResult>;

/** POST to a public https address (no redirects followed), 8 seconds at most. */
export const postWebhook: Poster = async (link, body, headers) => {
  try {
    const url = new URL(link);
    await assertPublic(url);
    const res = await fetch(url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "user-agent": "ownAplane-webhooks/1",
        ...headers,
      },
      body,
    });
    await res.body?.cancel();
    return res.ok ? { ok: true } : { ok: false, error: `http_${res.status}` };
  } catch (e) {
    if (e instanceof FeedError) return { ok: false, error: e.code };
    return { ok: false, error: "unreachable" };
  }
};

type Target = {
  id: string;
  aircraftId: string;
  registration: string;
  webhookUrl: string | null;
  webhookSecret: string | null;
  exportFields: string[];
};

async function targets(ids: string[]): Promise<Map<string, Target>> {
  const rows = await getDb()
    .select({
      id: calendarConnections.id,
      aircraftId: calendarConnections.aircraftId,
      registration: aircraft.registration,
      webhookUrl: calendarConnections.webhookUrl,
      webhookSecret: calendarConnections.webhookSecret,
      exportFields: calendarConnections.exportFields,
    })
    .from(calendarConnections)
    .innerJoin(aircraft, eq(aircraft.id, calendarConnections.aircraftId))
    .where(inArray(calendarConnections.id, ids));
  return new Map(rows.map((r) => [r.id, r]));
}

/** Send one signed event and record how it went on the connection. */
async function send(target: Target, event: WebhookEventDto, poster: Poster): Promise<PostResult> {
  if (!target.webhookUrl || !target.webhookSecret) return { ok: false, error: "no_webhook" };
  const body = JSON.stringify(event);
  const result = await poster(target.webhookUrl, body, {
    [SIGNATURE_HEADER]: signWebhook(target.webhookSecret, body),
    "ownaplane-event": event.type,
  });
  await getDb()
    .update(calendarConnections)
    .set(
      result.ok
        ? { webhookLastAt: new Date(), webhookLastError: null }
        : { webhookLastError: result.error },
    )
    .where(eq(calendarConnections.id, target.id));
  return result;
}

/** A test event, so the other system can check it receives and verifies our calls. */
export async function sendTestWebhook(connectionId: string, poster: Poster = postWebhook) {
  const target = (await targets([connectionId])).get(connectionId);
  if (!target) return { ok: false, error: "not_found" } as const;
  return send(
    target,
    {
      id: randomUUID(),
      type: "ping",
      createdAt: new Date().toISOString(),
      aircraft: { id: target.aircraftId, registration: target.registration },
    },
    poster,
  );
}

/**
 * Send queued changes that are due (at most `limit` events). Changes to the same busy time for
 * the same system go as one call with its state now; failures are retried with growing pauses.
 * Returns how many calls succeeded.
 */
export async function deliverWebhooks(limit = 100, poster: Poster = postWebhook): Promise<number> {
  const db = getDb();
  const claimed = (await db.execute(sql`
    update ${webhookEvents} set attempts = attempts + 1,
      next_attempt_at = now() + make_interval(mins => (${sql.raw(`array[${BACKOFF_MINUTES.join(",")}]`)})[attempts + 1])
    where id in (
      select id from ${webhookEvents}
      where delivered_at is null and attempts < ${MAX_ATTEMPTS} and next_attempt_at <= now()
      order by created_at limit ${limit}
      for update skip locked)
    returning id, connection_id, entry_id, created_at`)) as unknown as {
    id: string;
    connection_id: string;
    entry_id: string;
    created_at: string;
  }[];
  if (!claimed.length) return 0;

  // In the order the changes happened (RETURNING has no order).
  claimed.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const groups = new Map<string, typeof claimed>();
  for (const e of claimed) {
    const key = `${e.connection_id}:${e.entry_id}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const byConnection = await targets([...new Set(claimed.map((e) => e.connection_id))]);
  let sent = 0;
  for (const events of groups.values()) {
    const { connection_id: connectionId, entry_id: entryId } = events[0]!;
    const newest = events.reduce((a, b) => (a.created_at > b.created_at ? a : b));
    const target = byConnection.get(connectionId);
    try {
      let result: PostResult;
      if (!target?.webhookUrl) {
        result = { ok: true }; // the webhook was removed: nothing to send
      } else {
        const [busy] = await busyTimesById(target, [entryId]);
        result = await send(
          target,
          {
            id: newest.id,
            type: busy ? "busy.updated" : "busy.deleted",
            createdAt: new Date(newest.created_at).toISOString(),
            aircraft: { id: target.aircraftId, registration: target.registration },
            busy: busy ? busyTimeDto(busy, exportFields(target.exportFields)) : { id: entryId },
          },
          poster,
        );
      }
      if (result.ok) {
        // Every queued change of this busy time up to now is covered by this call.
        await db
          .update(webhookEvents)
          .set({ deliveredAt: new Date(), lastError: null })
          .where(
            and(
              eq(webhookEvents.connectionId, connectionId),
              eq(webhookEvents.entryId, entryId),
              isNull(webhookEvents.deliveredAt),
              // In SQL: timestamps keep microseconds that a JavaScript date would lose.
              sql`${webhookEvents.createdAt} <= (select created_at from ${webhookEvents} where id = ${newest.id})`,
            ),
          );
        if (target?.webhookUrl) sent += 1;
      } else {
        await db
          .update(webhookEvents)
          .set({ lastError: result.error })
          .where(
            inArray(
              webhookEvents.id,
              events.map((e) => e.id),
            ),
          );
      }
    } catch (e) {
      await reportError(e, { where: "webhooks", tags: { connection: connectionId } });
    }
  }
  return sent;
}
