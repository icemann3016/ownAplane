import { z } from "zod";

import { CATEGORIES, PRICE_BASES } from "@/lib/aircraft/catalog";

export const RADII_KM = [25, 50, 100, 200, 500] as const;
export const SORTS = ["distance", "price", "rating", "newest"] as const;

/** Anything invalid in the URL is simply ignored (search links get shared and edited). */
const lenient = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);
const flag = z
  .string()
  .optional()
  .transform((v) => v === "1" || v === "on" || v === "true")
  .catch(false);
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

/** Search filters from the URL (SRC-1, SRC-2). */
export const searchSchema = z.object({
  airport: lenient(z.string().trim().min(2).max(10)),
  radius: z.coerce
    .number()
    .refine((r) => (RADII_KM as readonly number[]).includes(r))
    .catch(100)
    .default(100),
  from: lenient(localDateTime),
  to: lenient(localDateTime),
  category: lenient(z.enum(CATEGORIES)),
  seats: lenient(z.coerce.number().int().min(1).max(20)),
  maxPrice: lenient(z.coerce.number().positive().max(99999)),
  fuel: lenient(z.enum(PRICE_BASES)),
  night: flag,
  ifr: flag,
  avionics: lenient(z.string().trim().min(1).max(40)),
  eligible: flag,
  sort: z.enum(SORTS).catch("distance").default("distance"),
});

export type SearchFilters = z.infer<typeof searchSchema>;

/** Read filters from Next.js searchParams (arrays keep their first value). */
export function parseSearch(params: Record<string, string | string[] | undefined>): SearchFilters {
  const flat = Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  return searchSchema.parse(Object.fromEntries(Object.entries(flat).filter(([, v]) => v !== "")));
}

/** Filters back to a URL query string: only what differs from the defaults, in a fixed order. */
export function filtersToQuery(f: SearchFilters): string {
  const q = new URLSearchParams();
  if (f.airport) q.set("airport", f.airport);
  if (f.airport && f.radius !== 100) q.set("radius", String(f.radius));
  if (f.from) q.set("from", f.from);
  if (f.to) q.set("to", f.to);
  if (f.category) q.set("category", f.category);
  if (f.seats) q.set("seats", String(f.seats));
  if (f.maxPrice) q.set("maxPrice", String(f.maxPrice));
  if (f.fuel) q.set("fuel", f.fuel);
  for (const key of ["night", "ifr", "eligible"] as const) if (f[key]) q.set(key, "1");
  if (f.avionics) q.set("avionics", f.avionics);
  if (f.sort !== "distance") q.set("sort", f.sort);
  return q.toString();
}

/** A query string from a link or a saved search, read like the search page reads its URL. */
export const parseQuery = (query: string) =>
  parseSearch(Object.fromEntries(new URLSearchParams(query)));
