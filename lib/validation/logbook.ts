import { z } from "zod";

import { parseDuration } from "@/lib/logbook/duration";

// A logbook entry (LOG-1): the rules once, for the API (minutes as numbers) and the website's
// form (durations as "1:25" or "1.4"). Times "HH:MM" UTC. Messages are keys in
// messages/*.json → "validation".

export const LOGBOOK_KINDS = ["flight", "fstd", "brought_forward"] as const;

/** An entry's values as stored (minutes, "HH:MM" UTC times). */
export type LogbookValues = {
  kind: (typeof LOGBOOK_KINDS)[number];
  date: string;
  departurePlace: string | null;
  departureTime: string | null;
  arrivalPlace: string | null;
  arrivalTime: string | null;
  aircraftType: string | null;
  registration: string | null;
  seMinutes: number | null;
  meMinutes: number | null;
  mpMinutes: number | null;
  totalMinutes: number | null;
  picName: string | null;
  landingsDay: number | null;
  landingsNight: number | null;
  nightMinutes: number | null;
  ifrMinutes: number | null;
  picMinutes: number | null;
  copilotMinutes: number | null;
  dualMinutes: number | null;
  instructorMinutes: number | null;
  fstdType: string | null;
  fstdMinutes: number | null;
  remarks: string | null;
};

export type LogbookEntryInput = LogbookValues;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "textTooLong")
    .nullable()
    .default(null)
    .transform((v) => v || null);
const minutes = z
  .number("durationInvalid")
  .int("durationInvalid")
  .min(0, "durationInvalid")
  .max(9_999_999, "durationInvalid")
  .nullable()
  .default(null)
  .describe("Minutes");
const count = z
  .number("numberInvalid")
  .int("numberInvalid")
  .min(0)
  .max(32000)
  .nullable()
  .default(null);
const clock = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "timeInvalid")
  .nullable()
  .default(null)
  .describe("HH:MM, UTC");

const REQUIRED: Record<(typeof LOGBOOK_KINDS)[number], (keyof LogbookValues)[]> = {
  flight: [
    "departurePlace",
    "arrivalPlace",
    "aircraftType",
    "registration",
    "totalMinutes",
    "picName",
  ],
  fstd: ["fstdType", "fstdMinutes"],
  brought_forward: [],
};

const TIMES = [
  "seMinutes",
  "meMinutes",
  "mpMinutes",
  "nightMinutes",
  "ifrMinutes",
  "picMinutes",
  "copilotMinutes",
  "dualMinutes",
  "instructorMinutes",
] as const;

const BLANK_FLIGHT = {
  departurePlace: null,
  departureTime: null,
  arrivalPlace: null,
  arrivalTime: null,
  aircraftType: null,
  registration: null,
  seMinutes: null,
  meMinutes: null,
  mpMinutes: null,
  totalMinutes: null,
  picName: null,
  landingsDay: null,
  landingsNight: null,
  nightMinutes: null,
  ifrMinutes: null,
  picMinutes: null,
  copilotMinutes: null,
  dualMinutes: null,
  instructorMinutes: null,
};

/** The entry with numbers (the API's body; the form's strings are piped into it). */
export const logbookValuesSchema = z
  .object({
    kind: z.enum(LOGBOOK_KINDS, "invalid"),
    date: z.iso.date("dateInvalid"),
    departurePlace: text(60),
    departureTime: clock,
    arrivalPlace: text(60),
    arrivalTime: clock,
    aircraftType: text(60).describe("Make, model and variant, e.g. C172S"),
    registration: text(20),
    seMinutes: minutes,
    meMinutes: minutes,
    mpMinutes: minutes,
    totalMinutes: minutes,
    picName: text(100),
    landingsDay: count,
    landingsNight: count,
    nightMinutes: minutes,
    ifrMinutes: minutes,
    picMinutes: minutes,
    copilotMinutes: minutes,
    dualMinutes: minutes,
    instructorMinutes: minutes,
    fstdType: text(60),
    fstdMinutes: minutes,
    remarks: text(1000),
  })
  .superRefine((e, ctx) => {
    if (e.date > new Date().toISOString().slice(0, 10)) {
      ctx.addIssue({ code: "custom", path: ["date"], message: "dateInFuture" });
    }
    for (const field of REQUIRED[e.kind]) {
      if (e[field] == null)
        ctx.addIssue({ code: "custom", path: [field], message: "fieldRequired" });
    }
    if (e.kind === "flight" && e.totalMinutes != null) {
      if (e.totalMinutes > 1440) {
        ctx.addIssue({ code: "custom", path: ["totalMinutes"], message: "durationInvalid" });
      }
      for (const field of TIMES) {
        if ((e[field] ?? 0) > e.totalMinutes) {
          ctx.addIssue({ code: "custom", path: [field], message: "moreThanTotal" });
        }
      }
    }
  })
  .transform((e): LogbookValues => {
    // Only the columns of its kind (a simulator session has no route, a flight no device).
    if (e.kind === "fstd") return { ...e, ...BLANK_FLIGHT };
    return {
      ...e,
      fstdType: null,
      fstdMinutes: e.kind === "brought_forward" ? e.fstdMinutes : null,
    };
  });

// --- The website's form: strings ---

const formText = z
  .string()
  .optional()
  .transform((v) => v ?? null);
const formDuration = z
  .string()
  .optional()
  .transform((v, ctx) => {
    const n = parseDuration(v ?? "");
    if (n !== null && !Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: "durationInvalid" });
      return z.NEVER;
    }
    return n;
  });
const formCount = z
  .string()
  .optional()
  .transform((v, ctx) => {
    const trimmed = (v ?? "").trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    if (!Number.isInteger(n)) {
      ctx.addIssue({ code: "custom", message: "numberInvalid" });
      return z.NEVER;
    }
    return n;
  });
const formClock = z
  .string()
  .optional()
  .transform((v) => v?.trim().slice(0, 5) || null);

export const logbookEntrySchema = z
  .object({
    kind: z.string(),
    date: z.string(),
    departurePlace: formText,
    departureTime: formClock,
    arrivalPlace: formText,
    arrivalTime: formClock,
    aircraftType: formText,
    registration: formText,
    seMinutes: formDuration,
    meMinutes: formDuration,
    mpMinutes: formDuration,
    totalMinutes: formDuration,
    picName: formText,
    landingsDay: formCount,
    landingsNight: formCount,
    nightMinutes: formDuration,
    ifrMinutes: formDuration,
    picMinutes: formDuration,
    copilotMinutes: formDuration,
    dualMinutes: formDuration,
    instructorMinutes: formDuration,
    fstdType: formText,
    fstdMinutes: formDuration,
    remarks: formText,
  })
  .transform((form, ctx): LogbookValues => {
    // The same rules as the API, with the form's field names in the errors.
    const parsed = logbookValuesSchema.safeParse(form);
    if (parsed.success) return parsed.data;
    for (const issue of parsed.error.issues) {
      ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
    return z.NEVER;
  });
