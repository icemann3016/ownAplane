import "server-only";

import { z } from "zod";

import { ISSUING_STATES, LICENCE_TYPES, MEDICAL_CLASSES, RATING_KINDS } from "@/lib/pilot/catalog";
import type { CredentialSaved } from "@/lib/pilot/credential-ops";
import {
  credentialItems,
  getPilotCredentials,
  type PilotCredentials,
} from "@/lib/pilot/credentials";
import type { CredentialKind } from "@/lib/pilot/labels";
import { pilotSummary } from "@/lib/pilot/summary";
import { expiryState, isUsable } from "@/lib/pilot/validity";
import { ratingCodeValid } from "@/lib/validation/pilot";
import { absoluteUrl } from "./dto";
import { ApiError, json, parse } from "./http";

// Pilot credentials in the API (VER-1…3): inputs, response shape and DTO of this area. Scans are
// uploaded first (POST /api/v1/documents) and referenced by their id.

const day = z.iso.date().describe("YYYY-MM-DD");
const hours = (max: number) => z.number().min(0).max(max);

// --- Inputs ---

export const licenceBody = z
  .object({
    type: z.enum(LICENCE_TYPES),
    issuingState: z.enum(ISSUING_STATES).describe("ISO country code of the authority"),
    number: z.string().trim().min(1).max(50),
    issuedOn: day.nullable().default(null),
    expiresOn: day.nullable().default(null).describe("EASA licences usually don't expire"),
    documentId: z.uuid().describe("The licence scan, from POST /api/v1/documents"),
  })
  .refine((d) => !d.issuedOn || !d.expiresOn || d.expiresOn >= d.issuedOn, {
    path: ["expiresOn"],
    error: "Can't be before the issue date.",
  });

export const ratingBody = z
  .object({
    kind: z.enum(RATING_KINDS),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .transform((v) => v.replace(/[\s-]+/g, ""))
      .describe("class: SEP_LAND…; privilege: NIGHT, IR…; type: ICAO type designator"),
    expiresOn: day.nullable().default(null),
    documentId: z.uuid().nullable().default(null),
  })
  .superRefine((d, ctx) => {
    if (!ratingCodeValid(d.kind, d.code)) {
      ctx.addIssue({ code: "custom", path: ["code"], message: "Not a known rating." });
    }
  });

export const medicalBody = z.object({
  class: z.enum(MEDICAL_CLASSES),
  issuingState: z.enum(ISSUING_STATES),
  validUntil: day,
  documentId: z.uuid().describe("The medical certificate scan"),
});

export const experienceBody = z
  .object({
    totalHours: hours(99999),
    picHours: hours(99999),
    last90DaysHours: hours(2000),
    birthDate: day
      .nullable()
      .default(null)
      .describe("Optional; used only for minimum ages")
      .refine(
        (v) => v === null || (v >= "1900-01-01" && v <= new Date().toISOString().slice(0, 10)),
        "Not a valid date of birth.",
      ),
  })
  .refine((d) => d.picHours <= d.totalHours, {
    path: ["picHours"],
    error: "Can't be more than the total.",
  })
  .refine((d) => d.last90DaysHours <= d.totalHours, {
    path: ["last90DaysHours"],
    error: "Can't be more than the total.",
  });

export const typeHoursBody = z.object({ hours: hours(99999) });

export const aircraftTypeParam = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2,6}$/);

// --- Response ---

const document = z
  .object({ id: z.uuid(), filename: z.string(), url: z.url() })
  .nullable()
  .describe("Open with the same token");
const review = {
  status: z.enum(["pending", "verified", "rejected"]),
  rejectionReason: z.string().nullable(),
  usable: z.boolean().describe("Verified and not expired: counts for rentals"),
  expiry: z.enum(["none", "valid", "expiring", "expired"]),
  document,
};

export const credentials = z.object({
  summary: z.object({
    verified: z.boolean().describe("A usable licence and medical: may rent aircraft"),
    pending: z.number().int(),
    rejected: z.number().int(),
    missing: z.array(z.enum(["licence", "medical"])),
  }),
  licences: z.array(
    z.object({
      id: z.uuid(),
      type: z.enum(LICENCE_TYPES),
      issuingState: z.string(),
      number: z.string(),
      issuedOn: day.nullable(),
      expiresOn: day.nullable(),
      ...review,
    }),
  ),
  ratings: z.array(
    z.object({
      id: z.uuid(),
      kind: z.enum(RATING_KINDS),
      code: z.string(),
      expiresOn: day.nullable(),
      ...review,
    }),
  ),
  medicals: z.array(
    z.object({
      id: z.uuid(),
      class: z.enum(MEDICAL_CLASSES),
      issuingState: z.string(),
      validUntil: day,
      ...review,
    }),
  ),
  experience: z
    .object({
      totalHours: z.number(),
      picHours: z.number(),
      last90DaysHours: z.number(),
      birthDate: day.nullable(),
    })
    .nullable(),
  typeHours: z.array(z.object({ aircraftType: z.string(), hours: z.number() })),
});

