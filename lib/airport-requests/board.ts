// The airfield's movements board (APT-6): a day, a week (Monday first) or a month, in UTC like
// every time in the app, and the arrivals and departures in it day by day. Pure.

export const BOARD_VIEWS = ["day", "week", "month"] as const;
export type BoardView = (typeof BOARD_VIEWS)[number];

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (day: string) => new Date(`${day}T00:00:00Z`);

/** The period shown for a view around `day` ("2026-10-14"), with the days it has. */
export function boardRange(view: BoardView, day: string) {
  const d = parse(day);
  let from = d;
  let to = new Date(d.getTime() + DAY);
  if (view === "week") {
    from = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY);
    to = new Date(from.getTime() + 7 * DAY);
  } else if (view === "month") {
    from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  }
  const days = Array.from({ length: Math.round((+to - +from) / DAY) }, (_, i) =>
    iso(new Date(from.getTime() + i * DAY)),
  );
  return { from, to, days };
}

/** The day to show for the previous or next period. */
export function shiftDay(view: BoardView, day: string, step: -1 | 1): string {
  const d = parse(day);
  if (view === "month") {
    return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + step, 1)));
  }
  return iso(new Date(d.getTime() + step * (view === "week" ? 7 : 1) * DAY));
}

export type BoardEvent<T> = { kind: "arrival" | "departure"; at: Date; item: T };

/**
 * Each day's arrivals and departures in time order, and what is on the ground that day (arrived
 * earlier, leaving later).
 */
export function boardDays<T extends { arrivalAt: Date | null; departureAt: Date | null }>(
  days: string[],
  items: T[],
) {
  return days.map((day) => {
    const start = parse(day).getTime();
    const end = start + DAY;
    const within = (d: Date | null): d is Date => !!d && +d >= start && +d < end;
    const events: BoardEvent<T>[] = [];
    for (const item of items) {
      if (within(item.arrivalAt)) events.push({ kind: "arrival", at: item.arrivalAt, item });
      if (within(item.departureAt)) events.push({ kind: "departure", at: item.departureAt, item });
    }
    events.sort((a, b) => +a.at - +b.at);
    const onGround = items.filter(
      (i) => i.arrivalAt && i.departureAt && +i.arrivalAt < start && +i.departureAt >= end,
    );
    return { day, events, onGround };
  });
}
