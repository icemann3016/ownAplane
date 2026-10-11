// Consistency hints for a logbook entry (LOG-1): never blocks, the pilot decides. Pure.

export type EntryTimes = {
  kind: string;
  seMinutes: number | null;
  meMinutes: number | null;
  mpMinutes: number | null;
  totalMinutes: number | null;
  nightMinutes: number | null;
  ifrMinutes: number | null;
  picMinutes: number | null;
  copilotMinutes: number | null;
  dualMinutes: number | null;
  instructorMinutes: number | null;
  landingsDay: number | null;
  landingsNight: number | null;
};

export type EntryHint =
  | "split_not_total" // single-pilot SE + ME + multi-pilot ≠ total time
  | "no_function_time" // no PIC, co-pilot, dual or instructor time
  | "function_over_total" // PIC + co-pilot + dual > total (instructor time is also PIC time)
  | "no_landings"
  | "night_landings_without_night";

const n = (v: number | null) => v ?? 0;

export function entryHints(e: EntryTimes): EntryHint[] {
  if (e.kind !== "flight" || e.totalMinutes == null) return [];
  const hints: EntryHint[] = [];
  const split = n(e.seMinutes) + n(e.meMinutes) + n(e.mpMinutes);
  if (split !== e.totalMinutes) hints.push("split_not_total");
  const functions = n(e.picMinutes) + n(e.copilotMinutes) + n(e.dualMinutes);
  if (functions + n(e.instructorMinutes) === 0) hints.push("no_function_time");
  else if (functions > e.totalMinutes) hints.push("function_over_total");
  if (n(e.landingsDay) + n(e.landingsNight) === 0) hints.push("no_landings");
  if (n(e.landingsNight) > 0 && n(e.nightMinutes) === 0) hints.push("night_landings_without_night");
  return hints;
}
