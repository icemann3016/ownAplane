import { z } from "zod";

import { CURRENCIES } from "@/lib/aircraft/catalog";
import {
  FEE_KINDS,
  FEE_UNITS,
  RUNWAY_SURFACES,
  SERVICES,
  WEEKDAYS,
} from "@/lib/airport-profile/catalog";
import { FUEL_TYPES } from "@/lib/aircraft/catalog";

// An airfield's profile (APT-1). Messages are keys in messages/*.json → "validation".

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "textTooLong")
    .optional()
    .default("")
    .transform((v) => v || null);

const wholeNumber = (min: number, max: number) =>
  z
    .string()
    .trim()
    .optional()
    .default("")
    .refine((v) => v === "" || (/^\d+$/.test(v) && +v >= min && +v <= max), "numberInvalid")
    .transform((v) => (v === "" ? null : Number(v)));

export const profileSchema = z
  .object({
    description: optionalText(2000),
    phone: optionalText(40),
    email: z
      .string()
      .trim()
      .optional()
      .default("")
      .refine((v) => v === "" || z.email().safeParse(v).success, "emailInvalid")
      .transform((v) => v || null),
    website: z
      .string()
      .trim()
      .max(300, "textTooLong")
      .optional()
      .default("")
      .refine((v) => v === "" || /^https?:\/\/[^\s]+\.[^\s]+$/.test(v), "invalid")
      .transform((v) => v || null),
    pprRequired: z.boolean(),
    pprNoticeHours: wholeNumber(0, 720),
    currency: z.enum(CURRENCIES, "invalid"),
    services: z.array(z.enum(SERVICES)),
    fuels: z.array(z.enum(FUEL_TYPES)),
  })
  .transform((d) => ({ ...d, pprNoticeHours: d.pprRequired ? d.pprNoticeHours : null }));
export type ProfileInput = z.output<typeof profileSchema>;

const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/, "timeInvalid");

export const hoursSchema = z.object({
  note: optionalText(300),
  hours: z
    .array(
      z
        .object({
          weekday: z.union(WEEKDAYS.map((d) => z.literal(d))),
          opens: clock,
          closes: clock,
        })
        .refine((h) => h.opens < h.closes, { path: ["closes"], error: "timeAfter" }),
    )
    .max(28),
});
export type HoursInput = z.output<typeof hoursSchema>;

export const closureSchema = z
  .object({
    startsOn: z.iso.date("dateInvalid"),
    endsOn: z.iso.date("dateInvalid"),
    note: optionalText(200),
  })
  .refine((d) => d.endsOn >= d.startsOn, { path: ["endsOn"], error: "endBeforeStart" });
export type ClosureInput = z.output<typeof closureSchema>;

export const runwaySchema = z.object({
  designator: z.string().trim().min(1, "fieldRequired").max(20, "textTooLong"),
  lengthM: wholeNumber(1, 10000),
  widthM: wholeNumber(1, 200),
  surface: z.enum(RUNWAY_SURFACES, "invalid"),
  lighted: z.boolean(),
});
export type RunwayInput = z.output<typeof runwaySchema>;

export const frequencySchema = z.object({
  type: z
    .string()
    .trim()
    .min(1, "fieldRequired")
    .max(12, "textTooLong")
    .transform((v) => v.toUpperCase()),
  mhz: z
    .string()
    .trim()
    .refine((v) => /^\d{1,3}(\.\d{1,3})?$/.test(v) && +v > 0 && +v < 1000, "numberInvalid")
    .transform(Number),
  description: optionalText(80),
});
export type FrequencyInput = z.output<typeof frequencySchema>;

export const feeSchema = z.object({
  kind: z.enum(FEE_KINDS, "invalid"),
  label: optionalText(80),
  maxMtomKg: wholeNumber(1, 100000),
  amount: z
    .string()
    .trim()
    .refine((v) => /^\d{1,5}([.,]\d{1,2})?$/.test(v), "priceInvalid")
    .transform((v) => Number(v.replace(",", "."))),
  unit: z.enum(FEE_UNITS, "invalid"),
});
export type FeeInput = z.output<typeof feeSchema>;
