import "server-only";

import { and, desc, eq, lt, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  type CalendarEntryKind,
  type FlightLog,
  type MeterGapReason,
  meterReadings,
} from "@/lib/db/schema";
import { type MeterFinding, type MeterPoint, meterFindings } from "@/lib/domain/meter-gap";

export type BetweenEntry = {
  kind: CalendarEntryKind;
  from: Date;
  to: Date;
  /** For busy times from another system: the connection's name. */
  source: string | null;
};

export type MeterCheck = {
  findings: MeterFinding[];
  /** Owner only: what the aircraft's calendar shows between the known reading and check-out. */
  between: BetweenEntry[];
  reason: MeterGapReason | null;
};

/** Ends of the aircraft's earlier submitted or confirmed rentals (latest leg readings). */
async function earlierRentals(aircraftId: string, log: FlightLog): Promise<MeterPoint[]> {
  const rows = (await getDb().execute(sql`
    select max(g.block_on) as at, max(g.hobbs_end) as hobbs, max(g.tach_end) as tach
    from public.flight_logs l
    join public.bookings b on b.id = l.booking_id
    join public.flight_legs g on g.flight_log_id = l.id
    where b.aircraft_id = ${aircraftId} and l.id <> ${log.id}
      and l.status in ('submitted', 'confirmed') and l.checked_out_at < ${log.checkedOutAt.toISOString()}::timestamptz
    group by l.id
    order by l.checked_out_at desc
    limit 5`)) as unknown as { at: string; hobbs: string | null; tach: string | null }[];
  return rows.map((r) => ({
    at: new Date(r.at),
    hobbs: r.hobbs === null ? null : Number(r.hobbs),
    tach: r.tach === null ? null : Number(r.tach),
    source: "log",
  }));
}

async function ownerReadings(aircraftId: string, before: Date): Promise<MeterPoint[]> {
  const rows = await getDb()
    .select({ at: meterReadings.readAt, hobbs: meterReadings.hobbs, tach: meterReadings.tach })
    .from(meterReadings)
    .where(and(eq(meterReadings.aircraftId, aircraftId), lt(meterReadings.readAt, before)))
    .orderBy(desc(meterReadings.readAt))
    .limit(5);
  return rows.map((r) => ({ ...r, source: "reading" }));
}

/** Calendar entries of the aircraft between two times, other than this booking. */
async function entriesBetween(aircraftId: string, bookingId: string, from: Date, to: Date) {
  const rows = (await getDb().execute(sql`
    select e.kind, lower(e.period) as "from", upper(e.period) as "to", c.name as source
    from public.calendar_entries e
    left join public.calendar_connections c on c.id = e.connection_id
    where e.aircraft_id = ${aircraftId} and e.active
      and e.booking_id is distinct from ${bookingId}::uuid
      and e.period && tstzrange(${from.toISOString()}::timestamptz, ${to.toISOString()}::timestamptz)
    order by lower(e.period)
    limit 10`)) as unknown as {
    kind: CalendarEntryKind;
    from: string;
    to: string;
    source: string | null;
  }[];
  return rows.map((r) => ({ ...r, from: new Date(r.from), to: new Date(r.to) }));
}

/**
 * Meter continuity of a rental's flight log (BKG-7). Trusted read of the aircraft's other
 * rentals: call only after checking that the viewer is this booking's pilot or owner. The pilot
 * gets only start readings below the last known one (a typo), never what happened in between.
 */
export async function getMeterCheck(
  log: FlightLog,
  aircraftId: string,
  role: "pilot" | "owner",
): Promise<MeterCheck> {
  const start = { hobbs: log.hobbsStart, tach: log.tachStart };
  if (start.hobbs === null && start.tach === null) {
    return { findings: [], between: [], reason: log.meterGapReason };
  }
  const points = [
    ...(await earlierRentals(aircraftId, log)),
    ...(await ownerReadings(aircraftId, log.checkedOutAt)),
  ];
  const all = meterFindings(start, points, log.checkedOutAt);
  if (role === "pilot") {
    return { findings: all.filter((f) => f.type === "below"), between: [], reason: null };
  }
  const gaps = all.filter((f) => f.type === "gap");
  const since = gaps.length ? new Date(Math.min(...gaps.map((f) => f.knownAt.getTime()))) : null;
  const between = since
    ? await entriesBetween(aircraftId, log.bookingId, since, log.checkedOutAt)
    : [];
  return { findings: all, between, reason: log.meterGapReason };
}
