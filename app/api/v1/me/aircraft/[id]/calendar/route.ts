import { getCalendarEntries } from "@/lib/aircraft/calendar";
import { addCalendarBlock } from "@/lib/aircraft/owner-ops";
import { calendarBlockBody, calendarEntryDto, calendarWindowQuery } from "@/lib/api/aircraft-ops";
import { requireApiUser } from "@/lib/api/auth";
import { apiRoute, bodyOf, json, parse, queryOf } from "@/lib/api/http";
import { aircraftError } from "@/lib/api/my-aircraft";
import { requireOwnAircraft } from "@/lib/api/my-aircraft-route";
import { sendNotificationsSoon } from "@/lib/notifications/soon";

type Context = RouteContext<"/api/v1/me/aircraft/[id]/calendar">;

/**
 * GET /api/v1/me/aircraft/{id}/calendar?from&to: bookings, the owner's blocks and busy times
 * from connected systems (default: the next 60 days, at most a year).
 */
export const GET = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const plane = await requireOwnAircraft(user.id, (await params).id);
  const { from, to } = parse(calendarWindowQuery, queryOf(request));
  const entries = await getCalendarEntries(user.id, plane.id, from, to);
  return json({ data: entries.map(calendarEntryDto), nextCursor: null });
});

/** POST …/calendar `{ kind, from, to, note }`: block time (UTC); 409 `overlaps`. */
export const POST = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const plane = await requireOwnAircraft(user.id, (await params).id);
  const block = parse(calendarBlockBody, await bodyOf(request));
  sendNotificationsSoon(); // webhooks to connected systems (SYN-6)
  const saved = await addCalendarBlock(user.id, plane.id, block);
  if (!saved.ok) throw aircraftError(saved);
  const entries = await getCalendarEntries(user.id, plane.id, block.from, block.to);
  const entry = entries.find((e) => e.id === saved.id)!;
  return json({ data: calendarEntryDto(entry) }, { status: 201 });
});
