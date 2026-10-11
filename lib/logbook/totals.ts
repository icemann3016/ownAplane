import type { LogbookEntry } from "@/lib/db/schema";

// Column totals of logbook entries (LOG-1). Pure.

export const TOTAL_COLUMNS = [
  "seMinutes",
  "meMinutes",
  "mpMinutes",
  "totalMinutes",
  "landingsDay",
  "landingsNight",
  "nightMinutes",
  "ifrMinutes",
  "picMinutes",
  "copilotMinutes",
  "dualMinutes",
  "instructorMinutes",
  "fstdMinutes",
] as const;

export type TotalColumn = (typeof TOTAL_COLUMNS)[number];
export type Totals = Record<TotalColumn, number>;

/** Sum of the columns over the given entries. */
export function sumEntries(entries: Pick<LogbookEntry, TotalColumn>[]): Totals {
  const totals = Object.fromEntries(TOTAL_COLUMNS.map((c) => [c, 0])) as Totals;
  for (const e of entries) for (const c of TOTAL_COLUMNS) totals[c] += e[c] ?? 0;
  return totals;
}
