import { requireConnection } from "@/lib/api/connection-auth";
import { busyTimeDto } from "@/lib/api/dto";
import { apiRoute, bodyOf, json, parse, queryOf } from "@/lib/api/http";
import { busyWindowQuery, pushAllBody } from "@/lib/api/schemas";
import { applyEvents } from "@/lib/calendar-sync/apply";
import { busyTimesFor } from "@/lib/calendar-sync/busy";
import { normalizeEvents } from "@/lib/calendar-sync/events";
import { sendNotificationsSoon } from "@/lib/notifications/soon";

/**
 * GET /api/v1/sync/busy?from&to: when the aircraft is busy in ownAplane (bookings, requests,
 * blocks and other systems), without your own busy times. Check this before you confirm a
 * booking in your system (SYN-4).
 */
export const GET = apiRoute(async (request) => {
  const connection = await requireConnection(request);
  const { from, to } = parse(busyWindowQuery, queryOf(request));
  const busy = await busyTimesFor(connection, from, to);
  return json({ data: busy.map(busyTimeDto) });
});

/**
 * PUT /api/v1/sync/busy: replace all your busy times with this list (a full snapshot of your
 * system for this aircraft). Clashes with ownAplane bookings are kept for the owner to resolve.
 */
export const PUT = apiRoute(async (request) => {
  const connection = await requireConnection(request);
  const { busy } = parse(pushAllBody, await bodyOf(request));
  sendNotificationsSoon(); // conflict alerts (SYN-5)
  const { events } = normalizeEvents(
    busy.map((b) => ({ id: b.id, from: new Date(b.start), to: new Date(b.end) })),
  );
  const result = await applyEvents(connection.id, events, "replace");
  const statuses = [...result.statuses];
  return json({
    data: {
      count: events.length,
      removed: result.removed,
      active: statuses.filter(([, s]) => s === "active").length,
      covered: statuses.filter(([, s]) => s === "covered").length,
      conflicts: statuses.filter(([, s]) => s === "conflict").map(([id]) => id),
    },
  });
});
