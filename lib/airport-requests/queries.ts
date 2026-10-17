import "server-only";

import { and, asc, desc, eq, gte, inArray, isNotNull, lt, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { asUser } from "@/lib/db/rls";
import {
  airportClosures,
  airportHours,
  airportOperators,
  airportRequestItems,
  airportRequests,
  airports,
  profiles,
} from "@/lib/db/schema";

// Reading requests to airfields (APT-2…6) with the user's own rights: the pilot sees theirs,
// the airfield's team its airfield's (RLS).

const fromAirport = alias(airports, "from_airport");
const toAirport = alias(airports, "to_airport");
const answerer = alias(profiles, "answerer");

const airportPlace = {
  ident: airports.ident,
  icaoCode: airports.icaoCode,
  name: airports.name,
  country: airports.country,
};
const fromPlace = {
  ident: fromAirport.ident,
  icaoCode: fromAirport.icaoCode,
  name: fromAirport.name,
  country: fromAirport.country,
};
const toPlace = {
  ident: toAirport.ident,
  icaoCode: toAirport.icaoCode,
  name: toAirport.name,
  country: toAirport.country,
};

/** One request with everything its page shows; null when the user may not see it. */
export async function getAirportRequest(userId: string, id: string) {
  return asUser(userId, async (tx) => {
    const [row] = await tx
      .select({
        request: airportRequests,
        airport: { ...airportPlace, timezone: airports.timezone },
        operator: {
          pprRequired: airportOperators.pprRequired,
          pprNoticeHours: airportOperators.pprNoticeHours,
          phone: airportOperators.phone,
          email: airportOperators.email,
        },
        from: fromPlace,
        to: toPlace,
        pilot: profiles.displayName,
        answeredBy: answerer.displayName,
        role: sql<
          "manager" | "staff" | null
        >`public.airport_role_of(${airportRequests.airportIdent})`,
      })
      .from(airportRequests)
      .innerJoin(airports, eq(airports.ident, airportRequests.airportIdent))
      .innerJoin(airportOperators, eq(airportOperators.airportIdent, airportRequests.airportIdent))
      .leftJoin(fromAirport, eq(fromAirport.ident, airportRequests.fromIdent))
      .leftJoin(toAirport, eq(toAirport.ident, airportRequests.toIdent))
      .leftJoin(profiles, eq(profiles.id, airportRequests.pilotId))
      .leftJoin(answerer, eq(answerer.id, airportRequests.answeredBy))
      .where(eq(airportRequests.id, id));
    if (!row) return null;
    const ident = row.request.airportIdent;
    const [items, hours, closures] = await Promise.all([
      tx
        .select()
        .from(airportRequestItems)
        .where(eq(airportRequestItems.requestId, id))
        .orderBy(
          asc(airportRequestItems.category),
          asc(airportRequestItems.fuelType),
          asc(airportRequestItems.label),
        ),
      tx.select().from(airportHours).where(eq(airportHours.airportIdent, ident)),
      tx.select().from(airportClosures).where(eq(airportClosures.airportIdent, ident)),
    ]);
    return { ...row, items, hours, closures };
  });
}

export type AirportRequestView = NonNullable<Awaited<ReturnType<typeof getAirportRequest>>>;

/** The pilot's requests, the latest trip first. */
export async function myAirportRequests(userId: string) {
  return asUser(userId, (tx) =>
    tx
      .select({
        id: airportRequests.id,
        status: airportRequests.status,
        autoConfirmed: airportRequests.autoConfirmed,
        registration: airportRequests.registration,
        arrivalAt: airportRequests.arrivalAt,
        departureAt: airportRequests.departureAt,
        airport: airportPlace,
      })
      .from(airportRequests)
      .innerJoin(airports, eq(airports.ident, airportRequests.airportIdent))
      .where(eq(airportRequests.pilotId, userId))
      .orderBy(desc(sql`coalesce(${airportRequests.arrivalAt}, ${airportRequests.departureAt})`))
      .limit(200),
  );
}

export type MyAirportRequest = Awaited<ReturnType<typeof myAirportRequests>>[number];

/**
 * An airfield's movements between `from` and `to` (UTC) for its team: requests arriving or
 * departing then, or on the ground meanwhile, with the services asked for. Cancelled ones are
 * left out.
 */
export async function airportMovements(userId: string, ident: string, from: Date, to: Date) {
  return asUser(userId, async (tx) => {
    const rows = await tx
      .select({
        request: airportRequests,
        from: fromPlace,
        to: toPlace,
        pilot: profiles.displayName,
      })
      .from(airportRequests)
      .leftJoin(fromAirport, eq(fromAirport.ident, airportRequests.fromIdent))
      .leftJoin(toAirport, eq(toAirport.ident, airportRequests.toIdent))
      .leftJoin(profiles, eq(profiles.id, airportRequests.pilotId))
      .where(
        and(
          eq(airportRequests.airportIdent, ident),
          ne(airportRequests.status, "cancelled"),
          or(
            and(gte(airportRequests.arrivalAt, from), lt(airportRequests.arrivalAt, to)),
            and(gte(airportRequests.departureAt, from), lt(airportRequests.departureAt, to)),
            and(
              isNotNull(airportRequests.departureAt),
              lt(airportRequests.arrivalAt, to),
              sql`${airportRequests.departureAt} > ${from.toISOString()}::timestamptz`,
            ),
          ),
        ),
      )
      .orderBy(asc(sql`coalesce(${airportRequests.arrivalAt}, ${airportRequests.departureAt})`));
    const ids = rows.map((r) => r.request.id);
    const items = ids.length
      ? await tx
          .select()
          .from(airportRequestItems)
          .where(inArray(airportRequestItems.requestId, ids))
          .orderBy(asc(airportRequestItems.category))
      : [];
    return rows.map((r) => ({
      ...r,
      items: items.filter((i) => i.requestId === r.request.id),
    }));
  });
}

export type Movement = Awaited<ReturnType<typeof airportMovements>>[number];

/** Today's arrivals, departures and requests waiting for an answer, per airfield of the team. */
export async function airfieldToday(userId: string, idents: string[], now = new Date()) {
  if (!idents.length)
    return new Map<string, { arrivals: number; departures: number; open: number }>();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 86_400_000);
  const [s0, s1, at] = [start, end, now].map((d) => sql`${d.toISOString()}::timestamptz`);
  const rows = await asUser(userId, (tx) =>
    tx
      .select({
        ident: airportRequests.airportIdent,
        arrivals: sql<number>`count(*) filter (where ${airportRequests.arrivalAt} >= ${s0}
          and ${airportRequests.arrivalAt} < ${s1} and ${airportRequests.status} <> 'declined')::int`,
        departures: sql<number>`count(*) filter (where ${airportRequests.departureAt} >= ${s0}
          and ${airportRequests.departureAt} < ${s1} and ${airportRequests.status} <> 'declined')::int`,
        open: sql<number>`count(*) filter (where ${airportRequests.status} = 'pending'
          and coalesce(${airportRequests.departureAt}, ${airportRequests.arrivalAt}) > ${at})::int`,
      })
      .from(airportRequests)
      .where(
        and(inArray(airportRequests.airportIdent, idents), ne(airportRequests.status, "cancelled")),
      )
      .groupBy(airportRequests.airportIdent),
  );
  return new Map(rows.map(({ ident, ...counts }) => [ident, counts]));
}
