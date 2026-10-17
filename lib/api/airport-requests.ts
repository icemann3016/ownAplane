import "server-only";

import { z } from "zod";

import { isUuid } from "@/lib/aircraft/queries";
import type { ChangeResult, SendError } from "@/lib/airport-requests/ops";
import { getAirportRequest } from "@/lib/airport-requests/queries";
import {
  airportRequestStatus,
  airportServiceCategory,
  airportServiceUnit,
  fuelType,
} from "@/lib/db/schema";
import { registrationSchema } from "@/lib/validation/aircraft";
import { type AirportRequestInput, REQUEST_PURPOSES } from "@/lib/validation/airport-request";
import { ApiError } from "./http";

// Pilots' requests to airfields in the API (APT-2…7): inputs, shapes and errors of this area.
// DTOs: airport-requests-dto.ts; OpenAPI paths: openapi-airport-requests.ts.

const id = z.uuid();
const time = z.iso.datetime().describe("ISO 8601, UTC");
const instant = z.iso.datetime({ offset: true });
const ident = z.string().trim().toUpperCase().min(2).max(20).describe("Airfield ident, e.g. LBSF");
/** Optional text: missing, null or blank is null. */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const airportRequestBody = z
  .object({
    airport: ident.describe("The airfield you ask; it must be on ownAplane"),
    bookingId: id.nullish().describe("One of your bookings this trip belongs to"),
    registration: registrationSchema.describe("e.g. LZ-ABC"),
    aircraftType: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{2,4}$/)
      .nullish()
      .describe("ICAO type designator, e.g. C172"),
    mtomKg: z
      .number()
      .int()
      .min(100)
      .max(100000)
      .nullish()
      .describe("Picks the weight band of services priced by MTOM"),
    arrival: z
      .object({ at: instant, from: ident })
      .nullish()
      .describe("Arriving at the airfield: when and from where"),
    departure: z
      .object({ at: instant, to: ident })
      .nullish()
      .describe("Leaving the airfield: when and where to"),
    pob: z.number().int().min(1).max(20).describe("Persons on board, the pilot included"),
    purpose: z.enum(REQUEST_PURPOSES).default("private"),
    other: text(1000).describe("Anything not on the airfield's list, in your own words"),
    services: z
      .array(
        z.object({
          serviceId: id.describe("From GET /api/v1/airports/{ident}/services"),
          quantity: z
            .number()
            .positive()
            .max(99999)
            .describe("Litres of fuel or oil, nights or hours of parking, passengers…"),
        }),
      )
      .max(30)
      .default([]),
  })
  .superRefine((b, ctx) => {
    if (!b.arrival && !b.departure) {
      ctx.addIssue({ code: "custom", path: ["arrival"], message: "arrivalOrDeparture" });
    }
    if (b.arrival && b.departure && Date.parse(b.departure.at) <= Date.parse(b.arrival.at)) {
      ctx.addIssue({ code: "custom", path: ["departure"], message: "endBeforeStart" });
    }
  });

/** To the minute, like the website's form. */
const minute = (v: string) => new Date(Math.floor(Date.parse(v) / 60_000) * 60_000);

export function toRequestInput(b: z.infer<typeof airportRequestBody>): AirportRequestInput {
  return {
    bookingId: b.bookingId ?? null,
    registration: b.registration,
    aircraftType: b.aircraftType ?? null,
    mtomKg: b.mtomKg ?? null,
    arrivalAt: b.arrival ? minute(b.arrival.at) : null,
    fromIdent: b.arrival?.from ?? null,
    departureAt: b.departure ? minute(b.departure.at) : null,
    toIdent: b.departure?.to ?? null,
    pob: b.pob,
    purpose: b.purpose,
    other: b.other,
    services: b.services,
  };
}

export const requestAnswerBody = z.object({
  decision: z.enum(["approve", "decline"]),
  pprNumber: text(40).describe("With approve: the airfield's PPR number"),
  conditions: text(500).describe("With approve, e.g. Arrive after 10:00 UTC"),
  note: text(500).describe("To the pilot, e.g. why it was declined"),
});

const MAX_DAYS = 62;
export const movementsQuery = z
  .object({
    from: instant.describe("Start (ISO 8601)"),
    to: instant.describe(`End, at most ${MAX_DAYS} days after the start`),
  })
  .refine((q) => Date.parse(q.to) > Date.parse(q.from), {
    path: ["to"],
    message: "endBeforeStart",
  })
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= MAX_DAYS * 86_400_000, {
    path: ["to"],
    message: "rangeTooLong",
  });

export const place = z.object({
  ident: z.string(),
  code: z.string().describe("ICAO code, else the local id"),
  name: z.string(),
  country: z.string(),
});

