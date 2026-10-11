import "server-only";

import { and, asc, desc, eq, gte, ilike, lte, type SQL, sql } from "drizzle-orm";

import { type AirportSummary, getAirport } from "@/lib/airports";
import { isDatabaseConfigured, type Tx } from "@/lib/db";
import { asAnon, asUser } from "@/lib/db/rls";
import { aircraft, aircraftPhotos, airports } from "@/lib/db/schema";
import { zonedToUtc } from "@/lib/domain/time";
import type { SearchFilters } from "@/lib/validation/search";
import { photoUrl } from "./queries";

const EARTH_RADIUS_KM = 6371;
const MAX_RESULTS = 50;

/** Escape % and _ so user input is matched literally in LIKE patterns. */
const likeEscape = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

export type SearchResult = Awaited<ReturnType<typeof searchAircraft>>["results"][number];

/**
 * Listed aircraft matching the filters (SRC-1, SRC-2): near an airport, free for the whole
 * period, and, if asked, only those the logged-in pilot may rent. Times in the URL are local to
 * the search airport (UTC without one).
 */
export async function searchAircraft(viewerId: string | null, f: SearchFilters) {
  const origin: AirportSummary | null = f.airport ? await getAirport(f.airport) : null;
  const originCoords = origin
    ? await asAnon(async (tx) => {
        const [row] = await tx
          .select({ lat: airports.latitude, lon: airports.longitude })
          .from(airports)
          .where(eq(airports.ident, origin.ident));
        return row ?? null;
      })
    : null;
  const timeZone = "UTC";
  const from = f.from ? zonedToUtc(f.from, timeZone) : null;
  const to = f.to ? zonedToUtc(f.to, timeZone) : null;
  const period = from && to && to > from ? { from, to } : null;
  const range = period
    ? sql`tstzrange(${period.from.toISOString()}::timestamptz, ${period.to.toISOString()}::timestamptz, '[)')`
    : null;

  if (!isDatabaseConfigured()) {
    return { origin, originCoords, period, timeZone, results: [] as never[] };
  }

  // Great-circle distance from the search airport, in km (no PostGIS needed at our scale).
  const distance = originCoords
    ? sql<number>`${EARTH_RADIUS_KM} * 2 * asin(sqrt(
        power(sin(radians(${airports.latitude} - ${originCoords.lat}) / 2), 2)
        + cos(radians(${originCoords.lat})) * cos(radians(${airports.latitude}))
          * power(sin(radians(${airports.longitude} - ${originCoords.lon}) / 2), 2)))`
    : sql<number | null>`null::float8`;

  const where: (SQL | undefined)[] = [eq(aircraft.status, "listed")];
  if (originCoords) {
    // Cheap bounding box first, then the exact distance.
    const dLat = f.radius / 111;
    const dLon = f.radius / (111 * Math.max(Math.cos((originCoords.lat * Math.PI) / 180), 0.1));
    where.push(
      gte(airports.latitude, originCoords.lat - dLat),
      lte(airports.latitude, originCoords.lat + dLat),
      gte(airports.longitude, originCoords.lon - dLon),
      lte(airports.longitude, originCoords.lon + dLon),
      sql`${distance} <= ${f.radius}`,
    );
  }
  if (f.category) where.push(eq(aircraft.category, f.category));
  if (f.seats) where.push(gte(aircraft.seats, f.seats));
  if (f.maxPrice) where.push(lte(aircraft.pricePerHour, f.maxPrice));
  if (f.fuel) where.push(eq(aircraft.priceBasis, f.fuel));
  if (f.night) where.push(eq(aircraft.nightVfr, true));
  if (f.ifr) where.push(eq(aircraft.ifr, true));
  if (f.avionics) where.push(ilike(aircraft.avionics, `%${likeEscape(f.avionics)}%`));
  if (range) where.push(sql`public.aircraft_is_free(${aircraft.id}, ${range})`);
  // Aircraft not approved for night VFR can't fly a period that touches night at their base.
  if (range) {
    where.push(
      sql`(${aircraft.nightVfr} or not public.period_needs_night(${range}, ${airports.latitude}, ${airports.longitude}))`,
    );
  }
  if (f.eligible && viewerId) {
    where.push(sql`public.i_meet_requirements(${aircraft.id}, ${range ?? sql`null::tstzrange`})`);
  }

  const order = {
    distance: originCoords ? [asc(distance), desc(aircraft.createdAt)] : [desc(aircraft.createdAt)],
    price: [asc(aircraft.pricePerHour), desc(aircraft.createdAt)],
    rating: [sql`${aircraft.ratingAvg} desc nulls last`, desc(aircraft.ratingCount)],
    newest: [desc(aircraft.createdAt)],
  }[f.sort];

  const query = (tx: Tx) =>
    tx
      .select({
        id: aircraft.id,
        registration: aircraft.registration,
        manufacturer: aircraft.manufacturer,
        model: aircraft.model,
        category: aircraft.category,
        seats: aircraft.seats,
        pricePerHour: aircraft.pricePerHour,
        currency: aircraft.currency,
        priceBasis: aircraft.priceBasis,
        ratingAvg: aircraft.ratingAvg,
        ratingCount: aircraft.ratingCount,
        featured: aircraft.featured,
        airportIdent: airports.ident,
        airportCode: sql<string>`coalesce(${airports.icaoCode}, ${airports.ident})`,
        airportName: airports.name,
        latitude: airports.latitude,
        longitude: airports.longitude,
        municipality: airports.municipality,
        distanceKm: distance,
        cover: sql<string | null>`(
          select ${aircraftPhotos.storageKey} from ${aircraftPhotos}
          where ${aircraftPhotos.aircraftId} = ${aircraft.id}
          order by ${aircraftPhotos.sortOrder}, ${aircraftPhotos.createdAt} limit 1)`,
      })
      .from(aircraft)
      .innerJoin(airports, eq(airports.ident, aircraft.homeAirportIdent))
      .where(and(...where))
      // Featured aircraft (SUB-10, labelled in the results) come first, then the chosen order.
      .orderBy(desc(aircraft.featured), ...order)
      .limit(MAX_RESULTS);

  const rows = viewerId ? await asUser(viewerId, query) : await asAnon(query);
  const results = rows.map(({ cover, distanceKm, ...r }) => ({
    ...r,
    distanceKm: distanceKm === null ? null : Math.round(Number(distanceKm)),
    coverUrl: photoUrl(cover),
  }));
  return { origin, originCoords, period, timeZone, results };
}
