import type { LogbookEntry } from "@/lib/db/schema";
import { formatDuration } from "@/lib/logbook/duration";

/** "2026-05-01 LBSF → LBPD, LZ-ABC, 1:10" (for lists and accessible names). */
export function entryLabel(
  e: Pick<
    LogbookEntry,
    | "kind"
    | "date"
    | "departurePlace"
    | "arrivalPlace"
    | "registration"
    | "totalMinutes"
    | "fstdType"
    | "fstdMinutes"
  >,
  kindName: string,
): string {
  if (e.kind === "flight") {
    const route = [e.departurePlace, e.arrivalPlace].filter(Boolean).join(" → ");
    return [e.date, route, e.registration, formatDuration(e.totalMinutes)]
      .filter(Boolean)
      .join(" · ");
  }
  if (e.kind === "fstd") {
    return [e.date, kindName, e.fstdType, formatDuration(e.fstdMinutes)]
      .filter(Boolean)
      .join(" · ");
  }
  return [e.date, kindName, formatDuration(e.totalMinutes)].filter(Boolean).join(" · ");
}

/** "08:05:00" → "08:05". */
export const clock = (time: string | null) => time?.slice(0, 5) ?? "";

/** Translation key (logbook.columns.*) of an entry field, for "missing: …" lists. */
export const FIELD_COLUMN: Record<string, string> = {
  departurePlace: "departure",
  arrivalPlace: "arrival",
  aircraftType: "type",
  registration: "registration",
  totalMinutes: "total",
  picName: "picName",
  fstdType: "fstdType",
  fstdMinutes: "fstdTime",
};

const DURATIONS = [
  "seMinutes",
  "meMinutes",
  "mpMinutes",
  "totalMinutes",
  "nightMinutes",
  "ifrMinutes",
  "picMinutes",
  "copilotMinutes",
  "dualMinutes",
  "instructorMinutes",
  "fstdMinutes",
] as const;

/** An entry as form values ("1:25", "08:05", "3"). */
export function entryFormValues(e: LogbookEntry): Record<string, string> {
  const values: Record<string, string> = {
    date: e.date,
    departurePlace: e.departurePlace ?? "",
    departureTime: clock(e.departureTime),
    arrivalPlace: e.arrivalPlace ?? "",
    arrivalTime: clock(e.arrivalTime),
    aircraftType: e.aircraftType ?? "",
    registration: e.registration ?? "",
    picName: e.picName ?? "",
    landingsDay: e.landingsDay == null ? "" : String(e.landingsDay),
    landingsNight: e.landingsNight == null ? "" : String(e.landingsNight),
    fstdType: e.fstdType ?? "",
    remarks: e.remarks ?? "",
  };
  for (const d of DURATIONS) values[d] = formatDuration(e[d]);
  return values;
}

/** Label keys (logbook.columns.*) of a totals column; two keys are joined ("Landings Day"). */
export const TOTAL_LABEL: Record<string, string[]> = {
  seMinutes: ["singlePilot", "se"],
  meMinutes: ["singlePilot", "me"],
  mpMinutes: ["mp"],
  totalMinutes: ["total"],
  landingsDay: ["landings", "day"],
  landingsNight: ["landings", "night"],
  nightMinutes: ["night"],
  ifrMinutes: ["ifr"],
  picMinutes: ["pic"],
  copilotMinutes: ["copilot"],
  dualMinutes: ["dual"],
  instructorMinutes: ["instructor"],
  fstdMinutes: ["fstd"],
};
