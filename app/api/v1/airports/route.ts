import { airportDto } from "@/lib/api/dto";
import { apiRoute, json, parse, queryOf } from "@/lib/api/http";
import { airportQuery } from "@/lib/api/schemas";
import { searchAirports } from "@/lib/airports";

/** GET /api/v1/airports?q=sofia: European airfields by ICAO code, name or town (public). */
export const GET = apiRoute(async (request) => {
  const { q, limit } = parse(airportQuery, queryOf(request));
  const results = await searchAirports(q, limit);
  return json({ data: results.map(airportDto) });
});
