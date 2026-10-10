import { describe, expect, it } from "vitest";

import { fuelMismatch, type LegForLogChecks, logChecks, type LogCheckInput } from "./log-checks";

const at = (hhmm: string) => new Date(`2026-10-20T${hhmm}:00Z`);

const leg = (over: Partial<LegForLogChecks> = {}): LegForLogChecks => ({
  seq: 1,
  engineStart: at("09:00"),
  engineStop: at("10:00"),
  takeoffAt: at("09:10"),
  landingAt: at("09:50"),
  hobbsStart: 100,
  hobbsEnd: 101,
  tachStart: 80,
  tachEnd: 80.8,
  fuelBeforeL: 120,
  fuelAfterL: 85,
  ...over,
});

const input = (over: Partial<LogCheckInput> = {}): LogCheckInput => ({
  aircraft: { fuelType: "avgas_100ll", fuelBurnLph: 36 },
  booked: { from: at("08:00"), to: at("12:00") },
  nextFrom: null,
  legs: [leg()],
  uplifts: [],
  ...over,
});

describe("fuelMismatch", () => {
  it("flags piston fuel in a Jet A-1 engine and the other way round as dangerous", () => {
    expect(fuelMismatch("avgas_100ll", "jet_a1")).toBe("danger");
    expect(fuelMismatch("jet_a1", "avgas_100ll")).toBe("danger");
    expect(fuelMismatch("mogas", "jet_a1")).toBe("danger");
  });

  it("asks to check the engine approval for a lower grade, accepts the same or a higher one", () => {
    expect(fuelMismatch("avgas_100ll", "ul91")).toBe("caution");
    expect(fuelMismatch("avgas_100ll", "mogas")).toBe("caution");
    expect(fuelMismatch("ul91", "mogas")).toBe("caution");
    expect(fuelMismatch("mogas", "avgas_100ll")).toBeNull();
    expect(fuelMismatch("ul91", "avgas_100ll")).toBeNull();
    expect(fuelMismatch("jet_a1", "jet_a1")).toBeNull();
  });
});

describe("logChecks", () => {
  it("finds nothing in a normal flight", () => {
    expect(logChecks(input())).toEqual([]);
  });

  it("reports each wrong fuel once per airfield", () => {
    const fuel = { kind: "fuel" as const, airportIdent: "LBPD", fuelType: "jet_a1" as const };
    const checks = logChecks(
      input({ uplifts: [fuel, fuel, { kind: "oil", airportIdent: "LBPD", fuelType: null }] }),
    );
    expect(checks).toEqual([
      {
        type: "wrongFuel",
        severity: "danger",
        airport: "LBPD",
        fuel: "jet_a1",
        expected: "avgas_100ll",
      },
    ]);
  });

  it("compares the meters with the engine and air times", () => {
    // 1 h engine time: a Hobbs of 1.3 h is too long, 0.4 h is shorter than the 0.67 h airborne.
    expect(logChecks(input({ legs: [leg({ hobbsEnd: 101.3 })] }))).toMatchObject([
      { type: "hobbsLong", seq: 1, meterH: 1.3, engineH: 1 },
    ]);
    expect(logChecks(input({ legs: [leg({ hobbsEnd: 100.4 })] }))).toMatchObject([
      { type: "hobbsShort", meterH: 0.4, airH: 0.7 },
    ]);
    expect(logChecks(input({ legs: [leg({ tachEnd: 81.5 })] }))).toMatchObject([
      { type: "tachLong", meterH: 1.5 },
    ]);
    // Within the tolerance (0.1 h + 10 %).
    expect(logChecks(input({ legs: [leg({ hobbsEnd: 101.2 })] }))).toEqual([]);
  });

  it("flags fuel burn far from the aircraft's figure, e.g. gallons entered as litres", () => {
    expect(logChecks(input({ legs: [leg({ fuelBeforeL: 120, fuelAfterL: 20 })] }))).toMatchObject([
      { type: "fuelHigh", usedL: 100, hours: 1, lph: 100, expectedLph: 36 },
    ]);
    expect(logChecks(input({ legs: [leg({ fuelAfterL: 110 })] }))).toMatchObject([
      { type: "fuelLow", usedL: 10 },
    ]);
    // Short legs (taxi, circuits) and aircraft without a figure aren't checked.
    const short = leg({
      engineStop: at("09:20"),
      landingAt: at("09:15"),
      hobbsEnd: 100.3,
      tachEnd: 80.2,
    });
    expect(logChecks(input({ legs: [{ ...short, fuelAfterL: 60 }] }))).toEqual([]);
    expect(
      logChecks(
        input({
          aircraft: { fuelType: "avgas_100ll", fuelBurnLph: null },
          legs: [leg({ fuelAfterL: 20 })],
        }),
      ),
    ).toEqual([]);
  });

  it("flags flying outside the booked time, and into the next booking", () => {
    const early = leg({
      engineStart: at("07:30"),
      takeoffAt: at("07:40"),
      landingAt: at("08:20"),
      engineStop: at("08:30"),
    });
    expect(logChecks(input({ legs: [early] }))).toMatchObject([
      { type: "early", seq: 1, at: at("07:30"), limit: at("08:00") },
    ]);
    // 10 minutes early or late is fine.
    expect(
      logChecks(input({ legs: [leg({ engineStart: at("07:50"), hobbsEnd: 101.2 })] })),
    ).toEqual([]);
    const late = leg({
      seq: 2,
      engineStart: at("11:30"),
      engineStop: at("12:30"),
      takeoffAt: null,
      landingAt: null,
    });
    expect(logChecks(input({ legs: [late] }))).toMatchObject([{ type: "late", seq: 2 }]);
    const overlap = leg({
      engineStart: at("11:30"),
      engineStop: at("12:10"),
      takeoffAt: null,
      landingAt: null,
      hobbsEnd: 100.7,
    });
    expect(logChecks(input({ legs: [overlap], nextFrom: at("12:00") }))).toMatchObject([
      { type: "intoNext", at: at("12:10"), limit: at("12:00") },
    ]);
  });
});
