import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { asUser } from "@/lib/db/rls";
import { documents } from "@/lib/db/schema";
import { readDocument } from "@/lib/documents";
import {
  CLASS_RATINGS,
  ISSUING_STATES,
  LICENCE_TYPES,
  MEDICAL_CLASSES,
  PRIVILEGES,
  RATING_KINDS,
} from "@/lib/pilot/catalog";
import { ratingCodeValid } from "@/lib/validation/pilot";
import { readScan } from ".";
import { logRead, readsLeft } from "./usage";

// Reading a licence or medical scan to fill in the pilot's form (VER-9). Only suggestions: the
// pilot checks them before saving, and admins verify against the scan.

const day = z.iso.date().nullable();

const licenceScan = z.object({
  isLicence: z.boolean().describe("Is this a pilot licence at all?"),
  type: z.enum(LICENCE_TYPES).nullable().describe("PPL(A) ppl_a, LAPL(A) lapl_a, CPL(A) cpl_a…"),
  issuingState: z.string().nullable().describe("ISO 3166-1 alpha-2 code of the issuing state"),
  number: z.string().nullable().describe("Licence number as printed"),
  issuedOn: day.describe("Date of (initial) issue"),
  expiresOn: day.describe("Expiry of the licence itself, if it has one"),
  ratings: z
    .array(
      z.object({
        kind: z.enum(RATING_KINDS),
        code: z.string().describe("Code as described in the instructions"),
        expiresOn: day.describe("Valid until"),
      }),
    )
    .describe("Ratings and privileges, usually item XII"),
});

const medicalScan = z.object({
  isMedical: z.boolean().describe("Is this an aviation medical certificate at all?"),
  issuingState: z.string().nullable().describe("ISO 3166-1 alpha-2 code of the issuing state"),
  classes: z
    .array(z.object({ class: z.enum(MEDICAL_CLASSES), validUntil: day }))
    .describe("Each class with an expiry date in item IX, with that date; none shown → empty"),
});

const LICENCE_TASK = {
  tool: "record_licence",
  description: "Record what the pilot licence says.",
  schema: licenceScan,
  instructions: [
    "This should be a pilot licence (EASA Part-FCL or national).",
    "type: PPL(A) → ppl_a, LAPL(A) → lapl_a, CPL(A) → cpl_a, ATPL(A) → atpl_a, MPL → mpl,",
    "anything else → other.",
    `Ratings (item XII) as kind + code: class ratings ${CLASS_RATINGS.join(", ")}`,
    "(SEP(land) → SEP_LAND, SEP(sea) → SEP_SEA, MEP(land) → MEP_LAND, MEP(sea) → MEP_SEA,",
    `TMG → TMG); privileges ${PRIVILEGES.join(", ")} (night rating → NIGHT, instrument`,
    "rating → IR, basic IR → BIR, aerobatic → AEROBATIC, towing → TOWING, mountain → MOUNTAIN);",
    "type ratings as their ICAO type designator (e.g. C510). Leave out what doesn't fit.",
  ].join(" "),
};

const MEDICAL_TASK = {
  tool: "record_medical",
  description: "Record what the medical certificate says.",
  schema: medicalScan,
  instructions: [
    "This should be an aviation medical certificate (EASA Part-MED or national).",
    "The class is given only by the expiry dates in item IX ('expiry date of this certificate':",
    "Class 1, Class 2, LAPL, each with its own date; a class 1 certificate usually lists all",
    "three). The title 'Class 1 / 2 / LAPL medical certificate' is printed on every certificate",
    "and does not tell the class; the date of issue (item X) and the examination date are not",
    "expiry dates. classes: each class with an expiry date in item IX (Class 1 → class1,",
    "Class 2 → class2, LAPL → lapl), with that date (the latest one if there are several for",
    "that class). If the scan doesn't show item IX, classes is an empty list.",
  ].join(" "),
};

export type LicenceSuggestion = {
  type: (typeof LICENCE_TYPES)[number] | null;
  issuingState: string | null;
  number: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  ratings: { kind: (typeof RATING_KINDS)[number]; code: string; expiresOn: string | null }[];
};

export type MedicalSuggestion = {
  class: (typeof MEDICAL_CLASSES)[number] | null;
  issuingState: string | null;
  validUntil: string | null;
};

const plausible = (d: string | null) => (d && d >= "1950-01-01" && d <= "2100-12-31" ? d : null);
const state = (s: string | null) => {
  const code = s?.trim().toUpperCase() ?? "";
  return (ISSUING_STATES as readonly string[]).includes(code) ? code : null;
};

