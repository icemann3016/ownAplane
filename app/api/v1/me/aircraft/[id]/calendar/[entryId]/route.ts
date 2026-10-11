import { deleteCalendarBlock } from "@/lib/aircraft/owner-ops";
import { requireApiUser } from "@/lib/api/auth";
import { apiRoute, json } from "@/lib/api/http";
import { aircraftError } from "@/lib/api/my-aircraft";
import { ownAircraftId } from "@/lib/api/my-aircraft-route";
import { sendNotificationsSoon } from "@/lib/notifications/soon";

type Context = RouteContext<"/api/v1/me/aircraft/[id]/calendar/[entryId]">;

/** DELETE …/calendar/{entryId}: remove a block (bookings are cancelled through the booking). */
export const DELETE = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id, entryId } = await params;
  sendNotificationsSoon(); // webhooks to connected systems (SYN-6)
  const outcome = await deleteCalendarBlock(
    user.id,
    ownAircraftId(id),
    ownAircraftId(entryId, "calendar entry"),
  );
  if (!outcome.ok) throw aircraftError(outcome);
  return json({ data: { id: entryId, deleted: true } });
});
