import { defectBody, defectDto } from "@/lib/api/aircraft-ops";
import { requireApiUser } from "@/lib/api/auth";
import { apiRoute, bodyOf, json, parse } from "@/lib/api/http";
import { aircraftError } from "@/lib/api/my-aircraft";
import { requireOwnAircraft } from "@/lib/api/my-aircraft-route";
import { getAircraftDefects, reportDefect } from "@/lib/bookings/defects";

type Context = RouteContext<"/api/v1/me/aircraft/[id]/defects">;

/** GET /api/v1/me/aircraft/{id}/defects: reported defects, newest first (BKG-8). */
export const GET = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const plane = await requireOwnAircraft(user.id, (await params).id);
  const rows = await getAircraftDefects(user.id, plane.id);
  return json({ data: rows.map(defectDto), nextCursor: null });
});

/** POST …/defects `{ severity, description, photoId }`: the owner records a defect. */
export const POST = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const plane = await requireOwnAircraft(user.id, (await params).id);
  const input = parse(defectBody, await bodyOf(request));
  const result = await reportDefect(user.id, { ...input, aircraftId: plane.id, bookingId: null });
  if (!result.ok) throw aircraftError({ ...result, field: fieldOf(result.error) });
  const rows = await getAircraftDefects(user.id, plane.id);
  return json({ data: defectDto(rows.find((r) => r.defect.id === result.id)!) }, { status: 201 });
});

const fieldOf = (error: string) =>
  error === "bad_photo" ? "photoId" : error === "description_required" ? "description" : undefined;
