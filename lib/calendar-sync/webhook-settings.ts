import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { calendarConnections } from "@/lib/db/schema";
import { newWebhookSecret } from "./signature";

// A partner system manages its own webhook with its connection's API key (SYN-6). Trusted:
// callers checked the key. Owners do the same in the app with their own rights.

const columns = {
  url: calendarConnections.webhookUrl,
  secret: calendarConnections.webhookSecret,
  lastDeliveryAt: calendarConnections.webhookLastAt,
  lastError: calendarConnections.webhookLastError,
};

export type WebhookState = {
  url: string | null;
  secret: string | null;
  lastDeliveryAt: Date | null;
  lastError: string | null;
};

export async function getWebhook(connectionId: string): Promise<WebhookState> {
  const [row] = await getDb()
    .select(columns)
    .from(calendarConnections)
    .where(eq(calendarConnections.id, connectionId));
  return row ?? { url: null, secret: null, lastDeliveryAt: null, lastError: null };
}

/** Set the address; a secret is made the first time or when asked. `secret` is set only then. */
export async function setWebhook(
  connectionId: string,
  url: string,
  newSecret: boolean,
): Promise<WebhookState> {
  const current = await getWebhook(connectionId);
  const secret = newSecret || !current.secret ? newWebhookSecret() : null;
  const [row] = await getDb()
    .update(calendarConnections)
    .set({ webhookUrl: url, ...(secret ? { webhookSecret: secret, webhookLastError: null } : {}) })
    .where(eq(calendarConnections.id, connectionId))
    .returning(columns);
  return { ...row!, secret };
}

export async function removeWebhookFor(connectionId: string) {
  await getDb()
    .update(calendarConnections)
    .set({ webhookUrl: null, webhookSecret: null, webhookLastError: null })
    .where(eq(calendarConnections.id, connectionId));
}
