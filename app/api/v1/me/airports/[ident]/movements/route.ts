import { movementsQuery } from "@/lib/api/airport-requests";
import { movementDto } from "@/lib/api/airport-requests-dto";
import { requireApiUser } from "@/lib/api/auth";
import { ApiError, apiRoute, json, parse, queryOf } from "@/lib/api/http";
import { airportMovements } from "@/lib/airport-requests/queries";
import { myAirportRole } from "@/lib/airport-teams/teams";

type Context = RouteContext<"/api/v1/me/airports/[ident]/movements">;

/**
 * GET /api/v1/me/airports/{ident}/movements?from&to: the airfield's movements board for its team
 * (APT-5): requests arriving, departing or on the ground in the period, earliest first.
 */
export const GET = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const ident = (await params).ident.slice(0, 20).toUpperCase();
  if (!(await myAirportRole(user.id, ident))) {
    throw new ApiError("not_found", "You're not on the team of an airfield with this ident.");
  }
  const { from, to } = parse(movementsQuery, queryOf(request));
  const rows = await airportMovements(user.id, ident, new Date(from), new Date(to));
  return json({ data: rows.map(movementDto), nextCursor: null });
});
