// What an airfield's profile can hold (APT-1, M16 step 2). Shared by forms, pages and the API.

export const SERVICES = [
  "apron_parking",
  "hangar",
  "tie_downs",
  "handling",
  "customs",
  "immigration",
  "maintenance",
  "catering",
  "transport",
  "restaurant",
  "accommodation",
  "briefing_room",
] as const;
export type Service = (typeof SERVICES)[number];

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

export const FEE_KINDS = ["landing", "parking", "hangar", "other"] as const;
export const FEE_UNITS = ["landing", "night", "day", "hour", "once"] as const;

/** ISO weekdays, Monday first. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
