import { z } from "zod";

import {
  CANCELLATION_POLICIES,
  CATEGORIES,
  CURRENCIES,
  FUEL_TYPES,
  OIL_UNITS,
  PRICE_BASES,
  TIME_BASES,
  TRANSPONDERS,
} from "@/lib/aircraft/catalog";
import { massToKg, type UnitSystem, volumeToLitres } from "@/lib/domain/units";
import { CLASS_RATINGS, LICENCE_TYPES, PRIVILEGES } from "@/lib/pilot/catalog";

// Messages are translation keys in messages/*.json → "validation".

/** "" → null, "12,5" → 12.5; anything else must be a number within the range. */
function optionalNumber(min: number, max: number, message = "numberInvalid") {
  return z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v.replace(",", "."))))
    .refine((v) => v === null || (Number.isFinite(v) && v >= min && v <= max), message);
}

function requiredNumber(min: number, max: number, message = "numberInvalid") {
  return z
    .string()
    .trim()
    .min(1, message)
    .transform((v) => Number(v.replace(",", ".")))
    .refine((v) => Number.isFinite(v) && v >= min && v <= max, message);
}

const optionalInt = (min: number, max: number, message = "numberInvalid") =>
  optionalNumber(min, max, message).refine((v) => v === null || Number.isInteger(v), message);

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => v || null);

/** HTML checkboxes send "on" when ticked and nothing when not. */
const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true");

export const registrationSchema = z
  .string()
  .trim()
  .toUpperCase()
  .transform((v) => v.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^[A-Z0-9]{1,3}-?[A-Z0-9]{1,6}$/, "registrationInvalid"));

/** Registration, type and performance (LST-1). Fuel burn and useful load in the user's units. */
export function detailsSchema(units: UnitSystem) {
  return z
    .object({
      registration: registrationSchema,
      category: z.enum(CATEGORIES, "invalid"),
      manufacturer: z
        .string()
        .trim()
        .min(1, "manufacturerRequired")
        .max(60, "manufacturerRequired"),
      model: z.string().trim().min(1, "modelRequired").max(60, "modelRequired"),
      typeDesignator: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9]{2,4}$/, "aircraftTypeInvalid"),
      year: optionalInt(1903, new Date().getUTCFullYear() + 1, "yearInvalid"),
      seats: requiredNumber(1, 20, "seatsInvalid").refine(Number.isInteger, "seatsInvalid"),
      engine: optionalText(80, "textTooLong"),
      fuelType: z.enum(FUEL_TYPES, "invalid"),
      fuelBurn: optionalNumber(0.1, 2000),
      cruiseKt: optionalInt(1, 999),
      usefulLoad: optionalInt(1, 30000),
      mtom: optionalInt(1, 50000).optional(),
      enduranceH: optionalNumber(0.1, 99.9),
    })
    .transform(({ fuelBurn, usefulLoad, mtom, ...rest }) => ({
      ...rest,
      fuelBurnLph: fuelBurn === null ? null : volumeToLitres(fuelBurn, units),
      usefulLoadKg: usefulLoad === null ? null : massToKg(usefulLoad, units),
      mtomKg: mtom == null ? null : massToKg(mtom, units),
    }))
    .refine((d) => d.usefulLoadKg === null || d.usefulLoadKg <= 32767, {
      path: ["usefulLoad"],
      error: "numberInvalid",
    })
    .refine((d) => d.mtomKg === null || (d.mtomKg >= 100 && d.mtomKg <= 20000), {
      path: ["mtom"],
      error: "numberInvalid",
    });
}

/** Avionics and capabilities (LST-2). */
export const equipmentSchema = z.object({
  avionics: optionalText(300, "textTooLong"),
  autopilot: checkbox,
  transponder: z.enum(TRANSPONDERS, "invalid"),
  nightVfr: checkbox,
  ifr: checkbox,
});

/** Home base and description (LST-3/4). */
export const baseSchema = z
  .object({
    homeAirport: z.string().trim().min(1, "airportUnknown").max(10, "airportUnknown"),
    description: optionalText(4000, "textTooLong"),
  })
  .transform(({ homeAirport, description }) => ({ homeAirportIdent: homeAirport, description }));

