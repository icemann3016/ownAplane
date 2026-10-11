import { describe, expect, it } from "vitest";

import { type CurrencyEntry, laplRecency, passengerRecency, sepRevalidation } from "./currency";

const flight = (date: string, over: Partial<CurrencyEntry> = {}): CurrencyEntry => ({
  date,
  kind: "flight",
  seMinutes: 60,
  picMinutes: 60,
  dualMinutes: null,
  totalMinutes: 60,
  landingsDay: 1,
  landingsNight: null,
  ...over,
});

describe("passenger recency (FCL.060)", () => {
  it("lasts 90 days from the third most recent landing", () => {
    const entries = [
      flight("2026-08-01", { landingsDay: 2 }),
      flight("2026-09-10"),
      flight("2026-07-01"),
    ];
    const r = passengerRecency(entries, "2026-10-11");
    // 1 (Sep 10) + 2 (Aug 1) = 3 → valid until Aug 1 + 90 days.
    expect(r.day).toEqual({ current: true, until: "2026-10-30", count: 3 });
    expect(r.night).toEqual({ current: false, until: null, count: 0 });
    expect(passengerRecency(entries, "2026-11-05").day.current).toBe(false);
  });

  it("counts single-engine flights only, and night landings for night", () => {
    const entries = [
      flight("2026-10-01", { landingsDay: 0, landingsNight: 3 }),
      flight("2026-10-02", { seMinutes: 0, landingsDay: 5 }),
      { ...flight("2026-10-03"), kind: "fstd" as const },
    ];
    const r = passengerRecency(entries, "2026-10-11");
    expect(r.day).toMatchObject({ current: true, until: "2026-12-30", count: 3 });
    expect(r.night).toMatchObject({ current: true, until: "2026-12-30" });
  });
});

describe("SEP revalidation by experience (FCL.740.A)", () => {
  it("adds up the 12 months before the rating expires", () => {
    const entries = [
      ...Array.from({ length: 10 }, (_, i) =>
        flight(`2026-0${(i % 9) + 1}-15`, { seMinutes: 75, picMinutes: 75, landingsDay: 2 }),
      ),
      flight("2026-05-20", { dualMinutes: 70, picMinutes: 0, seMinutes: 70 }),
      flight("2025-01-01", { seMinutes: 600 }),
    ];
    const r = sepRevalidation(entries, "2026-12-31", "2026-10-11");
    expect(r).toMatchObject({ from: "2025-12-31", to: "2026-12-31", expired: false, met: true });
    expect(r.requirements).toEqual([
      { key: "hours", done: 820, need: 720, met: true },
      { key: "pic", done: 750, need: 360, met: true },
      { key: "landings", done: 21, need: 12, met: true },
      { key: "refresher", done: 1, need: 1, met: true },
    ]);
    const short = sepRevalidation(entries.slice(0, 3), "2026-12-31", "2026-10-11");
    expect(short.met).toBe(false);
    expect(short.requirements.find((q) => q.key === "refresher")!.met).toBe(false);
    expect(sepRevalidation(entries, "2026-09-30", "2026-10-11").expired).toBe(true);
  });
});

describe("LAPL recency (FCL.140.A)", () => {
  it("needs 12 h as PIC, 12 landings and a refresher in 24 months", () => {
    const entries = Array.from({ length: 12 }, (_, i) =>
      flight(`2025-${String((i % 12) + 1).padStart(2, "0")}-10`),
    );
    const r = laplRecency(entries, "2026-10-11");
    expect(r.requirements.map((q) => [q.key, q.met])).toEqual([
      ["pic", true],
      ["landings", true],
      ["refresher", false],
    ]);
    expect(r.met).toBe(false);
  });
});
