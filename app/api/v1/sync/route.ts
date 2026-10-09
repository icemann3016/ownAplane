import { requireConnection } from "@/lib/api/connection-auth";
import { apiRoute, json } from "@/lib/api/http";

/** GET /api/v1/sync: which connection and aircraft this API key belongs to (SYN-4). */
export const GET = apiRoute(async (request) => {
  const c = await requireConnection(request);
  return json({
    data: {
      connection: { id: c.id, name: c.name },
      aircraft: { id: c.aircraftId, registration: c.registration },
    },
  });
});
