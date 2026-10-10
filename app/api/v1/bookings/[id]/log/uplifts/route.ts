import { requireApiUser } from "@/lib/api/auth";
import { check, logOf, logResponse } from "@/lib/api/flight-log";
import { apiRoute, bodyOf, parse } from "@/lib/api/http";
import { upliftBody } from "@/lib/api/schemas";
import { saveUplift } from "@/lib/bookings/log-entries";

type Context = RouteContext<"/api/v1/bookings/[id]/log/uplifts">;

/** POST /api/v1/bookings/{id}/log/uplifts: fuel or oil added (litres, price, who paid). */
export const POST = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  const uplift = parse(upliftBody, await bodyOf(request));
  const { data } = await logOf(user.id, id);
  check(await saveUplift(user.id, data.log.id, null, uplift));
  return logResponse(user.id, id, 201);
});
