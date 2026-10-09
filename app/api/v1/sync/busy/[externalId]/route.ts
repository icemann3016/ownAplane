import { requireConnection } from "@/lib/api/connection-auth";
import { ApiError, apiRoute, bodyOf, json, parse } from "@/lib/api/http";
import { externalId as externalIdSchema, pushBusyBody } from "@/lib/api/schemas";
import { applyEvents, removeEvent } from "@/lib/calendar-sync/apply";
import { normalizeEvents } from "@/lib/calendar-sync/events";
import { sendNotificationsSoon } from "@/lib/notifications/soon";

type Context = RouteContext<"/api/v1/sync/busy/[externalId]">;

const idOf = async ({ params }: Context) =>
  parse(externalIdSchema, decodeURIComponent((await params).externalId));

/**
 * PUT /api/v1/sync/busy/{externalId}: create or move one of your bookings (SYN-4). 409 when it
 * overlaps an ownAplane booking: it is still recorded, and the owner is asked to resolve it.
 */
export const PUT = apiRoute(async (request, context: Context) => {
  const connection = await requireConnection(request);
  const externalId = await idOf(context);
  const body = parse(pushBusyBody, await bodyOf(request));
  const { events } = normalizeEvents([
    { id: externalId, from: new Date(body.start), to: new Date(body.end) },
  ]);
  if (!events.length) {
    // In the past or more than 400 days ahead: nothing to block. A stored copy is removed.
    await removeEvent(connection.id, externalId);
    return json({ data: { externalId, status: "ignored" } });
  }
  sendNotificationsSoon(); // conflict alerts (SYN-5)
  const { statuses } = await applyEvents(connection.id, events, "upsert");
  const status = statuses.get(externalId)!;
  if (status === "conflict") {
    throw new ApiError(
      "conflict",
      "This time overlaps a booking in ownAplane. It was recorded and the owner was asked to resolve it.",
      undefined,
      { externalId, status: "conflict", recorded: true },
    );
  }
  return json({ data: { externalId, status } });
});

/** DELETE /api/v1/sync/busy/{externalId}: your booking was cancelled; the time is free again. */
export const DELETE = apiRoute(async (request, context: Context) => {
  const connection = await requireConnection(request);
  const externalId = await idOf(context);
  if (!(await removeEvent(connection.id, externalId))) {
    throw new ApiError("not_found", "No busy time with this id.");
  }
  return json({ data: { externalId, deleted: true } });
});
