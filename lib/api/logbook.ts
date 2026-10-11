import "server-only";

import { z } from "zod";

import type { LogbookEntry, LogbookSpread } from "@/lib/db/schema";
import type { Done } from "@/lib/bookings/outcome";
import type { LogbookTotals } from "@/lib/logbook/entries";
import { entryHints } from "@/lib/logbook/checks";
import { logbookValuesSchema } from "@/lib/validation/logbook";
import { ApiError } from "./http";

// The pilot's logbook in the API (LOG-1…8): inputs, response shapes, DTOs, errors. Durations in
// minutes, times "HH:MM" UTC, dates YYYY-MM-DD.

// --- Inputs ---

export const logbookEntryBody = logbookValuesSchema;
export const newLogbookEntryBody = z.object({
  correctsId: z
    .uuid()
    .nullable()
    .default(null)
    .describe("A certified entry this corrects; it is struck through once this is certified"),
});
export const certifyBody = z.object({ ids: z.array(z.uuid()).min(1).max(500) });
export const voidBody = z.object({ reason: z.string().trim().min(1).max(500) });
export const pageQuery = z.object({ page: z.coerce.number().int().min(1).max(10_000).default(1) });

// --- Responses ---

const minutes = z.number().int().nullable();
export const logbookEntry = z.object({
  id: z.uuid(),
  kind: z.enum(["flight", "fstd", "brought_forward"]),
  status: z.enum(["draft", "certified", "superseded"]),
  source: z.enum(["manual", "ownaplane", "scan"]),
  date: z.iso.date(),
  departure: z.object({ place: z.string().nullable(), time: z.string().nullable() }),
  arrival: z.object({ place: z.string().nullable(), time: z.string().nullable() }),
  aircraftType: z.string().nullable(),
  registration: z.string().nullable(),
  seMinutes: minutes,
  meMinutes: minutes,
  mpMinutes: minutes,
  totalMinutes: minutes,
  picName: z.string().nullable(),
  landingsDay: z.number().int().nullable(),
  landingsNight: z.number().int().nullable(),
  nightMinutes: minutes,
  ifrMinutes: minutes,
  picMinutes: minutes,
  copilotMinutes: minutes,
  dualMinutes: minutes,
  instructorMinutes: minutes,
  fstdType: z.string().nullable(),
  fstdMinutes: minutes,
  remarks: z.string().nullable(),
  correctsId: z.uuid().nullable(),
  voidReason: z.string().nullable().describe("Struck through without a replacement: why"),
  certifiedAt: z.iso.datetime().nullable(),
  hints: z.array(z.string()).describe("Times that don't add up (never blocking)"),
});

const totalsShape = z.record(z.string(), z.number());
export const logbookTotals = z.object({
  toDate: totalsShape.describe("Sum per column of certified entries (minutes, landings)"),
  last90Days: totalsShape,
  byType: z.array(z.object({ aircraftType: z.string(), minutes: z.number().int() })),
});

// --- DTOs ---

export function logbookEntryDto(e: LogbookEntry): z.infer<typeof logbookEntry> {
  return {
    id: e.id,
    kind: e.kind,
    status: e.status,
    source: e.source,
    date: e.date,
    departure: { place: e.departurePlace, time: e.departureTime?.slice(0, 5) ?? null },
    arrival: { place: e.arrivalPlace, time: e.arrivalTime?.slice(0, 5) ?? null },
    aircraftType: e.aircraftType,
    registration: e.registration,
    seMinutes: e.seMinutes,
    meMinutes: e.meMinutes,
    mpMinutes: e.mpMinutes,
    totalMinutes: e.totalMinutes,
    picName: e.picName,
    landingsDay: e.landingsDay,
    landingsNight: e.landingsNight,
    nightMinutes: e.nightMinutes,
    ifrMinutes: e.ifrMinutes,
    picMinutes: e.picMinutes,
    copilotMinutes: e.copilotMinutes,
    dualMinutes: e.dualMinutes,
    instructorMinutes: e.instructorMinutes,
    fstdType: e.fstdType,
    fstdMinutes: e.fstdMinutes,
    remarks: e.remarks,
    correctsId: e.correctsId,
    voidReason: e.voidReason,
    certifiedAt: e.certifiedAt?.toISOString() ?? null,
    hints: entryHints(e),
  };
}

export function logbookTotalsDto(t: LogbookTotals): z.infer<typeof logbookTotals> {
  return { toDate: t.all, last90Days: t.last90, byType: t.byType };
}

// --- Errors ---

export function logbookError(fail: Extract<Done, { ok: false }> & { incomplete?: string[] }) {
  const details = {
    reason: fail.error,
    ...(fail.incomplete ? { incomplete: fail.incomplete } : {}),
  };
  if (fail.error === "not_found") return new ApiError("not_found", "No such logbook entry.");
  if (fail.error === "bad_correction") {
    return new ApiError(
      "validation_failed",
      "Some fields are invalid.",
      {
        correctsId: ["Only your own certified entries can be corrected."],
      },
      details,
    );
  }
  if (fail.error === "reason_required") {
    return new ApiError(
      "validation_failed",
      "Some fields are invalid.",
      {
        reason: ["Say why."],
      },
      details,
    );
  }
  return new ApiError("conflict", fail.error, undefined, details);
}

// --- Scanned spreads (LOG-6) ---

export const spreadBody = z.object({
  leftDocumentId: z
    .uuid()
    .describe("Left page, or one photo of both pages (POST /api/v1/documents)"),
  rightDocumentId: z.uuid().nullable().default(null).describe("Right page, if a separate file"),
});

export const logbookSpread = z.object({
  id: z.uuid(),
  leftDocumentId: z.uuid().nullable(),
  rightDocumentId: z.uuid().nullable(),
  linesRead: z.number().int(),
  linesSkipped: z.number().int().describe("Lines without a readable date"),
  pageTotals: z.record(z.string(), z.number()).nullable().describe('"Total this page" as written'),
  differences: z
    .array(z.object({ column: z.string(), written: z.number(), lines: z.number() }))
    .describe("Columns where the lines read don't add up to the written total"),
  createdAt: z.iso.datetime(),
  entries: z.array(logbookEntry),
});

export function logbookSpreadDto(
  spread: LogbookSpread,
  entries: LogbookEntry[],
): z.infer<typeof logbookSpread> {
  return {
    id: spread.id,
    leftDocumentId: spread.leftDocumentId,
    rightDocumentId: spread.rightDocumentId,
    linesRead: spread.linesRead,
    linesSkipped: spread.linesSkipped,
    pageTotals: spread.pageTotals ?? null,
    differences: spread.differences,
    createdAt: spread.createdAt.toISOString(),
    entries: entries.map(logbookEntryDto),
  };
}
