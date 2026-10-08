import { airportDto } from "@/lib/api/dto";
import { ApiError, apiRoute, json } from "@/lib/api/http";
import { getAirport } from "@/lib/airports";

/** GET /api/v1/airports/{ident}: one airfield (public). */
export const GET = apiRoute(
  async (_request, { params }: RouteContext<"/api/v1/airports/[ident]">) => {
    const airport = await getAirport((await params).ident.slice(0, 10).toUpperCase());
    if (!airport) throw new ApiError("not_found", "No airfield with this ident.");
    return json({ data: airportDto(airport) });
  },
);
