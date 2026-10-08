import { describe, expect, it } from "vitest";

import { aircraftSearchQuery, toSearchFilters } from "./schemas";

describe("API search query", () => {
  it("turns ISO times into the search's UTC minutes", () => {
    const q = aircraftSearchQuery.parse({
      airport: "LBSF",
      from: "2026-11-01T10:00:00+02:00",
      to: "2026-11-01T14:30:00Z",
      night: "true",
    });
    expect(toSearchFilters(q)).toMatchObject({
      airport: "LBSF",
      radius: 100,
      from: "2026-11-01T08:00",
      to: "2026-11-01T14:30",
      night: true,
      ifr: false,
      sort: "distance",
    });
  });

  it("reports invalid values instead of ignoring them", () => {
    const bad = (q: Record<string, string>) => aircraftSearchQuery.safeParse(q).success;
    expect(bad({ radius: "33" })).toBe(false);
    expect(bad({ from: "tomorrow", to: "2026-11-01T10:00:00Z" })).toBe(false);
    expect(bad({ from: "2026-11-01T10:00:00Z" })).toBe(false); // to missing
    expect(bad({ from: "2026-11-01T10:00:00Z", to: "2026-11-01T09:00:00Z" })).toBe(false);
    expect(bad({ category: "rocket" })).toBe(false);
    expect(bad({})).toBe(true);
  });
});
