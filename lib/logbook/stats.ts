import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { asUser } from "@/lib/db/rls";
import { bookings, flightLogs, type LogbookEntry, logbookEntries } from "@/lib/db/schema";

// Flying statistics for the pilot (Pilot Plus): hours and landings per month over the last
// year, hours per aircraft type and per function, from certified entries; and rentals through
// ownAplane with what was due (payments happen outside the app).

type StatsEntry = Pick<
  LogbookEntry,
  | "date"
  | "kind"
  | "aircraftType"
  | "totalMinutes"
  | "picMinutes"
  | "dualMinutes"
  | "instructorMinutes"
  | "copilotMinutes"
  | "landingsDay"
  | "landingsNight"
>;

/** The last 12 UTC months, oldest first, with flight minutes and landings. Pure. */
export function byMonth(entries: StatsEntry[], today: string) {
  const months: string[] = [];
  const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  for (let i = 11; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    months.push(m.toISOString().slice(0, 7));
  }
  const flights = entries.filter((e) => e.kind === "flight");
  return months.map((month) => {
    const these = flights.filter((e) => e.date.startsWith(month));
    return {
      month,
      minutes: these.reduce((n, e) => n + (e.totalMinutes ?? 0), 0),
      landings: these.reduce((n, e) => n + (e.landingsDay ?? 0) + (e.landingsNight ?? 0), 0),
    };
  });
}

/** Minutes per aircraft type, most flown first. Pure. */
export function byType(entries: StatsEntry[], limit = 10) {
  const types = new Map<string, number>();
  for (const e of entries) {
    if (e.kind !== "flight" || !e.aircraftType || !e.totalMinutes) continue;
    const key = e.aircraftType.toUpperCase();
    types.set(key, (types.get(key) ?? 0) + e.totalMinutes);
  }
  return [...types.entries()]
    .map(([aircraftType, minutes]) => ({ aircraftType, minutes }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, limit);
}

/** Minutes per pilot function. Pure. */
export function byFunction(entries: StatsEntry[]) {
  const total = (f: (e: StatsEntry) => number | null) =>
    entries.reduce((n, e) => n + (f(e) ?? 0), 0);
  return {
    pic: total((e) => e.picMinutes),
    dual: total((e) => e.dualMinutes),
    instructor: total((e) => e.instructorMinutes),
    copilot: total((e) => e.copilotMinutes),
  };
}

export async function getFlyingStats(
  userId: string,
  today = new Date().toISOString().slice(0, 10),
) {
  const { entries, rentals } = await asUser(userId, async (tx) => ({
    entries: await tx
      .select()
      .from(logbookEntries)
      .where(and(eq(logbookEntries.pilotId, userId), eq(logbookEntries.status, "certified"))),
    rentals: await tx
      .select({
        currency: bookings.currency,
        count: sql<number>`count(*)`.mapWith(Number),
        minutes: sql<number>`coalesce(sum(${flightLogs.flownMinutes}), 0)`.mapWith(Number),
        due: sql<number>`coalesce(sum(${flightLogs.amountDue}), 0)`.mapWith(Number),
      })
      .from(flightLogs)
      .innerJoin(bookings, eq(bookings.id, flightLogs.bookingId))
      .where(and(eq(bookings.pilotId, userId), eq(flightLogs.status, "confirmed")))
      .groupBy(bookings.currency),
  }));
  return {
    months: byMonth(entries, today),
    types: byType(entries),
    functions: byFunction(entries),
    rentals,
  };
}

export type FlyingStats = Awaited<ReturnType<typeof getFlyingStats>>;
