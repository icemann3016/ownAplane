import { requireApiUser } from "@/lib/api/auth";
import { check, logOf, logResponse } from "@/lib/api/flight-log";
import { apiRoute, bodyOf, parse } from "@/lib/api/http";
import { legBody } from "@/lib/api/schemas";
import { saveLeg } from "@/lib/bookings/log-entries";

type Context = RouteContext<"/api/v1/bookings/[id]/log/legs">;

/**
 * POST /api/v1/bookings/{id}/log/legs: add a leg. Times must be in the order they happen
 * (engine start ≤ block off < take-off < landing < block on ≤ engine stop).
 */
export const POST = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  const leg = parse(legBody, await bodyOf(request));
  const { data } = await logOf(user.id, id);
  check(await saveLeg(user.id, data.log.id, null, leg));
  return logResponse(user.id, id, 201);
});
