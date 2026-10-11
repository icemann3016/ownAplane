import { deleteAircraft, updateAircraft } from "@/lib/aircraft/manage";
import { requireApiUser } from "@/lib/api/auth";
import { apiRoute, bodyOf, json, parse } from "@/lib/api/http";
import { aircraftError, updateAircraftBody } from "@/lib/api/my-aircraft";
import { myAircraftResponse } from "@/lib/api/my-aircraft-dto";
import { ownAircraftId } from "@/lib/api/my-aircraft-route";

type Context = RouteContext<"/api/v1/me/aircraft/[id]">;

/** GET /api/v1/me/aircraft/{id}: everything about the owner's aircraft. */
export const GET = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  return myAircraftResponse(user.id, ownAircraftId((await params).id));
});

/** PATCH /api/v1/me/aircraft/{id}: change any fields (details, equipment, base, prices). */
export const PATCH = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const id = ownAircraftId((await params).id);
  const values = parse(updateAircraftBody, await bodyOf(request));
  const saved = await updateAircraft(user.id, id, values);
  if (!saved.ok) throw aircraftError(saved);
  return myAircraftResponse(user.id, id);
});

/** DELETE /api/v1/me/aircraft/{id}: with its photos and documents; not with open bookings. */
export const DELETE = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const id = ownAircraftId((await params).id);
  const outcome = await deleteAircraft(user.id, id);
  if (!outcome.ok) throw aircraftError(outcome);
  return json({ data: { id, deleted: true } });
});
