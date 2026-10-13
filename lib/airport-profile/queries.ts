import "server-only";

import { asc, eq } from "drizzle-orm";

import { asAnon } from "@/lib/db/rls";
import {
  airportClosures,
  airportFees,
  airportFrequencies,
  airportHours,
  airportOperators,
  airportRunways,
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
    const fees = await tx
      .select()
      .from(airportFees)
      .where(eq(airportFees.airportIdent, ident))
      .orderBy(asc(airportFees.kind), asc(airportFees.maxMtomKg), asc(airportFees.amount));
    return { ...row, runways, frequencies, hours, closures, fees };
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
