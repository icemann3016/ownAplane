import { requireApiUser } from "@/lib/api/auth";
import { check, logResponse } from "@/lib/api/flight-log";
import { apiRoute, bodyOf, parse } from "@/lib/api/http";
import { startLogBody } from "@/lib/api/schemas";
import { startFlightLog } from "@/lib/bookings/flight-log-ops";
import { sendNotificationsSoon } from "@/lib/notifications/soon";

type Context = RouteContext<"/api/v1/bookings/[id]/log">;

/** GET /api/v1/bookings/{id}/log: the rental's flight log, with its amount and checks. */
export const GET = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  return logResponse(user.id, (await params).id);
});

/**
 * POST /api/v1/bookings/{id}/log `{ recencyConfirmed? }`: check-out (the pilot, from 2 hours
 * before the start). With passengers, `recencyConfirmed: true` is required (FCL.060).
 */
export const POST = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  const { recencyConfirmed } = parse(startLogBody, await bodyOf(request, {}));
  sendNotificationsSoon();
  check(await startFlightLog(user.id, id, recencyConfirmed));
  return logResponse(user.id, id, 201);
});
