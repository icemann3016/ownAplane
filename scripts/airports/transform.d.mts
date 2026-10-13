export const IMPORTED_TYPES: Set<string>;
export function shouldImport(record: Record<string, string>, continent?: string): boolean;
export function toAirportRow(
  record: Record<string, string>,
  timezoneFor: (latitude: number, longitude: number) => string,
): {
  ident: string;
  type: string;
  name: string;
  icao_code: string | null;
  iata_code: string | null;
  gps_code: string | null;
  local_code: string | null;
  municipality: string | null;
  country: string;
  region: string | null;
  latitude: number;
  longitude: number;
  elevation_ft: number | null;
  timezone: string;
  keywords: string | null;
};
export type RunwaySurface =
  "asphalt" | "concrete" | "grass" | "gravel" | "dirt" | "sand" | "water" | "other";
export function surfaceOf(raw: string | undefined): RunwaySurface;
export function toRunwayRow(record: Record<string, string>): {
  airport_ident: string;
  designator: string;
  length_m: number | null;
  width_m: number | null;
  surface: RunwaySurface;
  lighted: boolean;
} | null;
export function toFrequencyRow(record: Record<string, string>): {
  airport_ident: string;
  type: string;
  description: string | null;
  mhz: number;
} | null;
