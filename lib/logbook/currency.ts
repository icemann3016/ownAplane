import type { LogbookEntry } from "@/lib/db/schema";

// Currency from the pilot's certified logbook (Pilot Plus): what EASA asks of private pilots in
// aeroplanes, worked out from the flights they logged. A guide, not a legal check: the pilot
// stays responsible (AMC1 FCL.050). Single-engine (SE) flights count for the SEP class. Pure.
//
// - FCL.060(b)(1): passengers need 3 take-offs and landings in the class in the last 90 days,
//   1 of them at night to carry passengers at night (unless the pilot holds an IR).
// - FCL.740.A(b)(1)(ii): an SEP rating is revalidated by experience with, in the 12 months before
//   it expires, 12 h in the class incl. 6 h as PIC, 12 take-offs and landings, and a refresher
//   flight of at least 1 h with an instructor.
// - FCL.140.A: LAPL(A) holders need, in the last 24 months, 12 h as PIC incl. 12 take-offs and
//   landings, and a refresher flight of at least 1 h with an instructor.

export type CurrencyEntry = Pick<
  LogbookEntry,
  | "date"
  | "kind"
  | "seMinutes"
  | "picMinutes"
  | "dualMinutes"
  | "totalMinutes"
  | "landingsDay"
  | "landingsNight"
>;

const DAY = 86_400_000;
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const monthsBefore = (date: string, months: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
};

const singleEngine = (e: CurrencyEntry) => e.kind === "flight" && (e.seMinutes ?? 0) > 0;
const landings = (e: CurrencyEntry) => (e.landingsDay ?? 0) + (e.landingsNight ?? 0);
const sum = (entries: CurrencyEntry[], f: (e: CurrencyEntry) => number) =>
  entries.reduce((n, e) => n + f(e), 0);

export type Recency = {
  /** Current today, and until when (the last day), if current. */
  current: boolean;
  until: string | null;
  /** Landings counted in the last 90 days. */
  count: number;
};

/** Valid while the `need`-th most recent landing is at most 90 days old. */
function recencyFrom(
  flights: CurrencyEntry[],
  perFlight: (e: CurrencyEntry) => number,
  need: number,
  today: string,
): Recency {
  const since = addDays(today, -90);
  const dated = flights
    .filter((e) => perFlight(e) > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  let total = 0;
  let until: string | null = null;
  for (const e of dated) {
    total += perFlight(e);
    if (total >= need) {
      until = addDays(e.date, 90);
      break;
    }
  }
  const count = sum(
    dated.filter((e) => e.date > since),
    perFlight,
  );
  const current = until !== null && until >= today;
  return { current, until: current ? until : null, count };
}

/** Passenger recency in the SEP class, by day and at night (FCL.060). */
export function passengerRecency(entries: CurrencyEntry[], today: string) {
  const se = entries.filter(singleEngine);
  return {
    day: recencyFrom(se, landings, 3, today),
    night: recencyFrom(se, (e) => e.landingsNight ?? 0, 1, today),
  };
}

export type Requirement = { key: string; done: number; need: number; met: boolean };

/** Experience towards a target in a window (minutes for times). */
function experience(window: CurrencyEntry[], pic: boolean, hoursKey: string, needMinutes: number) {
  const rows: Requirement[] = [];
  const add = (key: string, done: number, need: number) =>
    rows.push({ key, done, need, met: done >= need });
  if (!pic)
    add(
      hoursKey,
      sum(window, (e) => e.seMinutes ?? 0),
      needMinutes,
    );
  add(
    "pic",
    sum(window, (e) => Math.min(e.picMinutes ?? 0, e.seMinutes ?? 0)),
    pic ? 720 : 360,
  );
  add("landings", sum(window, landings), 12);
  const refresher = window.some((e) => (e.dualMinutes ?? 0) >= 60);
  add("refresher", refresher ? 1 : 0, 1);
  return rows;
}

/**
 * SEP class rating revalidation by experience: the 12 months before `expiresOn` (or, without
 * it, the last 12 months). Flights after the expiry don't count.
 */
export function sepRevalidation(entries: CurrencyEntry[], expiresOn: string | null, today: string) {
  const end = expiresOn ?? today;
  const start = monthsBefore(end, 12);
  const window = entries.filter((e) => singleEngine(e) && e.date > start && e.date <= end);
  const requirements = experience(window, false, "hours", 720);
  return {
    from: start,
    to: end,
    expired: expiresOn !== null && expiresOn < today,
    met: requirements.every((r) => r.met),
    requirements,
  };
}

/** LAPL(A) recency over the last 24 months (FCL.140.A). */
export function laplRecency(entries: CurrencyEntry[], today: string) {
  const start = monthsBefore(today, 24);
  const window = entries.filter((e) => singleEngine(e) && e.date > start && e.date <= today);
  const requirements = experience(window, true, "hours", 0);
  return { from: start, to: today, met: requirements.every((r) => r.met), requirements };
}
