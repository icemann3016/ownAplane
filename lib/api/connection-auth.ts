import "server-only";

import { findConnection } from "@/lib/calendar-sync/busy";
import { API_KEY_PREFIX, hashApiKey } from "@/lib/calendar-sync/keys";
import { ApiError } from "./http";

// Partner systems (SYN-4) authenticate with the API key of their connection, created by the
// aircraft's owner: `Authorization: Bearer oap_…`. The key decides the aircraft; it can only
// read that aircraft's busy times and write its own.

export type ApiConnection = NonNullable<Awaited<ReturnType<typeof findConnection>>>;

export async function requireConnection(request: Request): Promise<ApiConnection> {
  const header = request.headers.get("authorization")?.trim() ?? "";
  const key = /^bearer\s+(\S+)$/i.exec(header)?.[1];
  if (!key?.startsWith(API_KEY_PREFIX)) {
    throw new ApiError(
      "unauthorized",
      "Send the connection's API key as: Authorization: Bearer oap_…",
    );
  }
  const connection = await findConnection({ apiKeyHash: hashApiKey(key) });
  if (!connection || connection.inbound !== "push") {
    throw new ApiError("unauthorized", "This API key is not valid (it may have been replaced).");
  }
  return connection;
}
