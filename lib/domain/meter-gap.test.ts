import { describe, expect, it } from "vitest";

import { type MeterPoint, meterFindings } from "./meter-gap";

const day = (d: number) => new Date(Date.UTC(2026, 9, d, 12));
const checkout = day(20);

describe("meterFindings", () => {
  const lastRental: MeterPoint = { at: day(12), hobbs: 1234.5, tach: 1001.2, source: "log" };

  it("finds nothing when the rental starts where the last one ended (± a tenth)", () => {
    expect(meterFindings({ hobbs: 1234.5, tach: 1001.3 }, [lastRental], checkout)).toEqual([]);
    expect(meterFindings({ hobbs: null, tach: null }, [lastRental], checkout)).toEqual([]);
    expect(meterFindings({ hobbs: 1300, tach: null }, [], checkout)).toEqual([]);
  });

  it("reports flying in between as a gap and a lower start as below", () => {
    expect(meterFindings({ hobbs: 1235.3, tach: 1000 }, [lastRental], checkout)).toEqual([
      {
        meter: "hobbs",
        type: "gap",
        start: 1235.3,
        known: 1234.5,
        knownAt: day(12),
        source: "log",
        diff: 0.8,
      },
      {
        meter: "tach",
        type: "below",
        start: 1000,
        known: 1001.2,
        knownAt: day(12),
        source: "log",
        diff: -1.2,
      },
    ]);
  });

  it("starts from the owner's later reading, per meter, and ignores later points", () => {
    const reading: MeterPoint = { at: day(15), hobbs: 1235.3, tach: null, source: "reading" };
    const future: MeterPoint = { at: day(25), hobbs: 1300, tach: 1100, source: "log" };
    const found = meterFindings(
      { hobbs: 1235.3, tach: 1002 },
      [lastRental, reading, future],
      checkout,
    );
    expect(found).toMatchObject([{ meter: "tach", type: "gap", known: 1001.2, diff: 0.8 }]);
  });
});
