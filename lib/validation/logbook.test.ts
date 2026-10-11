import { describe, expect, it } from "vitest";

import { logbookEntrySchema, logbookValuesSchema } from "./logbook";

const issues = (r: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) => Object.fromEntries((r.error?.issues ?? []).map((i) => [i.path.join("."), i.message]));

describe("logbook entry validation (LOG-1)", () => {
  it("reads the form's durations and names what's wrong", () => {
    const r = logbookEntrySchema.safeParse({
      kind: "flight",
      date: "2026-05-01",
      departurePlace: "LBSF",
      arrivalPlace: " ",
      aircraftType: "C172",
      registration: "LZ-ABC",
      totalMinutes: "1:10",
      picName: "Me",
      picMinutes: "1:20",
      seMinutes: "x",
    });
    expect(issues(r)).toEqual({ seMinutes: "durationInvalid" });
    const r2 = logbookEntrySchema.safeParse({
      kind: "flight",
      date: "2999-01-01",
      departurePlace: "LBSF",
      arrivalPlace: " ",
      aircraftType: "C172",
      registration: "LZ-ABC",
      totalMinutes: "1:10",
      picName: "Me",
      picMinutes: "1:20",
    });
    expect(issues(r2)).toEqual({
      date: "dateInFuture",
      arrivalPlace: "fieldRequired",
      picMinutes: "moreThanTotal",
    });
  });

  it("keeps only the columns of the kind", () => {
    const fstd = logbookEntrySchema.parse({
      kind: "fstd",
      date: "2026-05-01",
      fstdType: "ALSIM AL42",
      fstdMinutes: "2:00",
      departurePlace: "LBSF",
      totalMinutes: "1:00",
    });
    expect(fstd).toMatchObject({ fstdMinutes: 120, departurePlace: null, totalMinutes: null });
    const flight = logbookValuesSchema.parse({
      kind: "flight",
      date: "2026-05-01",
      departurePlace: "LBSF",
      arrivalPlace: "LBPD",
      aircraftType: "C172",
      registration: "LZ-ABC",
      totalMinutes: 70,
      picName: "Me",
      fstdMinutes: 30,
    });
    expect(flight).toMatchObject({ totalMinutes: 70, picMinutes: null, fstdMinutes: null });
  });
});
