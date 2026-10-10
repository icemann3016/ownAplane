import { describe, expect, it } from "vitest";

import { filtersToQuery, parseQuery, parseSearch } from "./search";

describe("search filters from the URL", () => {
  it("reads valid filters", () => {
    expect(
      parseSearch({
        airport: "LBSF",
        radius: "200",
        from: "2026-10-01T09:00",
        to: "2026-10-01T13:00",
        category: "aeroplane",
        seats: "4",
        maxPrice: "200",
        fuel: "wet",
        night: "1",
        eligible: "on",
        sort: "price",
      }),
    ).toMatchObject({
      airport: "LBSF",
      radius: 200,
      seats: 4,
      maxPrice: 200,
      night: true,
      ifr: false,
      eligible: true,
      sort: "price",
    });
  });

  it("ignores invalid or empty values instead of failing", () => {
    expect(
      parseSearch({ radius: "7", seats: "lots", from: "tomorrow", category: "", sort: "x" }),
    ).toEqual({
      radius: 100,
      night: false,
      ifr: false,
      eligible: false,
      sort: "distance",
    });
  });
});

describe("filters as a query string (saved searches)", () => {
  it("keeps only what differs from the defaults and reads back the same filters", () => {
    const filters = parseSearch({
      airport: "LBSF",
      radius: "200",
      from: "2026-10-01T09:00",
      to: "2026-10-01T13:00",
      night: "on",
      avionics: "G1000 NXi",
      sort: "distance",
    });
    const query = filtersToQuery(filters);
    expect(query).toBe(
      "airport=LBSF&radius=200&from=2026-10-01T09%3A00&to=2026-10-01T13%3A00&night=1&avionics=G1000+NXi",
    );
    expect(parseQuery(query)).toEqual(filters);
    expect(filtersToQuery(parseSearch({}))).toBe("");
  });
});
