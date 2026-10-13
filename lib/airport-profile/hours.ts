import { addDays, zonedDay, zonedToUtc } from "@/lib/domain/time";

// Opening hours (APT-1): entered in the airfield's local time once a week, shown to pilots in UTC
// for each date, so summer time is handled without anyone editing them twice a year. Pure.

export type WeeklyHours = { weekday: number; opens: string; closes: string };
export type Closure = { startsOn: string; endsOn: string; note: string | null };
export type DayHours = {
  /** The airfield's local date. */
  day: string;
  weekday: number;
  /** Closed that day (with the closure's note), or null. */
  closure: Closure | null;
  /** Open periods in UTC; empty = closed. */
  ranges: { from: Date; to: Date }[];
};

/** ISO weekday (1 = Monday … 7 = Sunday) of a date "2026-10-12". */
export function isoWeekday(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay() || 7;
}

const hhmm = (time: string) => time.slice(0, 5);

/** The airfield's opening on its local `day` in UTC; closing "24:00" is the next midnight. */
function rangeOn(day: string, h: WeeklyHours, timeZone: string) {
  const from = zonedToUtc(`${day}T${hhmm(h.opens)}`, timeZone);
  const to = hhmm(h.closes).startsWith("24")
    ? zonedToUtc(`${addDays(day, 1)}T00:00`, timeZone)
    : zonedToUtc(`${day}T${hhmm(h.closes)}`, timeZone);
  return from && to && to > from ? { from, to } : null;
}

/** The next `days` local days from `now`, each with its opening hours in UTC or its closure. */
export function upcomingHours(
  hours: WeeklyHours[],
  closures: Closure[],
  timeZone: string,
  now = new Date(),
  days = 7,
): DayHours[] {
  const first = zonedDay(now, timeZone);
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(first, i);
    const weekday = isoWeekday(day);
    const closure = closures.find((c) => c.startsOn <= day && day <= c.endsOn) ?? null;
    const ranges = closure
      ? []
      : hours
          .filter((h) => h.weekday === weekday)
          .sort((a, b) => a.opens.localeCompare(b.opens))
          .flatMap((h) => {
            const range = rangeOn(day, h, timeZone);
            return range ? [range] : [];
          });
    return { day, weekday, closure, ranges };
  });
}
