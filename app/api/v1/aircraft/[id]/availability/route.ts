import { getBusyPeriods } from "@/lib/aircraft/calendar";
import { getVisibleAircraft } from "@/lib/aircraft/public";
import { isUuid } from "@/lib/aircraft/queries";
import { optionalApiUser } from "@/lib/api/auth";
import { ApiError, apiRoute, json, parse, queryOf } from "@/lib/api/http";
import { periodQuery } from "@/lib/api/schemas";

type Context = RouteContext<"/api/v1/aircraft/[id]/availability">;

/**
 * GET /api/v1/aircraft/{id}/availability?from&to: when the aircraft is busy (SRC-4): bookings,
 * requests, the owner's blocks and other systems' busy times, as times and kinds only.
 */
export const GET = apiRoute(async (request, { params }: Context) => {
  const user = await optionalApiUser(request);
  const { id } = await params;
  const visible = isUuid(id) ? await getVisibleAircraft(user?.id ?? null, id) : null;
  if (!visible) throw new ApiError("not_found", "No aircraft with this id.");
  const { from, to } = parse(periodQuery, queryOf(request));
  const busy = await getBusyPeriods(user?.id ?? null, id, from, to);
  return json({
    data: busy.map((b) => ({
      from: b.from.toISOString(),
      to: b.to.toISOString(),
      kind: b.kind,
      pending: b.pending,
    })),
  });
});
