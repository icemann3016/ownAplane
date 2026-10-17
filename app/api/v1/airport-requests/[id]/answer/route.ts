import { airportRequestError, requestAnswerBody, visibleRequest } from "@/lib/api/airport-requests";
import { airportRequestDto } from "@/lib/api/airport-requests-dto";
import { requireApiUser } from "@/lib/api/auth";
import { apiRoute, bodyOf, json, parse } from "@/lib/api/http";
import { answerAirportRequest } from "@/lib/airport-requests/ops";
import { sendNotificationsSoon } from "@/lib/notifications/soon";

type Context = RouteContext<"/api/v1/airport-requests/[id]/answer">;

/**
 * POST /api/v1/airport-requests/{id}/answer `{ decision, pprNumber?, conditions?, note? }`: the
 * airfield's team approves or declines (APT-4); the pilot is told.
 */
export const POST = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  const answer = parse(requestAnswerBody, await bodyOf(request));
  await visibleRequest(user.id, id);
  sendNotificationsSoon();
  const result = await answerAirportRequest(user.id, id, answer);
  if (!result.ok) throw airportRequestError(result.error);
  return json({ data: airportRequestDto(await visibleRequest(user.id, id), user.id) });
});