/** Prices and rental terms (LST-5). */
export const pricingSchema = z
  .object({
    pricePerHour: requiredNumber(1, 99999, "priceInvalid"),
    weekendPricePerHour: optionalNumber(1, 99999, "priceInvalid"),
    currency: z.enum(CURRENCIES, "invalid"),
    priceBasis: z.enum(PRICE_BASES, "invalid"),
    timeBasis: z.enum(TIME_BASES, "invalid"),
    minHoursPerDay: optionalNumber(0.1, 12, "minHoursInvalid"),
    oilUnit: z.enum(OIL_UNITS, "invalid"),
    cancellationPolicy: z.enum(CANCELLATION_POLICIES, "invalid"),
  })
  .transform((d) => ({
    ...d,
    // Two decimals, like the database column.
    pricePerHour: Math.round(d.pricePerHour * 100) / 100,
    weekendPricePerHour:
      d.weekendPricePerHour === null ? null : Math.round(d.weekendPricePerHour * 100) / 100,
    minHoursPerDay: d.minHoursPerDay === null ? null : Math.round(d.minHoursPerDay * 10) / 10,
  }));

/** Photos are shrunk in the browser first; 4 MB is the upload limit on Vercel. */
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const AIRCRAFT_DOCUMENT_KINDS = [
  "cofa",
  "arc",
  "insurance",
  "poh",
  "checklist",
  "weight_balance",
] as const;

/** An aircraft document (LST-6, LST-8). ARC and insurance need an expiry date. */
export const aircraftDocumentSchema = z
  .object({
    id: z
      .string()
      .trim()
      .pipe(z.uuid())
      .optional()
      .or(z.literal("").transform(() => undefined)),
    aircraftId: z.uuid(),
    kind: z.enum(AIRCRAFT_DOCUMENT_KINDS, "invalid"),
    title: optionalText(100, "textTooLong").optional().default(null),
    expiresOn: z
      .string()
      .trim()
      .optional()
      .default("")
      .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "dateInvalid")
      .transform((v) => v || null),
    documentId: z.string().trim().min(1, "documentRequired").pipe(z.uuid("documentInvalid")),
  })
  .refine((d) => !["arc", "insurance"].includes(d.kind) || d.expiresOn !== null, {
    path: ["expiresOn"],
    error: "expiryRequired",
  })
  .transform((d) => ({
    ...d,
    // Only reference documents have a title; only verified documents an expiry date.
    title: ["poh", "checklist", "weight_balance"].includes(d.kind) ? d.title : null,
    expiresOn: ["cofa", "arc", "insurance"].includes(d.kind) ? d.expiresOn : null,
  }));

/** Who may rent the aircraft (RAT-6, RAT-7). Empty fields mean "no requirement". */
export const requirementsSchema = z
  .object({
    aircraftId: z.uuid(),
    minPilotRating: z
      .enum(["", "3", "3.5", "4", "4.5"], "invalid")
      .transform((v) => (v ? Number(v) : null)),
    allowUnrated: checkbox,
    unratedNeedsCheckout: checkbox,
    checkoutFirstRental: checkbox,
    instantBooking: checkbox,
    licenceTypes: z.array(z.enum(LICENCE_TYPES, "invalid")).max(LICENCE_TYPES.length),
    requiredRatings: z.array(z.enum([...CLASS_RATINGS, ...PRIVILEGES], "invalid")).max(10),
    typeRating: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => v === "" || /^[A-Z0-9]{2,6}$/.test(v), "aircraftTypeInvalid"),
    minTotalHours: optionalNumber(0, 99999, "hoursInvalid"),
    minTypeHours: optionalNumber(0, 99999, "hoursInvalid"),
    min90DaysHours: optionalNumber(0, 2000, "hoursInvalid"),
    minAge: optionalInt(16, 99, "ageInvalid"),
  })
  .transform(({ typeRating, unratedNeedsCheckout, ...d }) => ({
    ...d,
    // A checkout for new pilots only makes sense if new pilots may ask at all.
    unratedNeedsCheckout: d.allowUnrated && unratedNeedsCheckout,
    requiredRatings: [...new Set([...d.requiredRatings, ...(typeRating ? [typeRating] : [])])],
  }));

const localDateTime = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "dateTimeInvalid");

/** An owner's calendar block (SRC-5). Times are local to the aircraft's home base. */
export const calendarBlockSchema = z
  .object({
    aircraftId: z.uuid(),
    kind: z.enum(["owner_use", "maintenance"], "invalid"),
    from: localDateTime,
    to: localDateTime,
    note: optionalText(200, "textTooLong").optional().default(null),
  })
  .refine((d) => d.to > d.from, { path: ["to"], error: "endBeforeStart" });

/** Hobbs/tach the owner records between rentals (BKG-7); the time is entered in UTC. */
export const meterReadingSchema = z
  .object({
    aircraftId: z.uuid(),
    readAt: localDateTime,
    hobbs: optionalNumber(0, 999999),
    tach: optionalNumber(0, 999999),
    note: optionalText(200, "textTooLong").optional().default(null),
  })
  .refine((d) => d.hobbs !== null || d.tach !== null, { path: ["hobbs"], error: "meterRequired" });
