import "server-only";

import { z } from "zod";

import {
  CANCELLATION_POLICIES,
  CATEGORIES,
  CURRENCIES,
  FUEL_TYPES,
  OIL_UNITS,
  PRICE_BASES,
  REFERENCE_DOCUMENT_KINDS,
  TIME_BASES,
  TRANSPONDERS,
  VERIFIED_DOCUMENT_KINDS,
} from "@/lib/aircraft/catalog";
import type { Fail } from "@/lib/bookings/outcome";
import { CLASS_RATINGS, LICENCE_TYPES, PRIVILEGES } from "@/lib/pilot/catalog";
import { ApiError } from "./http";

// An owner's aircraft in the API (LST-1…8, RAT-6/7): inputs in SI units (litres, kg) and the
// outcomes of lib/aircraft/manage*.ts as API errors. Shapes and DTOs: my-aircraft-dto.ts.

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable();
const cents = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);

const fields = {
  registration: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => v.replace(/\s+/g, ""))
    .pipe(z.string().regex(/^[A-Z0-9]{1,3}-?[A-Z0-9]{1,6}$/, "Not a valid registration.")),
  category: z.enum(CATEGORIES),
  manufacturer: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  typeDesignator: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,4}$/)
    .describe("ICAO type designator, e.g. C172"),
  year: z
    .number()
    .int()
    .min(1903)
    .max(new Date().getUTCFullYear() + 1)
    .nullable(),
  seats: z.number().int().min(1).max(20),
  engine: text(80),
  fuelType: z.enum(FUEL_TYPES),
  fuelBurnLph: z.number().min(0.1).max(2000).nullable().describe("Litres per hour"),
  cruiseKt: z.number().int().min(1).max(999).nullable(),
  usefulLoadKg: z.number().int().min(1).max(32767).nullable(),
  mtomKg: z.number().int().min(100).max(20000).nullable().describe("Maximum take-off mass"),
  enduranceH: z.number().min(0.1).max(99.9).nullable(),
  avionics: text(300),
  autopilot: z.boolean(),
  transponder: z.enum(TRANSPONDERS),
  nightVfr: z.boolean().describe("Approved for night VFR"),
  ifr: z.boolean(),
  homeAirport: z.string().trim().toUpperCase().min(2).max(10).nullable().describe("Airport ident"),
  description: text(4000),
  pricePerHour: z.number().min(1).max(99999).nullable(),
  weekendPricePerHour: z.number().min(1).max(99999).nullable(),
  currency: z.enum(CURRENCIES),
  priceBasis: z.enum(PRICE_BASES).describe("wet: fuel included; dry: the pilot pays for fuel"),
  timeBasis: z.enum(TIME_BASES).describe("What the hourly price is charged on"),
  minHoursPerDay: z.number().min(0.1).max(12).nullable(),
  oilUnit: z.enum(OIL_UNITS),
  cancellationPolicy: z.enum(CANCELLATION_POLICIES),
};

/** Request fields → aircraft columns. */
function toColumns<T extends Partial<z.infer<z.ZodObject<typeof fields>>>>(input: T) {
  const { homeAirport, pricePerHour, weekendPricePerHour, minHoursPerDay, ...rest } = input;
  return {
    ...rest,
    ...(homeAirport !== undefined ? { homeAirportIdent: homeAirport } : {}),
    ...(pricePerHour !== undefined ? { pricePerHour: cents(pricePerHour) } : {}),
    ...(weekendPricePerHour !== undefined
      ? { weekendPricePerHour: cents(weekendPricePerHour) }
      : {}),
    ...(minHoursPerDay !== undefined
      ? { minHoursPerDay: minHoursPerDay === null ? null : Math.round(minHoursPerDay * 10) / 10 }
      : {}),
  };
}

const all = z.object(fields);

export const createAircraftBody = all
  .partial()
  .required({
    registration: true,
    manufacturer: true,
    model: true,
    typeDesignator: true,
    seats: true,
    fuelType: true,
  })
  .transform(toColumns);

export const updateAircraftBody = all
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Send at least one field.")
  .transform(toColumns);

export const statusBody = z.object({ status: z.enum(["listed", "paused", "unlisted"]) });

const hours = (max: number) => z.number().min(0).max(max).nullable().default(null);

