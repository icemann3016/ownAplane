import { getMeterReadings } from "@/lib/aircraft/meter-readings";
import { addMeterReading } from "@/lib/aircraft/owner-ops";
import { meterReadingBody, meterReadingDto } from "@/lib/api/aircraft-ops";
import { requireApiUser } from "@/lib/api/auth";
import { apiRoute, bodyOf, json, parse } from "@/lib/api/http";
import { aircraftError } from "@/lib/api/my-aircraft";
import { requireOwnAircraft } from "@/lib/api/my-aircraft-route";

type Context = RouteContext<"/api/v1/me/aircraft/[id]/meter-readings">;

/** GET /api/v1/me/aircraft/{id}/meter-readings: the latest 50 the owner recorded. */
export const GET = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const plane = await requireOwnAircraft(user.id, (await params).id);
  const rows = await getMeterReadings(user.id, plane.id, 50);
  return json({ data: rows.map(meterReadingDto), nextCursor: null });
});

/**
 * POST …/meter-readings `{ readAt, hobbs, tach, note }`: Hobbs/tach between rentals, e.g. after
 * flying outside ownAplane; the next check-out is compared with it (BKG-7).
 */
export const POST = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const plane = await requireOwnAircraft(user.id, (await params).id);
  const reading = parse(meterReadingBody, await bodyOf(request));
  const saved = await addMeterReading(user.id, plane.id, reading);
  if (!saved.ok) throw aircraftError(saved);
  const rows = await getMeterReadings(user.id, plane.id, 50);
  return json({ data: meterReadingDto(rows.find((r) => r.id === saved.id)!) }, { status: 201 });
});
