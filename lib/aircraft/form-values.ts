import type { Aircraft } from "@/lib/db/schema";
import { kgToMass, litresToVolume, type UnitSystem } from "@/lib/domain/units";

const str = (v: string | number | null | undefined) =>
  v === null || v === undefined ? "" : String(v);
const box = (v: boolean) => (v ? "on" : "");

/** An aircraft as form values (strings, quantities in the user's units). */
export function aircraftFormValues(a: Aircraft, units: UnitSystem): Record<string, string> {
  return {
    id: a.id,
    registration: a.registration,
    category: a.category,
    manufacturer: a.manufacturer,
    model: a.model,
    typeDesignator: a.typeDesignator,
    year: str(a.year),
    seats: str(a.seats),
    engine: str(a.engine),
    fuelType: a.fuelType,
    fuelBurn: a.fuelBurnLph === null ? "" : str(litresToVolume(a.fuelBurnLph, units)),
    cruiseKt: str(a.cruiseKt),
    usefulLoad: a.usefulLoadKg === null ? "" : str(kgToMass(a.usefulLoadKg, units)),
    mtom: a.mtomKg === null ? "" : str(kgToMass(a.mtomKg, units)),
    enduranceH: str(a.enduranceH),
    avionics: str(a.avionics),
    autopilot: box(a.autopilot),
    transponder: a.transponder,
    nightVfr: box(a.nightVfr),
    ifr: box(a.ifr),
    description: str(a.description),
    pricePerHour: str(a.pricePerHour),
    weekendPricePerHour: str(a.weekendPricePerHour),
    currency: a.currency,
    priceBasis: a.priceBasis,
    timeBasis: a.timeBasis,
    minHoursPerDay: str(a.minHoursPerDay),
    oilUnit: a.oilUnit,
    cancellationPolicy: a.cancellationPolicy,
  };
}
