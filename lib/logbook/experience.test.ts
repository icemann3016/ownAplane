import { describe, expect, it } from "vitest";

import { experienceFromTotals } from "./experience";
import { sumEntries } from "./totals";

const totals = (
  all: Record<string, number>,
  last90: Record<string, number>,
  byType = [] as { aircraftType: string; minutes: number }[],
) => ({
  all: { ...sumEntries([]), ...all },
  last90: { ...sumEntries([]), ...last90 },
  byType,
  certified: 3,
});

describe("experience from the logbook (LOG-7)", () => {
  it("turns minutes into hours with one decimal and keeps only ICAO type designators", () => {
    expect(
      experienceFromTotals(
        totals({ totalMinutes: 15_105, picMinutes: 12_070 }, { totalMinutes: 135 }, [
          { aircraftType: "C172", minutes: 600 },
          { aircraftType: "c-172", minutes: 30 },
          { aircraftType: "Cessna 172 S", minutes: 60 },
        ]),
      ),
    ).toEqual({
      totalHours: 251.8,
      picHours: 201.2,
      last90DaysHours: 2.3,
      types: [{ aircraftType: "C172", hours: 10.5 }],
    });
  });

  it("never claims more PIC or recent hours than the total, and nothing without entries", () => {
    const e = experienceFromTotals(
      totals({ totalMinutes: 60, picMinutes: 600 }, { totalMinutes: 90 }),
    );
    expect(e).toMatchObject({ totalHours: 1, picHours: 1, last90DaysHours: 1 });
    expect(experienceFromTotals({ ...totals({}, {}), certified: 0 })).toBeNull();
  });
});
