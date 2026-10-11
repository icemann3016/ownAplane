import { describe, expect, it } from "vitest";

import { entryHints } from "./checks";
import { formatDuration, parseDuration } from "./duration";
import { paginate } from "./pages";

describe("logbook durations", () => {
  it("reads hours:minutes and decimal hours", () => {
    expect(parseDuration("1:25")).toBe(85);
    expect(parseDuration(" 12:05 ")).toBe(725);
    expect(parseDuration("1.4")).toBe(84);
    expect(parseDuration("2,5")).toBe(150);
    expect(parseDuration("3")).toBe(180);
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("1:75")).toBeNaN();
    expect(parseDuration("abc")).toBeNaN();
  });

  it("writes hours:minutes", () => {
    expect(formatDuration(85)).toBe("1:25");
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(6005)).toBe("100:05");
    expect(formatDuration(null)).toBe("");
  });
});

describe("logbook entry hints", () => {
  const flight = {
    kind: "flight",
    seMinutes: 85,
    meMinutes: null,
    mpMinutes: null,
    totalMinutes: 85,
    nightMinutes: null,
    ifrMinutes: null,
    picMinutes: 85,
    copilotMinutes: null,
    dualMinutes: null,
    instructorMinutes: null,
    landingsDay: 1,
    landingsNight: 0,
  };

  it("has nothing to say about a consistent flight", () => {
    expect(entryHints(flight)).toEqual([]);
    expect(entryHints({ ...flight, kind: "fstd" })).toEqual([]);
  });

  it("points out times that don't add up", () => {
    expect(entryHints({ ...flight, seMinutes: 60 })).toEqual(["split_not_total"]);
    expect(entryHints({ ...flight, picMinutes: null })).toEqual(["no_function_time"]);
    expect(entryHints({ ...flight, dualMinutes: 30 })).toEqual(["function_over_total"]);
    expect(entryHints({ ...flight, picMinutes: null, instructorMinutes: 85 })).toEqual([]);
    expect(entryHints({ ...flight, landingsDay: 0 })).toEqual(["no_landings"]);
    expect(entryHints({ ...flight, landingsNight: 1 })).toEqual(["night_landings_without_night"]);
  });
});

describe("logbook pages (EASA layout)", () => {
  const entry = (n: number, extra: Record<string, unknown> = {}) =>
    ({
      id: String(n),
      kind: "flight",
      status: "certified",
      totalMinutes: 60,
      picMinutes: 60,
      landingsDay: 1,
      ...extra,
    }) as unknown as import("@/lib/db/schema").LogbookEntry;

  it("opens with the totals brought forward and carries totals from page to page", () => {
    const { opening, pages } = paginate(
      [
        entry(0, { kind: "brought_forward", totalMinutes: 6000, landingsDay: 400 }),
        entry(1),
        entry(2, { status: "superseded" }),
        entry(3),
        entry(4),
      ],
      2,
    );
    expect(opening.totalMinutes).toBe(6000);
    expect(pages.map((p) => p.rows.map((r) => r.id))).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
    expect(pages[0]).toMatchObject({
      thisPage: { totalMinutes: 60, landingsDay: 1 },
      previous: { totalMinutes: 6000 },
      toDate: { totalMinutes: 6060, landingsDay: 401 },
    });
    expect(pages[1]!.previous.totalMinutes).toBe(6060);
    expect(pages[1]!.toDate.totalMinutes).toBe(6180);
  });
});
