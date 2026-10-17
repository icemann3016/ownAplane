import { myAirfieldDto } from "@/lib/api/airport-requests-dto";
import { requireApiUser } from "@/lib/api/auth";
import { apiRoute, json } from "@/lib/api/http";
import { airfieldToday } from "@/lib/airport-requests/queries";
import { myAirports } from "@/lib/airport-teams/teams";

/** GET /api/v1/me/airports: the airfields whose team the user is on, with today's movements. */
export const GET = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  const rows = await myAirports(user.id);
  const today = await airfieldToday(
    user.id,
    rows.map((r) => r.airport.ident),
  );
  return json({
    data: rows.map((r) => myAirfieldDto(r, today.get(r.airport.ident))),
    nextCursor: null,
  });
});
