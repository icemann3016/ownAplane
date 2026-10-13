// Pure helpers for the airport import (unit-tested in transform.test.ts).

/** Airfield types we import. Heliports, seaplane bases, balloon ports and closed fields are skipped. */
export const IMPORTED_TYPES = new Set(["large_airport", "medium_airport", "small_airport"]);

/** Keep European airfields of the types above. */
export function shouldImport(record, continent = "EU") {
  return (
    record.continent === continent &&
    IMPORTED_TYPES.has(record.type) &&
    Boolean(record.ident) &&
    record.latitude_deg !== "" &&
    record.longitude_deg !== ""
  );
}

const blankToNull = (value) => {
  const v = (value ?? "").trim();
  return v === "" ? null : v;
};

/** Convert an OurAirports CSV record into a row for the airports table. */
export function toAirportRow(record, timezoneFor) {
  const latitude = Number(record.latitude_deg);
  const longitude = Number(record.longitude_deg);
  const elevation = blankToNull(record.elevation_ft);
  return {
    ident: record.ident.trim(),
    type: record.type,
    name: record.name.trim(),
    icao_code: blankToNull(record.icao_code),
    iata_code: blankToNull(record.iata_code),
    gps_code: blankToNull(record.gps_code),
    local_code: blankToNull(record.local_code),
    municipality: blankToNull(record.municipality),
    country: record.iso_country.trim(),
    region: blankToNull(record.iso_region),
    latitude,
    longitude,
    elevation_ft: elevation === null ? null : Math.round(Number(elevation)),
    timezone: timezoneFor(latitude, longitude),
    keywords: blankToNull(record.keywords),
  };
}

const FEET = 0.3048;

/** OurAirports' free-text runway surface ("ASP", "TURF-G", "GRVL"…) as one of ours. */
export function surfaceOf(raw) {
  const s = (raw ?? "").trim().toUpperCase();
  if (/^CON/.test(s)) return "concrete";
  if (/^(ASP|BIT|PAVED|PEM|TAR|BLACKTOP)/.test(s)) return "asphalt";
  if (/^(GRAVEL|GRVL|GVL|GRV|PIÇARRA)/.test(s)) return "gravel";
  if (/^(TURF|GRS|GRASS|GRE|SOD|G$|G-)/.test(s)) return "grass";
  if (/^(DIRT|EARTH|CLAY|SOIL|LAT|L$)/.test(s)) return "dirt";
  if (/^SAND/.test(s)) return "sand";
  if (/^WAT/.test(s)) return "water";
  return "other";
}

/** Feet → whole metres within [min, max], else null. */
function metres(feet, min, max) {
  const n = Math.round(Number(feet) * FEET);
  return Number.isFinite(n) && n >= min && n <= max && feet !== "" ? n : null;
}

/** A runway record as a row for airport_runways; null for closed or unnamed runways. */
export function toRunwayRow(record) {
  if (record.closed === "1") return null;
  const ends = [blankToNull(record.le_ident), blankToNull(record.he_ident)].filter(Boolean);
  const designator = ends.join("/").slice(0, 20);
  if (!designator) return null;
  return {
    airport_ident: record.airport_ident.trim(),
    designator,
    length_m: metres(record.length_ft, 1, 10000),
    width_m: metres(record.width_ft, 1, 200),
    surface: surfaceOf(record.surface),
    lighted: record.lighted === "1",
  };
}

/** A frequency record as a row for airport_frequencies; null when it has no usable frequency. */
export function toFrequencyRow(record) {
  const mhz = Math.round(Number(record.frequency_mhz) * 1000) / 1000;
  const type = (record.type ?? "").trim().toUpperCase().slice(0, 12);
  if (!type || !Number.isFinite(mhz) || mhz <= 0 || mhz >= 1000) return null;
  return {
    airport_ident: record.airport_ident.trim(),
    type,
    description: blankToNull(record.description)?.slice(0, 80) ?? null,
    mhz,
  };
}
