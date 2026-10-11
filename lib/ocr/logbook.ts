import { z } from "zod";

import { parseDuration } from "@/lib/logbook/duration";
import { sumEntries, TOTAL_COLUMNS, type Totals } from "@/lib/logbook/totals";
import type { LogbookValues } from "@/lib/validation/logbook";

// Reading a two-page spread of a paper EASA logbook (LOG-6): one flight runs across the left and
// the right page on the same line. The AI joins both halves by line and copies the totals written
// at the bottom; here the lines become draft values and are checked against those totals. Pure
// (the reading itself is in logbook-read.ts).

const time = z.string().nullable().describe('Hours:minutes as "H:MM", e.g. "1:25"');
const text = z.string().nullable();
const count = z.number().int().nullable();

const line = z.object({
  line: z.number().int().describe("Line number on the page, from the top, starting at 1"),
  date: z.iso.date().nullable(),
  departurePlace: text,
  departureTime: z.string().nullable().describe('UTC "HH:MM"'),
  arrivalPlace: text,
  arrivalTime: z.string().nullable().describe('UTC "HH:MM"'),
  aircraftType: text,
  registration: text,
  seTime: time,
  meTime: time,
  mpTime: time,
  totalTime: time,
  picName: text,
  landingsDay: count,
  landingsNight: count,
  nightTime: time,
  ifrTime: time,
  picTime: time,
  copilotTime: time,
  dualTime: time,
  instructorTime: time,
  fstdType: text,
  fstdTime: time,
  remarks: text,
});

const pageTotals = z
  .object({
    seTime: time,
    meTime: time,
    mpTime: time,
    totalTime: time,
    landingsDay: count,
    landingsNight: count,
    nightTime: time,
    ifrTime: time,
    picTime: time,
    copilotTime: time,
    dualTime: time,
    instructorTime: time,
    fstdTime: time,
  })
  .nullable()
  .describe('The "total this page" row as written, or null');

export const spreadScan = z.object({
  isLogbook: z.boolean().describe("Is this a pilot logbook page at all?"),
  lines: z.array(line).max(40),
  totalThisPage: pageTotals,
});

export type SpreadScan = z.infer<typeof spreadScan>;

export const SPREAD_TASK = {
  tool: "record_logbook_spread",
  description: "Record the lines and the page totals of a pilot logbook spread.",
  schema: spreadScan,
  maxTokens: 16000,
  instructions: [
    "These are the two facing pages of a paper pilot logbook in the EASA format (AMC1 FCL.050),",
    "as two images (left page, right page) or one photo of both. Each flight is ONE line that runs",
    "across both pages: the left page has date, departure and arrival (place, time), aircraft",
    "type and registration, single-pilot time SE/ME, multi-pilot time and total time of flight;",
    "the right page has the name of the PIC, landings day/night, night and IFR time, pilot",
    "function time (PIC, co-pilot, dual, instructor), FSTD session (date, type, time) and remarks.",
    "Join the two halves of each line by its position (line number from the top). Skip empty",
    "lines and the total rows. Copy times as H:MM (a time written in separate hour and minute",
    "columns, like '1 | 25', is 1:25). Dates as YYYY-MM-DD: if only day and month are written,",
    "take the year from the page; if you can't tell, use null. totalThisPage: the row labelled",
    "'total this page' (not 'total from previous pages' or 'total time').",
  ].join(" "),
};

const minutes = (v: string | null) => {
  const n = v === null ? null : parseDuration(v);
  return n === null || Number.isNaN(n) ? null : n;
};
const clock = (v: string | null) => {
  const m = v?.trim().match(/^(\d{1,2})[:.h]?(\d{2})$/);
  if (!m) return null;
  const [h, min] = [Number(m[1]), Number(m[2])];
  return h < 24 && min < 60
    ? `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`
    : null;
};
const clip = (v: string | null, max: number) => v?.trim().slice(0, max) || null;
const landings = (v: number | null) => (v === null || v < 0 || v > 99 ? null : v);

/** One line read → draft values (null where unreadable), or null without a date. */
export function lineValues(l: SpreadScan["lines"][number], today: string): LogbookValues | null {
  if (!l.date || l.date > today || l.date < "1903-01-01") return null;
  const fstdOnly = !l.departurePlace && !l.arrivalPlace && l.fstdTime && !l.totalTime;
  const values: LogbookValues = {
    kind: fstdOnly ? "fstd" : "flight",
    date: l.date,
    departurePlace: clip(l.departurePlace, 60),
    departureTime: clock(l.departureTime),
    arrivalPlace: clip(l.arrivalPlace, 60),
    arrivalTime: clock(l.arrivalTime),
    aircraftType: clip(l.aircraftType, 60),
    registration: clip(l.registration, 20),
    seMinutes: minutes(l.seTime),
    meMinutes: minutes(l.meTime),
    mpMinutes: minutes(l.mpTime),
    totalMinutes: minutes(l.totalTime),
    picName: clip(l.picName, 100),
    landingsDay: landings(l.landingsDay),
    landingsNight: landings(l.landingsNight),
    nightMinutes: minutes(l.nightTime),
    ifrMinutes: minutes(l.ifrTime),
    picMinutes: minutes(l.picTime),
    copilotMinutes: minutes(l.copilotTime),
    dualMinutes: minutes(l.dualTime),
    instructorMinutes: minutes(l.instructorTime),
    fstdType: clip(l.fstdType, 60),
    fstdMinutes: minutes(l.fstdTime),
    remarks: clip(l.remarks, 1000),
  };
  // A flight can't last more than a day: an unreadable total is left for the pilot.
  if ((values.totalMinutes ?? 0) > 1440) values.totalMinutes = null;
  if ((values.fstdMinutes ?? 0) > 1440) values.fstdMinutes = null;
  return values;
}

const TOTAL_FIELDS: Record<string, keyof NonNullable<SpreadScan["totalThisPage"]>> = {
  seMinutes: "seTime",
  meMinutes: "meTime",
  mpMinutes: "mpTime",
  totalMinutes: "totalTime",
  landingsDay: "landingsDay",
  landingsNight: "landingsNight",
  nightMinutes: "nightTime",
  ifrMinutes: "ifrTime",
  picMinutes: "picTime",
  copilotMinutes: "copilotTime",
  dualMinutes: "dualTime",
  instructorMinutes: "instructorTime",
  fstdMinutes: "fstdTime",
};

/** "Total this page" as written, per column (only what was read). */
export function writtenTotals(t: SpreadScan["totalThisPage"]): Partial<Totals> | null {
  if (!t) return null;
  const out: Partial<Totals> = {};
  for (const column of TOTAL_COLUMNS) {
    const v = t[TOTAL_FIELDS[column]!];
    const n = typeof v === "number" ? v : minutes(v);
    if (n !== null) out[column] = n;
  }
  return Object.keys(out).length ? out : null;
}

/** Columns where the lines read don't add up to the total written on the page. */
export function totalDifferences(lines: LogbookValues[], written: Partial<Totals> | null) {
  if (!written) return [];
  const sums = sumEntries(lines);
  return TOTAL_COLUMNS.filter((c) => written[c] !== undefined && written[c] !== sums[c]).map(
    (column) => ({ column, written: written[column]!, lines: sums[column] }),
  );
}
