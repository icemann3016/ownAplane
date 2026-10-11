import { remarkDto } from "@/lib/api/aircraft-ops";
import { requireApiUser } from "@/lib/api/auth";
import { apiRoute, json } from "@/lib/api/http";
import { requireOwnAircraft } from "@/lib/api/my-aircraft-route";
import { getAircraftRemarks } from "@/lib/bookings/remarks";

type Context = RouteContext<"/api/v1/me/aircraft/[id]/remarks">;

/** GET /api/v1/me/aircraft/{id}/remarks: pilots' remarks from flight logs, newest first. */
export const GET = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const plane = await requireOwnAircraft(user.id, (await params).id);
  const rows = await getAircraftRemarks(user.id, plane.id);
  return json({ data: rows.map(remarkDto), nextCursor: null });
});