// --- DTO ---

type Reviewed = {
  status: "pending" | "verified" | "rejected";
  rejectionReason: string | null;
  documentId: string | null;
};

export function credentialsDto(c: PilotCredentials): z.infer<typeof credentials> {
  const reviewDto = (item: Reviewed, expiresOn: string | null) => {
    const doc = item.documentId ? c.documentsById.get(item.documentId) : undefined;
    return {
      status: item.status,
      rejectionReason: item.status === "rejected" ? item.rejectionReason : null,
      usable: isUsable({ status: item.status, expiresOn }),
      expiry: expiryState(expiresOn),
      document: doc ? { ...doc, url: absoluteUrl(`/api/v1/documents/${doc.id}`) } : null,
    };
  };
  const summary = pilotSummary(credentialItems(c));
  return {
    summary: {
      verified: summary.verified,
      pending: summary.pending,
      rejected: summary.rejected,
      missing: summary.missing,
    },
    licences: c.licences.map((l) => ({
      id: l.id,
      type: l.type,
      issuingState: l.issuingState,
      number: l.number,
      issuedOn: l.issuedOn,
      expiresOn: l.expiresOn,
      ...reviewDto(l, l.expiresOn),
    })),
    ratings: c.ratings.map((r) => ({
      id: r.id,
      kind: r.kind,
      code: r.code,
      expiresOn: r.expiresOn,
      ...reviewDto(r, r.expiresOn),
    })),
    medicals: c.medicals.map((m) => ({
      id: m.id,
      class: m.class,
      issuingState: m.issuingState,
      validUntil: m.validUntil,
      ...reviewDto(m, m.validUntil),
    })),
    experience: c.experience
      ? {
          totalHours: c.experience.totalHours,
          picHours: c.experience.picHours,
          last90DaysHours: c.experience.last90DaysHours,
          birthDate: c.experience.birthDate,
        }
      : null,
    typeHours: c.typeHours.map((t) => ({ aircraftType: t.aircraftType, hours: t.hours })),
  };
}

// --- Route helpers ---

export const KIND_OF_PATH = {
  licences: "licence",
  ratings: "rating",
  medicals: "medical",
} as const;
const BODY_OF_KIND = { licence: licenceBody, rating: ratingBody, medical: medicalBody } as const;

/** licences | ratings | medicals → the credential kind, else 404. */
export function kindOf(path: string): CredentialKind {
  const kind = KIND_OF_PATH[path as keyof typeof KIND_OF_PATH];
  if (!kind) throw new ApiError("not_found", "Not found.");
  return kind;
}

export function credentialInput(kind: CredentialKind, body: unknown) {
  return parse(BODY_OF_KIND[kind], body) as Record<string, unknown> & { documentId: string | null };
}

/** The user's credentials as they are now. */
export async function credentialsResponse(userId: string, status = 200) {
  return json({ data: credentialsDto(await getPilotCredentials(userId)) }, { status });
}

/** Throw the API error of a refused save. */
export function checkSaved(result: CredentialSaved) {
  if (result.ok) return;
  if (result.error === "documentInvalid") {
    throw new ApiError("validation_failed", "Some fields are invalid.", {
      documentId: ["Not one of your uploaded documents."],
    });
  }
  throw new ApiError("not_found", "No such credential.");
}

// --- Reading a scan (VER-9) ---

export const readScanBody = z.object({
  as: z.enum(["licence", "medical"]).describe("What the document is"),
  consent: z
    .boolean()
    .default(false)
    .describe("Medicals: the pilot agreed that the scan is sent to the AI provider"),
});

export const scanSuggestion = z.object({
  as: z.enum(["licence", "medical"]),
  licence: z
    .object({
      type: z.enum(LICENCE_TYPES).nullable(),
      issuingState: z.string().nullable(),
      number: z.string().nullable(),
      issuedOn: day.nullable(),
      expiresOn: day.nullable(),
      ratings: z.array(
        z.object({ kind: z.enum(RATING_KINDS), code: z.string(), expiresOn: day.nullable() }),
      ),
    })
    .nullable(),
  medical: z
    .object({
      class: z.enum(MEDICAL_CLASSES).nullable(),
      issuingState: z.string().nullable(),
      validUntil: day.nullable(),
    })
    .nullable(),
});