/** "SEP (land)", "SEP-LAND", "sep_land" → SEP_LAND; other codes without spaces and dashes. */
function ratingCode(kind: string, raw: string): string {
  const code = raw
    .trim()
    .toUpperCase()
    .replace(/[\s()_-]+/g, "");
  if (kind !== "class") return code;
  const classes: Record<string, string> = {
    SEPLAND: "SEP_LAND",
    SEPSEA: "SEP_SEA",
    MEPLAND: "MEP_LAND",
    MEPSEA: "MEP_SEA",
    SEP: "SEP_LAND",
    MEP: "MEP_LAND",
    TMG: "TMG",
  };
  return classes[code] ?? code;
}

/** Clean up what was read: known states and codes only, plausible dates (pure, for tests). */
export function licenceSuggestion(read: z.infer<typeof licenceScan>): LicenceSuggestion {
  const ratings: LicenceSuggestion["ratings"] = [];
  for (const r of read.ratings) {
    const code = ratingCode(r.kind, r.code);
    const known = ratings.some((x) => x.kind === r.kind && x.code === code);
    if (ratingCodeValid(r.kind, code) && !known) {
      ratings.push({ kind: r.kind, code, expiresOn: plausible(r.expiresOn) });
    }
  }
  return {
    type: read.type,
    issuingState: state(read.issuingState),
    number: read.number?.trim().slice(0, 50) || null,
    issuedOn: plausible(read.issuedOn),
    expiresOn: plausible(read.expiresOn),
    ratings,
  };
}

const RANK = { class1: 3, class2: 2, lapl: 1 } as const;

/**
 * The certificate's class: the highest one with an expiry date, preferring one still valid
 * today. Its date is the one for private flying (what the form asks for): class 1 includes
 * class 2, so the later of the class 1 and class 2 dates; the LAPL date only when LAPL is all
 * that is left. Classes without a date count for nothing (the cover names every class). Pure.
 */
export function medicalSuggestion(
  read: z.infer<typeof medicalScan>,
  today = new Date().toISOString().slice(0, 10),
): MedicalSuggestion {
  const dated = read.classes
    .map((c) => ({ class: c.class, validUntil: plausible(c.validUntil) ?? "" }))
    .filter((c) => c.validUntil)
    .sort((a, b) => RANK[b.class] - RANK[a.class]);
  const best = dated.find((c) => c.validUntil >= today) ?? dated[0];
  const partFcl = dated.filter((c) => c.class !== "lapl").map((c) => c.validUntil);
  const validUntil =
    !best || best.class === "lapl" ? (best?.validUntil ?? null) : partFcl.sort().at(-1)!;
  return { class: best?.class ?? null, issuingState: state(read.issuingState), validUntil };
}

export type ScanReadError =
  | "not_configured"
  | "not_found"
  | "limit"
  | "consent_required"
  | "not_this_document"
  | "unreadable"
  | "failed";

export type CredentialRead =
  | { ok: true; kind: "licence"; suggestion: LicenceSuggestion }
  | { ok: true; kind: "medical"; suggestion: MedicalSuggestion }
  | { ok: false; error: ScanReadError };

/**
 * Read one of the user's own uploaded scans as a licence or medical. Medicals need `consentAt`:
 * when the pilot agreed that the scan is sent to the AI provider.
 */
export async function readCredentialScan(
  userId: string,
  documentId: string,
  kind: "licence" | "medical",
  consentAt: Date | null,
): Promise<CredentialRead> {
  if (kind === "medical" && !consentAt) return { ok: false, error: "consent_required" };
  // Only the pilot's own upload (admins may open others', but never send them to the AI).
  const [own] = await asUser(userId, (tx) =>
    tx.select({ ownerId: documents.ownerId }).from(documents).where(eq(documents.id, documentId)),
  );
  if (own?.ownerId !== userId) return { ok: false, error: "not_found" };
  if ((await readsLeft(userId)) < 1) return { ok: false, error: "limit" };
  const file = await readDocument(userId, documentId);
  if (!file) return { ok: false, error: "not_found" };
  const page = { contentType: file.doc.contentType, body: file.body };

  const log = (outcome: "ok" | "unreadable" | "failed") =>
    logRead({ userId, documentId, kind, outcome, consentAt });
  if (kind === "licence") {
    const read = await readScan(LICENCE_TASK, [page]);
    if (!read.ok) {
      if (read.error !== "not_configured") await log(read.error);
      return read;
    }
    await log("ok");
    if (!read.data.isLicence) return { ok: false, error: "not_this_document" };
    return { ok: true, kind, suggestion: licenceSuggestion(read.data) };
  }
  const read = await readScan(MEDICAL_TASK, [page]);
  if (!read.ok) {
    if (read.error !== "not_configured") await log(read.error);
    return read;
  }
  await log("ok");
  if (!read.data.isMedical) return { ok: false, error: "not_this_document" };
  return { ok: true, kind, suggestion: medicalSuggestion(read.data) };
}
