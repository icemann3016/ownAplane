// What an airfield's profile can hold (APT-1, M16 step 2). Shared by forms, pages and the API.

export const RUNWAY_SURFACES = [
  "asphalt",
  "concrete",
  "grass",
  "gravel",
  "dirt",
  "sand",
  "water",
  "other",
] as const;

/** What an airfield can offer, in the order pilots see them (Zlati, 2026-10-13). */
export const SERVICE_CATEGORIES = [
  "landing",
  "ground_handling",
  "pax_handling",
  "parking_apron",
  "parking_hangar",
  "customs",
  "fuel",
  "oil",
  "other",
] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const SERVICE_UNITS = [
  "landing",
  "movement",
  "night",
  "day",
  "hour",
  "pax",
  "litre",
  "once",
] as const;
export type ServiceUnit = (typeof SERVICE_UNITS)[number];

/** The usual unit of each kind of service, picked first in the form. */
export const DEFAULT_UNIT: Record<ServiceCategory, ServiceUnit> = {
  landing: "landing",
  ground_handling: "movement",
  pax_handling: "pax",
  parking_apron: "night",
  parking_hangar: "night",
  customs: "once",
  fuel: "litre",
  oil: "litre",
  other: "once",
};

/** Kinds usually priced by the aircraft's weight (one line per MTOM band). */
export const BY_WEIGHT: readonly ServiceCategory[] = [
  "landing",
  "ground_handling",
  "parking_apron",
  "parking_hangar",
];

/** ISO weekdays, Monday first. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
