import { z } from "zod";

import { CATEGORIES, PRICE_BASES } from "@/lib/aircraft/catalog";
import { RADII_KM, SORTS, type SearchFilters } from "@/lib/validation/search";

// Request inputs of the API (plan §4.9). Unlike the website's lenient search links, invalid
// values are reported (400) instead of ignored. Also the source of the OpenAPI description.

const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1")
  .optional();
const instant = z.iso.datetime({ offset: true });

export const airportQuery = z.object({
  q: z.string().trim().min(2).max(64).describe("ICAO code, name or town"),
  limit: z.coerce.number().int().min(1).max(25).default(10),
});

export const aircraftSearchQuery = z
  .object({
    airport: z.string().trim().min(2).max(10).optional().describe("Airfield ident, e.g. LBSF"),
    radius: z.coerce
      .number()
      .refine((r) => (RADII_KM as readonly number[]).includes(r), {
        message: `One of ${RADII_KM.join(", ")}`,
      })
      .default(100)
      .describe("km around the airfield"),
    from: instant
      .optional()
      .describe("Start of the rental (ISO 8601); with `to`, only free aircraft"),
    to: instant.optional(),
    category: z.enum(CATEGORIES).optional(),
    seats: z.coerce.number().int().min(1).max(20).optional(),
    maxPrice: z.coerce.number().positive().max(99999).optional(),
    fuel: z.enum(PRICE_BASES).optional().describe("wet = fuel included"),
    night: bool,
    ifr: bool,
    avionics: z.string().trim().min(1).max(40).optional(),
    eligible: bool.describe("Only aircraft the signed-in pilot may rent"),
    sort: z.enum(SORTS).default("distance"),
  })
  .refine((q) => !q.from === !q.to && (!q.from || new Date(q.to!) > new Date(q.from)), {
    path: ["to"],
    message: "Give both from and to, with to after from",
  });

/** API search query → the filters the website's search uses (UTC "YYYY-MM-DDTHH:MM"). */
export function toSearchFilters(q: z.infer<typeof aircraftSearchQuery>): SearchFilters {
  const minute = (v?: string) => (v ? new Date(v).toISOString().slice(0, 16) : undefined);
  return {
    ...q,
    from: minute(q.from),
    to: minute(q.to),
    night: q.night ?? false,
    ifr: q.ifr ?? false,
    eligible: q.eligible ?? false,
  };
}

// --- Calendar sync for partner systems (SYN-4) ---

const DAY = 24 * 60 * 60 * 1000;

export const busyWindowQuery = z
  .object({
    from: instant.optional().describe("Default: now"),
    to: instant.optional().describe("Default: 90 days after `from`; at most 400 days"),
  })
  .transform((q) => {
    const from = q.from ? new Date(q.from) : new Date();
    const to = q.to ? new Date(q.to) : new Date(from.getTime() + 90 * DAY);
    return { from, to };
  })
  .refine((w) => w.to > w.from && w.to.getTime() - w.from.getTime() <= 400 * DAY, {
    path: ["to"],
    message: "to must be after from, at most 400 days later",
  });

const busyTimes = z
  .object({
    start: instant.describe("ISO 8601 with offset, e.g. 2026-10-20T08:00:00Z"),
    end: instant,
  })
  .refine((b) => new Date(b.end) > new Date(b.start), {
    path: ["end"],
    message: "end must be after start",
  });

export const pushBusyBody = busyTimes;

export const pushAllBody = z.object({
  busy: z
    .array(
      z
        .object({
          id: z.union([z.string().min(1).max(200), z.number()]).transform(String),
          start: instant,
          end: instant,
        })
        .refine((b) => new Date(b.end) > new Date(b.start), {
          path: ["end"],
          message: "end must be after start",
        }),
    )
    .max(2000)
    .describe("Everything your system has for this aircraft; anything missing is removed"),
});

export const externalId = z.string().min(1).max(200).describe("Your system's id of the booking");
