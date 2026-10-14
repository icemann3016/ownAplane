import { type Closure, upcomingHours, type WeeklyHours } from "@/lib/airport-profile/hours";

// Warnings on a request to an airfield (APT-3/4): shown to the pilot and the airfield, never a
// block: outside opening hours, on a closed day, less PPR notice than asked, or crossing a
// Schengen or EU customs border without asking for customs. Pure.

/** Schengen states (Bulgaria and Romania fully since 2025). */
const SCHENGEN = new Set(
  "AT BE BG CH CZ DE DK EE ES FI FR GR HR HU IS IT LI LT LU LV MT NL NO PL PT RO SE SI SK".split(
    " ",
  ),
);
/** The EU customs territory (EU members + Monaco); Norway, Switzerland, Iceland are outside. */
const EU_CUSTOMS = new Set(
  "AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MC MT NL PL PT RO SE SI SK".split(" "),
);

/** Whether a flight between two countries crosses a border control or customs boundary. */
export function needsBorderControl(a: string, b: string): boolean {
  return SCHENGEN.has(a) !== SCHENGEN.has(b) || EU_CUSTOMS.has(a) !== EU_CUSTOMS.has(b);
}

export type RequestWarning =
  | { kind: "closed"; at: "arrival" | "departure"; note: string | null }
  | { kind: "outside_hours"; at: "arrival" | "departure" }
  | { kind: "short_notice"; hours: number }
  | { kind: "customs" };

export function requestWarnings({
  arrivalAt,
  departureAt,
  airportCountry,
  fromCountry,
  toCountry,
  asksCustoms,
  pprRequired,
  pprNoticeHours,
  hours,
  closures,
  timeZone,
  sentAt,
}: {
  arrivalAt: Date | null;
  departureAt: Date | null;
  airportCountry: string;
  fromCountry: string | null;
  toCountry: string | null;
  asksCustoms: boolean;
  pprRequired: boolean;
  pprNoticeHours: number | null;
  hours: WeeklyHours[];
  closures: Closure[];
  timeZone: string;
  /** When the request was sent (notice is counted from then). */
  sentAt: Date;
}): RequestWarning[] {
  const warnings: RequestWarning[] = [];
  const moves = [
    ["arrival", arrivalAt],
    ["departure", departureAt],
  ] as const;
  for (const [at, time] of moves) {
    if (!time) continue;
    const [day] = upcomingHours(hours, closures, timeZone, time, 1);
    if (day?.closure) {
      warnings.push({ kind: "closed", at, note: day.closure.note });
    } else if (hours.length && !day?.ranges.some((r) => time >= r.from && time <= r.to)) {
      warnings.push({ kind: "outside_hours", at });
    }
  }
  const first = [arrivalAt, departureAt].filter((d): d is Date => !!d).sort((a, b) => +a - +b)[0];
  if (pprRequired && pprNoticeHours && first) {
    if (first.getTime() - sentAt.getTime() < pprNoticeHours * 3_600_000) {
      warnings.push({ kind: "short_notice", hours: pprNoticeHours });
    }
  }
  const crosses = [fromCountry, toCountry].some(
    (c) => c !== null && needsBorderControl(airportCountry, c),
  );
  if (crosses && !asksCustoms) warnings.push({ kind: "customs" });
  return warnings;
}
