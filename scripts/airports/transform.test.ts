import { readFileSync } from "node:fs";
import path from "node:path";

import { parse } from "csv-parse/sync";
import { describe, expect, it } from "vitest";

import {
  shouldImport,
  surfaceOf,
  toAirportRow,
  toFrequencyRow,
  toRunwayRow,
} from "./transform.mjs";

const records: Record<string, string>[] = parse(
  readFileSync(path.join(import.meta.dirname, "../../tests/fixtures/airports.csv")),
  { columns: true },
);

describe("airport import", () => {
  it("keeps European airfields and skips heliports, closed fields and other continents", () => {
    const kept = records.filter((r) => shouldImport(r)).map((r) => r.ident);
    expect(kept).toContain("LBSF");
    expect(kept).toContain("BG-0004"); // small airfield without ICAO code
    expect(kept).not.toContain("AD-0001"); // heliport
    expect(kept).not.toContain("AD-0002"); // closed
    expect(kept).not.toContain("KJFK"); // North America
  });

  it("maps a record to a table row with a time zone", () => {
    const sofia = records.find((r) => r.ident === "LBSF")!;
    const row = toAirportRow(sofia, () => "Europe/Sofia");
    expect(row).toMatchObject({
      ident: "LBSF",
      icao_code: "LBSF",
      iata_code: "SOF",
      country: "BG",
      municipality: "Sofia",
      timezone: "Europe/Sofia",
    });
    expect(row.latitude).toBeCloseTo(42.69, 1);
    expect(Number.isInteger(row.elevation_ft)).toBe(true);
  });

  it("turns empty fields into null", () => {
    const strip = records.find((r) => r.ident === "BG-0004")!;
    const row = toAirportRow(strip, () => "Europe/Sofia");
    expect(row.icao_code).toBeNull();
    expect(row.iata_code).toBeNull();
  });

  it("reads runways in metres with our surfaces, skipping closed and unnamed ones", () => {
    const base = { airport_ident: "LBSF", lighted: "1", closed: "0" };
    expect(
      toRunwayRow({
        ...base,
        le_ident: "09",
        he_ident: "27",
        length_ft: "11811",
        width_ft: "147",
        surface: "ASP",
      }),
    ).toEqual({
      airport_ident: "LBSF",
      designator: "09/27",
      length_m: 3600,
      width_m: 45,
      surface: "asphalt",
      lighted: true,
    });
    expect(toRunwayRow({ ...base, le_ident: "09", he_ident: "27", closed: "1" })).toBeNull();
    expect(toRunwayRow({ ...base, le_ident: "", he_ident: "" })).toBeNull();
    expect(toRunwayRow({ ...base, le_ident: "H1", length_ft: "", width_ft: "x" })).toMatchObject({
      designator: "H1",
      length_m: null,
      width_m: null,
    });
    expect(
      ["TURF-G", "GRS", "CONC", "GRVL", "EARTH", "WATER", "ASPH/ CONC", "PIÇARRA", "UNK", ""].map(
        surfaceOf,
      ),
    ).toEqual([
      "grass",
      "grass",
      "concrete",
      "gravel",
      "dirt",
      "water",
      "asphalt",
      "gravel",
      "other",
      "other",
    ]);
  });

  it("reads frequencies", () => {
    expect(
      toFrequencyRow({
        airport_ident: "LBSF",
        type: "twr",
        description: "Sofia Tower",
        frequency_mhz: "118.1",
      }),
    ).toEqual({ airport_ident: "LBSF", type: "TWR", description: "Sofia Tower", mhz: 118.1 });
    expect(toFrequencyRow({ airport_ident: "X", type: "", frequency_mhz: "118.1" })).toBeNull();
    expect(toFrequencyRow({ airport_ident: "X", type: "A/G", frequency_mhz: "" })).toBeNull();
  });
});
