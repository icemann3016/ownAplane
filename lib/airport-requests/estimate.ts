import type { ServiceCategory, ServiceUnit } from "@/lib/airport-profile/catalog";

// What a pilot can tick in a request (Zlati, 2026-10-13), the price that applies to their
// aircraft, a sensible quantity, and a rough total. Pure: shared by the form, the request page
// and the movements board.

export type PricedService = {
  id: string;
  category: ServiceCategory;
  label: string | null;
  fuelType: string | null;
  maxMtomKg: number | null;
  price: number | null;
  unit: ServiceUnit;
  note?: string | null;
};

/** One thing to tick: a kind of service (with its name or fuel) and its weight bands. */
export type ServiceOption = {
  key: string;
  category: ServiceCategory;
  label: string | null;
  fuelType: string | null;
  /** Lightest first; a band without a weight last. */
  bands: PricedService[];
};

/** The airfield's list as options to tick, in the list's order. */
export function serviceOptions(services: PricedService[]): ServiceOption[] {
  const options = new Map<string, ServiceOption>();
  for (const s of services) {
    const key = `${s.category}|${s.label ?? ""}|${s.fuelType ?? ""}`;
    const option = options.get(key) ?? {
      key,
      category: s.category,
      label: s.label,
      fuelType: s.fuelType,
      bands: [],
    };
    option.bands.push(s);
    options.set(key, option);
  }
  for (const o of options.values()) {
    o.bands.sort((a, b) => (a.maxMtomKg ?? Infinity) - (b.maxMtomKg ?? Infinity));
  }
  return [...options.values()];
}

/**
 * The line that applies to an aircraft: the lightest band it fits in (a line without a weight
 * fits all). Without the MTOM, the line without a weight, else the lightest band (`exact` false).
 * Null when the aircraft is heavier than every band.
 */
export function bandFor(
  option: ServiceOption,
  mtomKg: number | null,
): { service: PricedService; exact: boolean } | null {
  if (mtomKg === null) {
    const any = option.bands.find((b) => b.maxMtomKg === null);
    if (any) return { service: any, exact: true };
    const first = option.bands[0];
    return first ? { service: first, exact: option.bands.length === 1 } : null;
  }
  const fits = option.bands.find((b) => b.maxMtomKg === null || b.maxMtomKg >= mtomKg);
  return fits ? { service: fits, exact: true } : null;
}

const DAY = 86_400_000;
const utcDay = (d: Date) => Math.floor(d.getTime() / DAY);

/**
 * A quantity that fits the trip: one per landing or movement, nights/days/hours on the ground
 * between arrival and departure, the people on board; null for litres (the pilot says how much).
 */
export function defaultQuantity(
  unit: ServiceUnit,
  trip: { arrivalAt: Date | null; departureAt: Date | null; pob: number },
): number | null {
  const { arrivalAt: arr, departureAt: dep } = trip;
  switch (unit) {
    case "movement":
      return (arr ? 1 : 0) + (dep ? 1 : 0) || 1;
    case "night":
      return arr && dep ? Math.max(1, utcDay(dep) - utcDay(arr)) : 1;
    case "day":
      return arr && dep ? utcDay(dep) - utcDay(arr) + 1 : 1;
    case "hour":
      return arr && dep ? Math.max(1, Math.ceil((dep.getTime() - arr.getTime()) / 3_600_000)) : 1;
    case "pax":
      return Math.max(1, trip.pob);
    case "litre":
      return null;
    default:
      return 1;
  }
}

/** Rough total of the priced lines, to the cent; lines "on request" are counted apart. */
export function estimate(lines: { price: number | null; quantity: number }[]) {
  let total = 0;
  let onRequest = 0;
  for (const l of lines) {
    if (l.price === null) onRequest += 1;
    else total += l.price * l.quantity;
  }
  return { total: Math.round(total * 100) / 100, onRequest };
}
