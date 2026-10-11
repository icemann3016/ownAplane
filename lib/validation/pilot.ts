import { z } from "zod";

import {
  CLASS_RATINGS,
  ISSUING_STATES,
  LICENCE_TYPES,
  MEDICAL_CLASSES,
  PRIVILEGES,
  RATING_KINDS,
} from "@/lib/pilot/catalog";

// Messages are translation keys in messages/*.json → "validation".

const optionalDate = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "dateInvalid")
  .transform((v) => v || null);
const requiredDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "dateInvalid");
const documentId = z
  .string()
  .trim()
  .transform((v) => v || null)
  .pipe(z.uuid("documentInvalid").nullable());
/** Licences and medicals need a scan for verification. */
const requiredDocumentId = z
  .string()
  .trim()
  .min(1, "documentRequired")
  .pipe(z.uuid("documentInvalid"));
const recordId = z
  .string()
  .trim()
  .pipe(z.uuid())
  .optional()
  .or(z.literal("").transform(() => undefined));

export const licenceSchema = z
  .object({
    id: recordId,
    type: z.enum(LICENCE_TYPES, "invalid"),
    issuingState: z.enum(ISSUING_STATES, "invalid"),
    number: z.string().trim().min(1, "licenceNumberRequired").max(50, "licenceNumberRequired"),
    issuedOn: optionalDate,
    expiresOn: optionalDate,
    documentId: requiredDocumentId,
  })
  .refine((d) => !d.issuedOn || !d.expiresOn || d.expiresOn >= d.issuedOn, {
    path: ["expiresOn"],
    error: "expiryBeforeIssue",
  });

export const ratingSchema = z
  .object({
    id: recordId,
    kind: z.enum(RATING_KINDS, "invalid"),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .transform((v) => v.replace(/[\s-]+/g, "")),
    expiresOn: optionalDate,
    documentId,
  })
  .superRefine((d, ctx) => {
    if (!ratingCodeValid(d.kind, d.code)) {
      ctx.addIssue({ code: "custom", path: ["code"], message: "ratingCodeInvalid" });
    }
  });

/** Class and privilege ratings from the catalogue; type ratings as an ICAO type designator. */
export function ratingCodeValid(kind: (typeof RATING_KINDS)[number], code: string): boolean {
  if (kind === "class") return (CLASS_RATINGS as readonly string[]).includes(code);
  if (kind === "privilege") return (PRIVILEGES as readonly string[]).includes(code);
  return /^[A-Z0-9]{2,6}$/.test(code);
}

export const medicalSchema = z.object({
  id: recordId,
  class: z.enum(MEDICAL_CLASSES, "invalid"),
  issuingState: z.enum(ISSUING_STATES, "invalid"),
  validUntil: requiredDate,
  documentId: requiredDocumentId,
});

const hours = (max: number) =>
  z.coerce.number("hoursInvalid").min(0, "hoursInvalid").max(max, "hoursInvalid");

export const experienceSchema = z
  .object({
    totalHours: hours(99999),
    picHours: hours(99999),
    last90DaysHours: hours(2000),
    birthDate: optionalDate
      .optional()
      .transform((v) => v ?? null)
      .refine(
        (v) => v === null || (v >= "1900-01-01" && v <= new Date().toISOString().slice(0, 10)),
        "dateInvalid",
      ),
  })
  .refine((d) => d.picHours <= d.totalHours, { path: ["picHours"], error: "hoursMoreThanTotal" })
  .refine((d) => d.last90DaysHours <= d.totalHours, {
    path: ["last90DaysHours"],
    error: "hoursMoreThanTotal",
  });

export const typeHoursSchema = z.object({
  aircraftType: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,6}$/, "aircraftTypeInvalid"),
  hours: hours(99999),
});

export const DOCUMENT_MAX_BYTES = 4 * 1024 * 1024;
export const DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
