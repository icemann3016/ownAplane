import { describe, expect, it } from "vitest";

import { boardDays, boardRange, shiftDay } from "./board";

describe("movements board periods", () => {
  it("spans a day, a week from Monday, or a month", () => {
    expect(boardRange("day", "2026-10-14").days).toEqual(["2026-10-14"]);
    const week = boardRange("week", "2026-10-14"); // a Wednesday
    expect(week.days[0]).toBe("2026-10-12");
    expect(week.days).toHaveLength(7);
    expect(boardRange("week", "2026-10-18").days[0]).toBe("2026-10-12"); // Sunday
    const month = boardRange("month", "2026-02-10");
    expect(month.days).toHaveLength(28);
    expect(month.to.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("moves to the previous or next period", () => {
    expect(shiftDay("day", "2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDay("week", "2026-10-14", -1)).toBe("2026-10-07");
    expect(shiftDay("month", "2026-01-31", 1)).toBe("2026-02-01");
  });

  it("lists each day's movements in order and who stays on the ground", () => {
    const visit = {
      id: "a",
      arrivalAt: new Date("2026-10-12T15:00:00Z"),
      departureAt: new Date("2026-10-15T08:00:00Z"),
    };
    const quick = { id: "b", arrivalAt: new Date("2026-10-13T09:00:00Z"), departureAt: null };
    const days = boardDays(boardRange("week", "2026-10-14").days, [visit, quick]);
    expect(days[0]!.events.map((e) => [e.kind, e.item.id])).toEqual([["arrival", "a"]]);
    expect(days[1]!.events.map((e) => e.item.id)).toEqual(["b"]);
    expect(days[1]!.onGround.map((i) => i.id)).toEqual(["a"]);
    expect(days[3]!.events.map((e) => [e.kind, e.item.id])).toEqual([["departure", "a"]]);
    expect(days[3]!.onGround).toEqual([]);
  });
});
