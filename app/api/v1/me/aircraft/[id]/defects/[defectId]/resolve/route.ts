import { resolveDefect } from "@/lib/aircraft/owner-ops";
import { defectDto, resolveBody } from "@/lib/api/aircraft-ops";
import { requireApiUser } from "@/lib/api/auth";
import { apiRoute, bodyOf, json, parse } from "@/lib/api/http";
import { aircraftError } from "@/lib/api/my-aircraft";
import { ownAircraftId, requireOwnAircraft } from "@/lib/api/my-aircraft-route";
import { getAircraftDefects } from "@/lib/bookings/defects";

type Context = RouteContext<"/api/v1/me/aircraft/[id]/defects/[defectId]/resolve">;

/** POST …/defects/{defectId}/resolve `{ note }`: the owner marks it fixed. */
export const POST = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id, defectId } = await params;
  const plane = await requireOwnAircraft(user.id, id);
  const { note } = parse(resolveBody, await bodyOf(request, {}));
  const outcome = await resolveDefect(user.id, ownAircraftId(defectId, "defect"), note);
  if (!outcome.ok) throw aircraftError(outcome);
  const row = (await getAircraftDefects(user.id, plane.id)).find((r) => r.defect.id === defectId);
  return json({ data: defectDto(row!) });
});
