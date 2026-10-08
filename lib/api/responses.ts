import { z } from "zod";

import {
  CANCELLATION_POLICIES,
  CATEGORIES,
  FUEL_TYPES,
  OIL_UNITS,
  PRICE_BASES,
  TIME_BASES,
  TRANSPONDERS,
} from "@/lib/aircraft/catalog";
import { aircraftStatus, appRole, bookingPurpose, bookingStatus } from "@/lib/db/schema";

// Shapes of API responses (plan §4.9). The DTO functions (dto.ts) return exactly these types, so
// TypeScript keeps them in step, and the OpenAPI description (openapi.ts) is generated from them.

const time = z.iso.datetime().describe("ISO 8601, UTC");
const id = z.uuid();
const url = z.url().nullable();
const rating = z.object({ average: z.number().nullable(), count: z.number().int() });

export const errorBody = z.object({
  error: z.object({
    code: z.string().describe("Stable machine-readable code, e.g. not_found"),
    message: z.string().describe("For developers (English)"),
    fields: z.record(z.string(), z.array(z.string())).optional().describe("Per-field errors"),
  }),
});

export const airport = z.object({
  ident: z.string().describe("OurAirports ident: the ICAO code when there is one"),
  code: z.string().describe("Code to show: ICAO, else the local id"),
  iataCode: z.string().nullable(),
  name: z.string(),
  municipality: z.string().nullable(),
  country: z.string(),
  type: z.string(),
  timezone: z.string(),
});

export const me = z.object({
  id,
  email: z.email(),
  emailVerified: z.boolean(),
  displayName: z.string(),
  bio: z.string().nullable(),
  avatarUrl: url,
  homeAirportIdent: z.string().nullable(),
  roles: z.array(z.enum(appRole.enumValues)),
  locale: z.string(),
  units: z.string().describe("metric | imperial (display preference only)"),
  phone: z.string().nullable(),
  rating: z.object({ asPilot: rating, asOwner: rating }),
  createdAt: time.nullable(),
});

const price = z.object({
  perHour: z.number().nullable(),
  currency: z.string(),
  basis: z.enum(PRICE_BASES).describe("wet = fuel included"),
});

export const aircraftSummary = z.object({
  id,
  registration: z.string(),
  manufacturer: z.string(),
  model: z.string(),
  category: z.enum(CATEGORIES),
  seats: z.number().int(),
  price,
  rating,
  homeAirport: z.object({
    ident: z.string(),
    code: z.string(),
    name: z.string(),
    municipality: z.string().nullable(),
    latitude: z.number(),
    longitude: z.number(),
  }),
  distanceKm: z.number().nullable().describe("From the search airfield"),
  coverPhotoUrl: url,
});

export const aircraftDetail = z.object({
  id,
  status: z.enum(aircraftStatus.enumValues),
  registration: z.string(),
  manufacturer: z.string(),
  model: z.string(),
  typeDesignator: z.string(),
  year: z.number().int().nullable(),
  category: z.enum(CATEGORIES),
  seats: z.number().int(),
  engine: z.string().nullable(),
  fuelType: z.enum(FUEL_TYPES),
  performance: z.object({
    fuelBurnLitresPerHour: z.number().nullable(),
    cruiseKt: z.number().nullable(),
    usefulLoadKg: z.number().nullable(),
    enduranceHours: z.number().nullable(),
  }),
  equipment: z.object({
    avionics: z.string().nullable(),
    autopilot: z.boolean(),
    transponder: z.enum(TRANSPONDERS),
    nightVfr: z.boolean(),
    ifr: z.boolean(),
  }),
  description: z.string().nullable(),
  homeAirport: airport.nullable(),
  price: price.extend({
    weekendPerHour: z.number().nullable(),
    timeBasis: z.enum(TIME_BASES),
    minHoursPerDay: z.number().nullable(),
  }),
  oilUnit: z.enum(OIL_UNITS),
  cancellationPolicy: z.enum(CANCELLATION_POLICIES),
  rating,
  owner: z.object({ id, displayName: z.string(), avatarUrl: url, rating }),
  photos: z.array(z.string()),
});

const aircraftRef = z.object({
  id,
  registration: z.string(),
  manufacturer: z.string(),
  model: z.string(),
});
const status = z.enum(bookingStatus.enumValues);
const role = z.enum(["pilot", "owner", "admin"]).describe("The signed-in user's side");

export const bookingSummary = z.object({
  id,
  status,
  role,
  from: time.nullable(),
  to: time.nullable(),
  departureIdent: z.string(),
  arrivalIdent: z.string(),
  estimate: z.object({ amount: z.number(), currency: z.string() }),
  expiresAt: time.nullable().describe("When an unanswered request expires"),
  aircraft: aircraftRef,
});

const person = z.object({ id, displayName: z.string(), avatarUrl: url }).nullable();

export const bookingDetail = z.object({
  id,
  status,
  role,
  from: time.nullable(),
  to: time.nullable(),
  route: z.array(z.object({ ident: z.string(), code: z.string(), name: z.string() })),
  purpose: z.enum(bookingPurpose.enumValues),
  passengers: z.number().int(),
  plannedHours: z.number(),
  message: z.string().nullable(),
  price: z.object({
    perHour: z.number(),
    weekendPerHour: z.number().nullable(),
    minHoursPerDay: z.number().nullable(),
    currency: z.string(),
    basis: z.enum(PRICE_BASES),
    timeBasis: z.enum(TIME_BASES),
    estimate: z.number(),
  }),
  cancellationPolicy: z.enum(CANCELLATION_POLICIES),
  checkoutRequired: z.boolean(),
  expiresAt: time.nullable(),
  respondedAt: time.nullable(),
  ownerNote: z.string().nullable(),
  proposal: z.object({ from: time.nullable(), to: time.nullable() }).nullable(),
  cancellation: z
    .object({
      at: time.nullable(),
      byId: id.nullable(),
      reason: z.string().nullable(),
      late: z.boolean(),
    })
    .nullable(),
  aircraft: aircraftRef.extend({ typeDesignator: z.string() }),
  pilot: person,
  owner: person,
  history: z.array(z.object({ type: z.string(), actorId: id.nullable(), at: time.nullable() })),
  createdAt: time.nullable(),
});

export type Me = z.infer<typeof me>;
export type Airport = z.infer<typeof airport>;
export type AircraftSummary = z.infer<typeof aircraftSummary>;
export type AircraftDetail = z.infer<typeof aircraftDetail>;
export type BookingSummary = z.infer<typeof bookingSummary>;
export type BookingDetail = z.infer<typeof bookingDetail>;
