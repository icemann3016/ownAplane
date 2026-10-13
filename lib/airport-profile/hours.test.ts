import { describe, expect, it } from "vitest";

import { isoWeekday, upcomingHours } from "./hours";

const iso = (d: Date) => d.toISOString().slice(11, 16);

describe("airfield opening hours (APT-1)", () => {
  it("knows ISO weekdays", () => {
    expect(isoWeekday("2026-10-12")).toBe(1); // Monday
    expect(isoWeekday("2026-10-18")).toBe(7); // Sunday
  });

  it("shows local hours in UTC for each date, across the change to winter time", () => {
    // 08:00–18:00 local every day in Sofia; summer time ends on Sunday 25 October 2026.
    const hours = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      weekday,
      opens: "08:00:00",
      closes: "18:00:00",
    }));
    const days = upcomingHours(hours, [], "Europe/Sofia", new Date("2026-10-24T10:00:00Z"), 3);
    expect(days.map((d) => [d.day, d.ranges.map((r) => `${iso(r.from)}-${iso(r.to)}`)])).toEqual([
      ["2026-10-24", ["05:00-15:00"]], // UTC+3
      ["2026-10-25", ["06:00-16:00"]], // UTC+2 from 04:00 local
      ["2026-10-26", ["06:00-16:00"]],
    ]);
  });

  it("starts from the airfield's local date, closes at midnight, and knows closures", () => {
    const hours = [
      { weekday: 1, opens: "06:00:00", closes: "12:00:00" },
      { weekday: 1, opens: "14:00:00", closes: "24:00:00" },
    ];
    const closures = [{ startsOn: "2026-10-13", endsOn: "2026-10-14", note: "Runway works" }];
    // 22:30 UTC on Sunday 11 October is already Monday in Sofia.
    const days = upcomingHours(
      hours,
      closures,
      "Europe/Sofia",
      new Date("2026-10-11T22:30:00Z"),
      3,
    );
    expect(days[0]).toMatchObject({ day: "2026-10-12", weekday: 1, closure: null });
    expect(days[0]!.ranges.map((r) => [r.from.toISOString(), r.to.toISOString()])).toEqual([
      ["2026-10-12T03:00:00.000Z", "2026-10-12T09:00:00.000Z"],
      ["2026-10-12T11:00:00.000Z", "2026-10-12T21:00:00.000Z"],
    ]);
    expect(days[1]).toMatchObject({ day: "2026-10-13", ranges: [], closure: closures[0] });
    expect(days[2]).toMatchObject({ ranges: [], closure: closures[0] });
  });
});
