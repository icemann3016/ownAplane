import { describe, expect, it } from "vitest";

import { byFunction, byMonth, byType } from "./stats";

const e = (date: string, over: Record<string, unknown> = {}) => ({
  date,
  kind: "flight" as const,
  aircraftType: "C172",
  totalMinutes: 60,
  picMinutes: 60,
  dualMinutes: null,
  instructorMinutes: null,
  copilotMinutes: null,
  landingsDay: 1,
  landingsNight: 1,
  ...over,
});

describe("flying statistics", () => {
  it("gives the last 12 months, oldest first", () => {
    const months = byMonth([e("2026-10-02"), e("2026-10-20"), e("2025-10-31")], "2026-10-11");
    expect(months).toHaveLength(12);
    expect(months[0]!.month).toBe("2025-11");
    expect(months[11]).toEqual({ month: "2026-10", minutes: 120, landings: 4 });
  });

  it("adds up types and functions", () => {
    const entries = [
      e("2026-01-01"),
      e("2026-01-02", { aircraftType: "p28a", totalMinutes: 90, picMinutes: 0, dualMinutes: 90 }),
      e("2026-01-03", { aircraftType: "c172" }),
    ];
    expect(byType(entries)).toEqual([
      { aircraftType: "C172", minutes: 120 },
      { aircraftType: "P28A", minutes: 90 },
    ]);
    expect(byFunction(entries)).toEqual({ pic: 120, dual: 90, instructor: 0, copilot: 0 });
  });
});
