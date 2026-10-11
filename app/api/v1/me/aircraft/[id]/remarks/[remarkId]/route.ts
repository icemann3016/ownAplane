import { setKnownItem } from "@/lib/aircraft/owner-ops";
import { knownItemBody, remarkDto } from "@/lib/api/aircraft-ops";
import { requireApiUser } from "@/lib/api/auth";
import { apiRoute, bodyOf, json, parse } from "@/lib/api/http";
import { aircraftError } from "@/lib/api/my-aircraft";
import { ownAircraftId, requireOwnAircraft } from "@/lib/api/my-aircraft-route";
import { getAircraftRemarks } from "@/lib/bookings/remarks";

type Context = RouteContext<"/api/v1/me/aircraft/[id]/remarks/[remarkId]">;

/**
 * PUT …/remarks/{remarkId} `{ state: known | resolved }`: an aircraft remark becomes a known item
 * (shown to pilots of upcoming bookings) or is fixed (BKG-15).
 */
export const PUT = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id, remarkId } = await params;
  const plane = await requireOwnAircraft(user.id, id);
  const { state } = parse(knownItemBody, await bodyOf(request));
  const outcome = await setKnownItem(user.id, ownAircraftId(remarkId, "remark"), state);
  if (!outcome.ok) throw aircraftError(outcome);
  const row = (await getAircraftRemarks(user.id, plane.id)).find((r) => r.remark.id === remarkId);
  return json({ data: remarkDto(row!) });
});
