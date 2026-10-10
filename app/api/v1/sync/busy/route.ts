import { requireConnection } from "@/lib/api/connection-auth";
import { busyTimeDto } from "@/lib/api/dto";
import { apiRoute, bodyOf, json, parse, queryOf } from "@/lib/api/http";
import { busyWindowQuery, pushAllBody, toExternalEvent } from "@/lib/api/schemas";
import { applyEvents } from "@/lib/calendar-sync/apply";
import { busyTimesFor } from "@/lib/calendar-sync/busy";
import { normalizeEvents } from "@/lib/calendar-sync/events";
import { exportFields } from "@/lib/calendar-sync/fields";
import { sendNotificationsSoon } from "@/lib/notifications/soon";

/**
 * GET /api/v1/sync/busy?from&to: when the aircraft is busy in ownAplane (bookings, requests,
 * blocks and other systems), without your own busy times, with the details the owner shares.
 * Check this before you confirm a booking in your system (SYN-4).
 */
export const GET = apiRoute(async (request) => {
  const connection = await requireConnection(request);
  const { from, to } = parse(busyWindowQuery, queryOf(request));
  const busy = await busyTimesFor(connection, from, to);
  const fields = exportFields(connection.exportFields);
  return json({ data: busy.map((b) => busyTimeDto(b, fields)) });
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
    busy.filter((b) => b.status !== "cancelled").map((b) => toExternalEvent(b.id, b)),
  );
  const result = await applyEvents(connection.id, events, "replace");
  const statuses = [...result.statuses];
  const withStatus = (status: string) => statuses.filter(([, s]) => s === status);
  return json({
    data: {
      count: events.length - withStatus("ignored").length - withStatus("wrong_aircraft").length,
      removed: result.removed,
      active: withStatus("active").length,
      covered: withStatus("covered").length,
      conflicts: withStatus("conflict").map(([id]) => id),
      ignored: withStatus("ignored").map(([id]) => id),
      wrongAircraft: withStatus("wrong_aircraft").map(([id]) => id),
    },
  });
});
