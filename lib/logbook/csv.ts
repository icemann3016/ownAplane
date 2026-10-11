import { toCsv } from "@/lib/csv";
import type { LogbookEntry } from "@/lib/db/schema";
import { formatDuration as d } from "./duration";

// The logbook as CSV in the EASA column order (LOG-5): durations as h:mm, times UTC. Every
// certified and struck-through entry, with its status. Column names stay English (data file).

const HEADER = [
  "kind",
  "status",
  "date",
  "departure_place",
  "departure_time_utc",
  "arrival_place",
  "arrival_time_utc",
  "aircraft_type",
  "registration",
  "single_pilot_se",
  "single_pilot_me",
  "multi_pilot",
  "total_time",
  "pic_name",
  "landings_day",
  "landings_night",
  "night",
  "ifr",
  "pic",
  "co_pilot",
  "dual",
  "instructor",
  "fstd_type",
  "fstd_time",
  "remarks",
  "struck_through_because",
  "certified_at_utc",
];

export function logbookCsv(entries: LogbookEntry[]): string {
  return toCsv(
    HEADER,
    entries.map((e) => [
      e.kind,
      e.status,
      e.date,
      e.departurePlace,
      e.departureTime?.slice(0, 5),
      e.arrivalPlace,
      e.arrivalTime?.slice(0, 5),
      e.aircraftType,
      e.registration,
      d(e.seMinutes),
      d(e.meMinutes),
      d(e.mpMinutes),
      d(e.totalMinutes),
      e.picName,
      e.landingsDay,
      e.landingsNight,
      d(e.nightMinutes),
      d(e.ifrMinutes),
      d(e.picMinutes),
      d(e.copilotMinutes),
      d(e.dualMinutes),
      d(e.instructorMinutes),
      e.fstdType,
      d(e.fstdMinutes),
      e.remarks,
      e.voidReason,
      e.certifiedAt?.toISOString(),
    ]),
  );
}
