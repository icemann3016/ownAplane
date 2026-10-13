import "server-only";

import { asc, eq, sql } from "drizzle-orm";

import { asAnon } from "@/lib/db/rls";
import {
  airportClosures,
  airportFrequencies,
  airportHours,
  airportOperators,
  airportRunways,
  airportServices,
  airports,
} from "@/lib/db/schema";

// An airfield's public details (APT-1): only airfields with a verified team have a page. Read as
// an anonymous visitor (RLS: all public).

const airportColumns = {
  ident: airports.ident,
  icaoCode: airports.icaoCode,
  iataCode: airports.iataCode,
  name: airports.name,
  municipality: airports.municipality,
  country: airports.country,
  latitude: airports.latitude,
  longitude: airports.longitude,
  elevationFt: airports.elevationFt,
  timezone: airports.timezone,
};

type Tx = Parameters<Parameters<typeof asAnon>[0]>[0];

/** An airfield's services and prices: by kind (the list's order), then weight band and price. */
export function listServices(tx: Tx, ident: string) {
  return tx
    .select()
    .from(airportServices)
    .where(eq(airportServices.airportIdent, ident))
    .orderBy(
      asc(airportServices.category),
      asc(airportServices.fuelType),
      sql`${airportServices.maxMtomKg} asc nulls last`,
      asc(airportServices.label),
      asc(airportServices.price),
    );
}

/** An airfield on ownAplane with everything its page shows; null if it has no team. */
export async function getAirportProfile(ident: string) {
  return asAnon(async (tx) => {
    const [row] = await tx
      .select({ airport: airportColumns, profile: airportOperators })
      .from(airportOperators)
      .innerJoin(airports, eq(airports.ident, airportOperators.airportIdent))
      .where(eq(airportOperators.airportIdent, ident));
    if (!row) return null;
    const runways = await tx
      .select()
      .from(airportRunways)
      .where(eq(airportRunways.airportIdent, ident))
      .orderBy(asc(airportRunways.designator));
    const frequencies = await tx
      .select()
      .from(airportFrequencies)
      .where(eq(airportFrequencies.airportIdent, ident))
      .orderBy(asc(airportFrequencies.mhz));
    const hours = await tx
      .select()
      .from(airportHours)
      .where(eq(airportHours.airportIdent, ident))
      .orderBy(asc(airportHours.weekday), asc(airportHours.opens));
    const closures = await tx
      .select()
      .from(airportClosures)
      .where(eq(airportClosures.airportIdent, ident))
      .orderBy(asc(airportClosures.startsOn));
    const services = await listServices(tx, ident);
    return { ...row, runways, frequencies, hours, closures, services };
  });
}

export type AirportProfile = NonNullable<Awaited<ReturnType<typeof getAirportProfile>>>;

/** The airfields on ownAplane, by country and name. */
export async function listAirportsOnOwnAplane() {
  return asAnon((tx) =>
    tx
      .select({
        ident: airports.ident,
        icaoCode: airports.icaoCode,
        name: airports.name,
        municipality: airports.municipality,
        country: airports.country,
        pprRequired: airportOperators.pprRequired,
      })
      .from(airportOperators)
      .innerJoin(airports, eq(airports.ident, airportOperators.airportIdent))
      .orderBy(asc(airports.country), asc(airports.name)),
  );
}