const serviceFields = {
  category: z.enum(airportServiceCategory.enumValues),
  label: z.string().nullable().describe("The name of an `other` service, or a detail"),
  fuelType: z.enum(fuelType.enumValues).nullable(),
  maxMtomKg: z.number().int().nullable().describe("For aircraft up to this MTOM; null: any"),
  unit: z.enum(airportServiceUnit.enumValues),
};

export const airfieldServices = z.object({
  airport: place,
  currency: z.string().describe("Of the prices"),
  pprRequired: z
    .boolean()
    .describe("Requests wait for the airfield's answer; otherwise they are confirmed at once"),
  pprNoticeHours: z.number().int().nullable(),
  services: z.array(
    z.object({
      id,
      ...serviceFields,
      price: z.number().nullable().describe("null: on request"),
      note: z.string().nullable(),
    }),
  ),
});

const warning = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("closed"),
    at: z.enum(["arrival", "departure"]),
    note: z.string().nullable(),
  }),
  z.object({ kind: z.literal("outside_hours"), at: z.enum(["arrival", "departure"]) }),
  z.object({ kind: z.literal("short_notice"), hours: z.number().describe("Notice asked for") }),
  z.object({ kind: z.literal("customs").describe("Crosses a border without asking for customs") }),
]);

export const airportRequestSummary = z.object({
  id,
  airport: place,
  status: z.enum(airportRequestStatus.enumValues),
  autoConfirmed: z.boolean().describe("Confirmed at once: the airfield doesn't require PPR"),
  registration: z.string(),
  arrivalAt: time.nullable(),
  departureAt: time.nullable(),
});

export const airfieldMovement = z.object({
  id,
  status: z.enum(airportRequestStatus.enumValues),
  autoConfirmed: z.boolean().describe("Confirmed at once: the airfield doesn't require PPR"),
  registration: z.string(),
  aircraftType: z.string().nullable(),
  mtomKg: z.number().int().nullable(),
  pob: z.number().int(),
  purpose: z.enum(REQUEST_PURPOSES),
  arrival: z.object({ at: time, from: place.nullable() }).nullable(),
  departure: z.object({ at: time, to: place.nullable() }).nullable(),
  services: z.array(
    z.object({
      serviceId: id.nullable().describe("null once the airfield removed it from its list"),
      ...serviceFields,
      price: z.number().nullable().describe("When the request was sent; null: on request"),
      quantity: z.number(),
    }),
  ),
  other: z.string().nullable().describe("Asked for in the pilot's words"),
  currency: z.string(),
  estimate: z.object({
    total: z.number().describe("Rough total of the priced services, paid to the airfield"),
    onRequest: z.number().int().describe("Services priced on request, not in the total"),
  }),
  pilot: z.object({ id, displayName: z.string().nullable() }),
  pprNumber: z.string().nullable(),
  conditions: z.string().nullable(),
  airfieldNote: z.string().nullable(),
  answeredAt: time.nullable(),
  createdAt: time,
});

export const airportRequest = airfieldMovement.extend({
  airport: place,
  yourRole: z
    .enum(["pilot", "manager", "staff"])
    .nullable()
    .describe("The pilot who sent it, or the airfield's team"),
  bookingId: id.nullable().describe("The pilot's booking this trip belongs to (pilot only)"),
  answeredBy: z.string().nullable().describe("Who on the airfield's team answered"),
  airfieldContact: z.object({ phone: z.string().nullable(), email: z.string().nullable() }),
  warnings: z
    .array(warning)
    .describe("Never a block: the pilot in command and the airfield decide"),
});

export const myAirfield = z.object({
  airport: place,
  role: z.enum(["manager", "staff"]),
  today: z
    .object({
      arrivals: z.number().int(),
      departures: z.number().int(),
      open: z.number().int().describe("Requests waiting for an answer"),
    })
    .describe("This UTC day"),
});

type ChangeError = Extract<ChangeResult, { ok: false }>["error"];

/** A lib outcome as an API error; `details.reason` is the code apps switch on. */
export function airportRequestError(reason: SendError | ChangeError): ApiError {
  const details = { reason };
  switch (reason) {
    case "not_pilot":
      return new ApiError("forbidden", "Only pilot accounts send requests.", undefined, details);
    case "not_allowed":
      return new ApiError("forbidden", "Not yours to change.", undefined, details);
    case "request_closed":
      return new ApiError("conflict", "The request is closed.", undefined, details);
    case "too_many_requests":
      return new ApiError("rate_limited", "At most 20 requests a day.", undefined, details);
    case "booking_not_yours":
      return new ApiError("validation_failed", reason, { bookingId: [reason] }, details);
    default:
      return new ApiError("bad_request", reason, undefined, details);
  }
}

/** The request as the user may see it, or 404. */
export async function visibleRequest(userId: string, id: string) {
  const view = isUuid(id) ? await getAirportRequest(userId, id) : null;
  if (!view) throw new ApiError("not_found", "No request with this id.");
  return view;
}
