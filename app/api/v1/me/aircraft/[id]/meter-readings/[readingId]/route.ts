import { deleteMeterReading } from "@/lib/aircraft/owner-ops";
import { requireApiUser } from "@/lib/api/auth";
import { apiRoute, json } from "@/lib/api/http";
import { aircraftError } from "@/lib/api/my-aircraft";
import { ownAircraftId } from "@/lib/api/my-aircraft-route";

type Context = RouteContext<"/api/v1/me/aircraft/[id]/meter-readings/[readingId]">;

/** DELETE …/meter-readings/{readingId}: remove one recorded by mistake. */
export const DELETE = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id, readingId } = await params;
  const outcome = await deleteMeterReading(
    user.id,
    ownAircraftId(id),
    ownAircraftId(readingId, "meter reading"),
  );
  if (!outcome.ok) throw aircraftError(outcome);
  return json({ data: { id: readingId, deleted: true } });
});
