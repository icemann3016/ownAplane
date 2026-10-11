import "server-only";

import { z } from "zod";

import type { CalendarItem } from "@/lib/aircraft/calendar";
import type { getMeterReadings } from "@/lib/aircraft/meter-readings";
import type { getAircraftDefects } from "@/lib/bookings/defects";
import type { getAircraftRemarks } from "@/lib/bookings/remarks";
import { DEFECT_SEVERITIES } from "@/lib/validation/defect";
import { absoluteUrl } from "./dto";

// Day-to-day owner operations in the API (SRC-5, BKG-7, BKG-8, BKG-15): calendar blocks,
// defects, known items and meter readings — inputs, response shapes and DTOs.

const time = z.iso.datetime().describe("ISO 8601, UTC");
const iso = (d: Date | string) => new Date(d).toISOString();

// --- Inputs ---

export const calendarBlockBody = z
  .object({
    kind: z.enum(["owner_use", "maintenance", "unavailable"]),
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    note: z
      .string()
      .trim()
      .max(200)
      .transform((v) => v || null)
      .nullable()
      .default(null)
      .describe("Only the owner sees it"),
  })
  .transform((b) => ({ ...b, from: new Date(b.from), to: new Date(b.to) }))
  .refine((b) => b.to > b.from, { path: ["to"], error: "Must be after from." });

export const calendarWindowQuery = z
  .object({
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .transform((q) => {
    const from = q.from ? new Date(q.from) : new Date();
    const to = q.to ? new Date(q.to) : new Date(from.getTime() + 60 * 86_400_000);
    return { from, to };
  })
  .refine((q) => q.to > q.from && q.to.getTime() - q.from.getTime() <= 366 * 86_400_000, {
    path: ["to"],
    error: "After from, at most a year later.",
  });

export const defectBody = z.object({
  severity: z.enum(DEFECT_SEVERITIES).describe("unsafe: tell the owner at once, don't fly"),
  description: z.string().trim().min(1).max(2000),
  photoId: z.uuid().nullable().default(null).describe("From POST /api/v1/documents"),
});

export const resolveBody = z.object({
  note: z.string().trim().max(1000).default("").describe("What was done"),
});

export const knownItemBody = z.object({ state: z.enum(["known", "resolved"]) });

const meter = z.number().min(0).max(999999).nullable().default(null);

export const meterReadingBody = z
  .object({ readAt: z.iso.datetime({ offset: true }), hobbs: meter, tach: meter })
  .extend({
    note: z
      .string()
      .trim()
      .max(200)
      .transform((v) => v || null)
      .nullable()
      .default(null),
  })
  .refine((r) => r.hobbs !== null || r.tach !== null, {
    path: ["hobbs"],
    error: "Send Hobbs, tach or both.",
  })
  .transform((r) => ({ ...r, readAt: new Date(r.readAt) }));

// --- Responses ---

export const calendarEntry = z.object({
  id: z.uuid(),
  kind: z.enum(["booking", "owner_use", "maintenance", "unavailable"]),
  from: time,
  to: time,
  note: z.string().nullable(),
  bookingId: z.uuid().nullable(),
  bookingStatus: z.string().nullable(),
  pilotName: z.string().nullable(),
  source: z.string().nullable().describe("The connected system it came from (calendar sync)"),
});

export const defect = z.object({
  id: z.uuid(),
  bookingId: z.uuid().nullable(),
  severity: z.enum(DEFECT_SEVERITIES),
  description: z.string(),
  reportedBy: z.string().nullable(),
  photo: z.object({ id: z.uuid(), url: z.url() }).nullable(),
  createdAt: time,
  resolvedAt: time.nullable(),
  resolution: z.string().nullable(),
});

export const remark = z.object({
  id: z.uuid(),
  kind: z.enum(["aircraft", "weather", "airfield"]),
  airport: z.string().nullable(),
  body: z.string(),
  bookingId: z.uuid(),
  flownFrom: time,
  knownSince: time.nullable().describe("Shown to pilots of upcoming bookings while not resolved"),
  resolvedAt: time.nullable(),
  createdAt: time,
});

export const meterReading = z.object({
  id: z.uuid(),
  readAt: time,
  hobbs: z.number().nullable(),
  tach: z.number().nullable(),
  note: z.string().nullable(),
});

// --- DTOs ---

export function calendarEntryDto(e: CalendarItem): z.infer<typeof calendarEntry> {
  return { ...e, from: iso(e.from), to: iso(e.to) };
}

type DefectRow = Awaited<ReturnType<typeof getAircraftDefects>>[number];

export function defectDto({ defect: d, reporter }: DefectRow): z.infer<typeof defect> {
  return {
    id: d.id,
    bookingId: d.bookingId,
    severity: d.severity,
    description: d.description,
    reportedBy: reporter,
    photo: d.photoId ? { id: d.photoId, url: absoluteUrl(`/api/v1/documents/${d.photoId}`) } : null,
    createdAt: iso(d.createdAt),
    resolvedAt: d.resolvedAt ? iso(d.resolvedAt) : null,
    resolution: d.resolution,
  };
}

type RemarkRow = Awaited<ReturnType<typeof getAircraftRemarks>>[number];

export function remarkDto(r: RemarkRow): z.infer<typeof remark> {
  return {
    id: r.remark.id,
    kind: r.remark.kind,
    airport: r.airportCode,
    body: r.remark.body,
    bookingId: r.bookingId,
    flownFrom: iso(r.flownFrom),
    knownSince: r.remark.knownSince ? iso(r.remark.knownSince) : null,
    resolvedAt: r.remark.resolvedAt ? iso(r.remark.resolvedAt) : null,
    createdAt: iso(r.remark.createdAt),
  };
}

type MeterRow = Awaited<ReturnType<typeof getMeterReadings>>[number];

export function meterReadingDto(m: MeterRow): z.infer<typeof meterReading> {
  return { id: m.id, readAt: iso(m.readAt), hobbs: m.hobbs, tach: m.tach, note: m.note };
}
