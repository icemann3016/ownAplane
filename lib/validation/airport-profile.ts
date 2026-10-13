import { z } from "zod";

import { CURRENCIES } from "@/lib/aircraft/catalog";
import {
  RUNWAY_SURFACES,
  SERVICE_CATEGORIES,
  SERVICE_UNITS,
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

export const serviceSchema = z
  .object({
    category: z.enum(SERVICE_CATEGORIES, "invalid"),
    label: optionalText(80),
    fuelType: z
      .string()
      .optional()
      .default("")
      .transform((v) => v || null)
      .pipe(z.enum(FUEL_TYPES, "invalid").nullable()),
    maxMtomKg: wholeNumber(1, 100000),
    price: z
      .string()
      .trim()
      .optional()
      .default("")
      .refine((v) => v === "" || /^\d{1,5}([.,]\d{1,3})?$/.test(v), "priceInvalid")
      .transform((v) => (v === "" ? null : Number(v.replace(",", ".")))),
    unit: z.enum(SERVICE_UNITS, "invalid"),
    note: optionalText(200),
  })
  .refine((d) => d.category !== "other" || d.label, { path: ["label"], error: "fieldRequired" })
  .refine((d) => d.category !== "fuel" || d.fuelType, { path: ["fuelType"], error: "fieldRequired" })
  .transform((d) => ({ ...d, fuelType: d.category === "fuel" ? d.fuelType : null }));
export type ServiceInput = z.output<typeof serviceSchema>;
