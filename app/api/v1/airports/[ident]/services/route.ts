import { airfieldServicesDto } from "@/lib/api/airport-requests-dto";
import { ApiError, apiRoute, json } from "@/lib/api/http";
import { getAirportProfile } from "@/lib/airport-profile/queries";

type Context = RouteContext<"/api/v1/airports/[ident]/services">;

/**
 * GET /api/v1/airports/{ident}/services: an airfield's services and prices, PPR and currency,
 * to pick from in a request (APT-1/2). Public, like the airfield's page.
 */
export const GET = apiRoute(async (_request, { params }: Context) => {
  const profile = await getAirportProfile((await params).ident.slice(0, 20).toUpperCase());
  if (!profile) throw new ApiError("not_found", "No airfield on ownAplane with this ident.");
  return json({ data: airfieldServicesDto(profile) });
});