export const requirementsBody = z
  .object({
    minPilotRating: z
      .union([z.literal(3), z.literal(3.5), z.literal(4), z.literal(4.5)])
      .nullable()
      .default(null)
      .describe("Pilots' average rating from owners"),
    allowUnrated: z.boolean().default(true).describe("Pilots without reviews may ask"),
    unratedNeedsCheckout: z.boolean().default(false),
    checkoutFirstRental: z.boolean().default(false).describe("Checkout flight for new pilots"),
    instantBooking: z.boolean().default(false),
    licenceTypes: z.array(z.enum(LICENCE_TYPES)).max(LICENCE_TYPES.length).default([]),
    requiredRatings: z
      .array(
        z
          .string()
          .trim()
          .toUpperCase()
          .refine(
            (c) =>
              (CLASS_RATINGS as readonly string[]).includes(c) ||
              (PRIVILEGES as readonly string[]).includes(c) ||
              /^[A-Z0-9]{2,6}$/.test(c),
            "Not a known rating.",
          ),
      )
      .max(10)
      .default([])
      .describe("Class ratings, privileges (NIGHT, IR…) or ICAO type ratings"),
    minTotalHours: hours(99999),
    minTypeHours: hours(99999),
    min90DaysHours: hours(2000),
    minAge: z.number().int().min(16).max(99).nullable().default(null),
  })
  .transform((d) => ({
    ...d,
    // A checkout for new pilots only makes sense if new pilots may ask at all.
    unratedNeedsCheckout: d.allowUnrated && d.unratedNeedsCheckout,
    requiredRatings: [...new Set(d.requiredRatings)],
  }));

const VERIFIED = VERIFIED_DOCUMENT_KINDS as readonly string[];
const REFERENCE = REFERENCE_DOCUMENT_KINDS as readonly string[];

export const aircraftDocumentBody = z
  .object({
    kind: z.enum([...VERIFIED_DOCUMENT_KINDS, ...REFERENCE_DOCUMENT_KINDS]),
    title: text(100).default(null).describe("Reference documents (POH, checklist, W&B) only"),
    expiresOn: z.iso.date().nullable().default(null).describe("Needed for ARC and insurance"),
    documentId: z.uuid().describe("The file, from POST /api/v1/documents"),
  })
  .refine((d) => !["arc", "insurance"].includes(d.kind) || d.expiresOn !== null, {
    path: ["expiresOn"],
    error: "ARC and insurance need an expiry date.",
  })
  .transform((d) => ({
    ...d,
    title: REFERENCE.includes(d.kind) ? d.title : null,
    expiresOn: VERIFIED.includes(d.kind) ? d.expiresOn : null,
  }));

export const photoOrderBody = z.object({
  order: z.array(z.uuid()).min(1).max(20).describe("Photo ids, cover first"),
});

// --- Outcomes → API errors ---

const MESSAGES: Record<string, string> = {
  owner_role_needed: "Add the owner role to your account first.",
  not_allowed: "The aircraft's status doesn't allow this.",
  not_ready: "Not ready to be listed.",
  blocked: "An admin unlisted this aircraft; ask them to allow it again.",
  registration_taken: "This registration is already listed by someone else.",
  has_bookings: "Cancel or finish its open bookings first.",
  add_renewal: "Add the renewal as a new document instead: the aircraft would lose its listing.",
  cant_delete_listed: "The listed aircraft needs it; add its renewal first.",
  last_photo: "A listed aircraft keeps at least one photo.",
  overlaps: "Overlaps a booking, a block or a busy time from a connected system.",
  already_resolved: "Already marked as fixed.",
  bad_state: "Only aircraft remarks can become known items.",
};

/** A refused aircraft change as an API error; `details.reason` is the stable code. */
export function aircraftError(fail: Fail): ApiError {
  const details = {
    reason: fail.error,
    ...(fail.missing ? { missing: fail.missing } : {}),
  };
  if (fail.error === "not_found") return new ApiError("not_found", "No such aircraft or item.");
  if (fail.field) {
    const message = fail.field === "documentId" ? "Not one of your uploads." : fail.error;
    return new ApiError(
      "validation_failed",
      "Some fields are invalid.",
      {
        [fail.field]: [message],
      },
      details,
    );
  }
  if (fail.error === "owner_role_needed") {
    return new ApiError("forbidden", MESSAGES[fail.error]!, undefined, details);
  }
  return new ApiError("conflict", MESSAGES[fail.error] ?? fail.error, undefined, details);
}
