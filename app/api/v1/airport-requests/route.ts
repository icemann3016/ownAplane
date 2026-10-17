import {
  airportRequestBody,
  airportRequestError,
  toRequestInput,
} from "@/lib/api/airport-requests";
import { airportRequestDto, airportRequestSummaryDto } from "@/lib/api/airport-requests-dto";
import { requireApiUser } from "@/lib/api/auth";
import { ApiError, apiRoute, bodyOf, json, parse } from "@/lib/api/http";
import { sendAirportRequest } from "@/lib/airport-requests/ops";
import { getAirportRequest, myAirportRequests } from "@/lib/airport-requests/queries";
import { getAirportProfile } from "@/lib/airport-profile/queries";
import { getAirport } from "@/lib/airports";
import { sendNotificationsSoon } from "@/lib/notifications/soon";

/** GET /api/v1/airport-requests: the pilot's requests to airfields, the latest trip first. */
export const GET = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  const rows = await myAirportRequests(user.id);
  return json({ data: rows.map(airportRequestSummaryDto), nextCursor: null });
});

/**
 * POST /api/v1/airport-requests: a pilot asks an airfield on ownAplane for an arrival and/or a
 * departure with services from its list (APT-2/3), like the website. Pending with PPR, else
 * confirmed at once; the airfield's team is told.
 */
export const POST = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  const body = parse(airportRequestBody, await bodyOf(request));
  const input = toRequestInput(body);
  const [airfield, from, to] = await Promise.all([
    getAirportProfile(body.airport),
    getAirport(input.fromIdent),
    getAirport(input.toIdent),
  ]);
  if (!airfield) throw new ApiError("not_found", "No airfield on ownAplane with this ident.");
  const unknown = {
    ...(input.fromIdent && !from ? { arrival: ["airportUnknown"] } : {}),
    ...(input.toIdent && !to ? { departure: ["airportUnknown"] } : {}),
  };
  if (Object.keys(unknown).length) {
    throw new ApiError("validation_failed", "Unknown airfield.", unknown, {
      reason: "unknown_airfield",
    });
  }
  sendNotificationsSoon();
  const result = await sendAirportRequest(user.id, body.airport, input);
  if (!result.ok) throw airportRequestError(result.error);
  const view = await getAirportRequest(user.id, result.id);
  return json({ data: airportRequestDto(view!, user.id) }, { status: 201 });
});
