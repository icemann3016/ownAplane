import { describe, expect, it } from "vitest";

import { lineValues, totalDifferences, writtenTotals } from "./logbook";

const blank = {
  line: 1,
  date: "2024-05-12",
  departurePlace: null,
  departureTime: null,
  arrivalPlace: null,
  arrivalTime: null,
  aircraftType: null,
  registration: null,
  seTime: null,
  meTime: null,
  mpTime: null,
  totalTime: null,
  picName: null,
  landingsDay: null,
  landingsNight: null,
  nightTime: null,
  ifrTime: null,
  picTime: null,
  copilotTime: null,
  dualTime: null,
  instructorTime: null,
  fstdType: null,
  fstdTime: null,
  remarks: null,
};

describe("a line read from a logbook spread", () => {
  it("becomes draft values with minutes and clean times", () => {
    const v = lineValues(
      {
        ...blank,
        departurePlace: " LBSF ",
        departureTime: "8.05",
        arrivalPlace: "LBPD",
        arrivalTime: "0910",
        aircraftType: "C172",
        registration: "LZ-ABC",
        seTime: "1:05",
        totalTime: "1:05",
        picName: "SELF",
        landingsDay: 1,
        picTime: "1.1",
      },
      "2026-10-11",
    );
    expect(v).toMatchObject({
      kind: "flight",
      departurePlace: "LBSF",
      departureTime: "08:05",
      arrivalTime: "09:10",
      seMinutes: 65,
      totalMinutes: 65,
      picMinutes: 66,
      landingsDay: 1,
    });
  });

  it("recognises simulator lines and skips lines without a usable date", () => {
    expect(
      lineValues({ ...blank, fstdType: "ALSIM", fstdTime: "2:00" }, "2026-10-11"),
    ).toMatchObject({ kind: "fstd", fstdMinutes: 120 });
    expect(lineValues({ ...blank, date: null }, "2026-10-11")).toBeNull();
    expect(lineValues({ ...blank, date: "2030-01-01" }, "2026-10-11")).toBeNull();
    expect(lineValues({ ...blank, totalTime: "30:00" }, "2026-10-11")!.totalMinutes).toBeNull();
  });
});

describe("the page totals check", () => {
  it("compares the lines with what is written at the bottom", () => {
    const written = writtenTotals({
      seTime: null,
      meTime: null,
      mpTime: null,
      totalTime: "2:40",
      landingsDay: 3,
      landingsNight: null,
      nightTime: null,
      ifrTime: null,
      picTime: "2:30",
      copilotTime: null,
      dualTime: null,
      instructorTime: null,
      fstdTime: null,
    });
    expect(written).toEqual({ totalMinutes: 160, landingsDay: 3, picMinutes: 150 });
    const lines = [
      { totalMinutes: 70, picMinutes: 70, landingsDay: 1 },
      { totalMinutes: 80, picMinutes: 80, landingsDay: 2 },
    ].map((l) => ({ ...lineValues(blank, "2026-10-11")!, ...l }));
    expect(totalDifferences(lines, written)).toEqual([
      { column: "totalMinutes", written: 160, lines: 150 },
    ]);
    expect(totalDifferences(lines, null)).toEqual([]);
    expect(writtenTotals(null)).toBeNull();
  });
});
