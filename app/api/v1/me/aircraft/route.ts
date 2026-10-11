import { createAircraft } from "@/lib/aircraft/manage";
import { listOwnAircraft } from "@/lib/aircraft/queries";
import { requireApiUser } from "@/lib/api/auth";
import { apiRoute, bodyOf, json, parse } from "@/lib/api/http";
import { aircraftError, createAircraftBody } from "@/lib/api/my-aircraft";
import { myAircraftResponse, myAircraftSummaryDto } from "@/lib/api/my-aircraft-dto";

/** GET /api/v1/me/aircraft: the owner's aircraft, newest first, with what stops each listing. */
export const GET = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  const rows = await listOwnAircraft(user.id);
  return json({ data: rows.map(myAircraftSummaryDto), nextCursor: null });
});

/** POST /api/v1/me/aircraft: a new draft (registration, type, seats, fuel; SI units). */
export const POST = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  const input = parse(createAircraftBody, await bodyOf(request));
  const created = await createAircraft(user.id, input);
  if (!created.ok) throw aircraftError(created);
  return myAircraftResponse(user.id, created.id, 201);
});
