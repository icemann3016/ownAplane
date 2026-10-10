import { requireApiUser } from "@/lib/api/auth";
import { check, logOf, logResponse } from "@/lib/api/flight-log";
import { apiRoute, bodyOf, parse } from "@/lib/api/http";
import { correctionBody } from "@/lib/api/schemas";
import { requestLogCorrection } from "@/lib/bookings/flight-log-ops";
import { sendNotificationsSoon } from "@/lib/notifications/soon";

type Context = RouteContext<"/api/v1/bookings/[id]/log/correction">;

/** POST /api/v1/bookings/{id}/log/correction `{ note }`: the owner asks for a correction. */
export const POST = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  const { note } = parse(correctionBody, await bodyOf(request));
  const { data } = await logOf(user.id, id);
  sendNotificationsSoon();
  check(await requestLogCorrection(user.id, data.log.id, note));
  return logResponse(user.id, id);
});
