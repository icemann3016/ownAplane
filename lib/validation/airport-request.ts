import { z } from "zod";

import { registrationSchema } from "@/lib/validation/aircraft";

// A pilot's request to an airfield (APT-2/3). Times are UTC. Messages are keys in
// messages/*.json → "validation".

export const REQUEST_PURPOSES = ["private", "training", "business", "other"] as const;

const utcDateTime = z
  .string()
  .trim()
  .optional()
  .default("")
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v), "dateTimeInvalid")
  .transform((v) => (v === "" ? null : new Date(`${v}:00Z`)));
const airfield = z
  .string()
  .trim()
  .max(20, "airportUnknown")
  .optional()
  .default("")
  .transform((v) => v || null);

export const airportRequestSchema = z
  .object({
    bookingId: z
      .string()
      .optional()
      .default("")
      .transform((v) => v || null)
      .pipe(z.uuid().nullable()),
    registration: registrationSchema,
    aircraftType: z
      .string()
      .trim()
      .toUpperCase()
      .optional()
      .default("")
      .refine((v) => v === "" || /^[A-Z0-9]{2,4}$/.test(v), "aircraftTypeInvalid")
      .transform((v) => v || null),
    mtomKg: z
      .string()
      .trim()
      .optional()
      .default("")
      .refine((v) => v === "" || (/^\d+$/.test(v) && +v >= 100 && +v <= 100000), "numberInvalid")
      .transform((v) => (v === "" ? null : Number(v))),
    arriving: z.boolean(),
    departing: z.boolean(),
    arrivalAt: utcDateTime,
    fromIdent: airfield,
    departureAt: utcDateTime,
    toIdent: airfield,
    pob: z.coerce.number("numberInvalid").int("numberInvalid").min(1, "numberInvalid").max(20),
    purpose: z.enum(REQUEST_PURPOSES, "invalid"),
    other: z
      .string()
      .trim()
      .max(1000, "textTooLong")
      .optional()
      .default("")
      .transform((v) => v || null),
    services: z
      .array(
        z.object({
          serviceId: z.uuid(),
          quantity: z.number("numberInvalid").positive("numberInvalid").max(99999),
        }),
      )
      .max(30),
  })
  .superRefine((d, ctx) => {
    const need = (ok: unknown, path: string, message: string) => {
      if (!ok) ctx.addIssue({ code: "custom", path: [path], message });
    };
    need(d.arriving || d.departing, "arriving", "arrivalOrDeparture");
    if (d.arriving) {
      need(d.arrivalAt, "arrivalAt", "fieldRequired");
      need(d.fromIdent, "fromIdent", "airportUnknown");
    }
    if (d.departing) {
      need(d.departureAt, "departureAt", "fieldRequired");
      need(d.toIdent, "toIdent", "airportUnknown");
    }
    if (d.arriving && d.departing && d.arrivalAt && d.departureAt) {
      need(d.departureAt > d.arrivalAt, "departureAt", "endBeforeStart");
    }
  })
  .transform(({ arriving, departing, ...d }) => ({
    ...d,
    arrivalAt: arriving ? d.arrivalAt : null,
    fromIdent: arriving ? d.fromIdent : null,
    departureAt: departing ? d.departureAt : null,
    toIdent: departing ? d.toIdent : null,
  }));
export type AirportRequestInput = z.output<typeof airportRequestSchema>;

/** The airfield's answer (APT-4). */
export const requestAnswerSchema = z.object({
  decision: z.enum(["approve", "decline"], "invalid"),
  pprNumber: z
    .string()
    .trim()
    .max(40, "textTooLong")
    .optional()
    .default("")
    .transform((v) => v || null),
  conditions: z
    .string()
    .trim()
    .max(500, "textTooLong")
    .optional()
    .default("")
    .transform((v) => v || null),
  note: z
    .string()
    .trim()
    .max(500, "textTooLong")
    .optional()
    .default("")
    .transform((v) => v || null),
});
export type RequestAnswerInput = z.output<typeof requestAnswerSchema>;
