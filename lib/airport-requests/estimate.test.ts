import { describe, expect, it } from "vitest";

import { requestWarnings } from "./checks";
import { bandFor, defaultQuantity, estimate, type PricedService, serviceOptions } from "./estimate";

const line = (p: Partial<PricedService>): PricedService => ({
  id: Math.random().toString(),
  category: "landing",
  label: null,
  fuelType: null,
  maxMtomKg: null,
  price: 10,
  unit: "landing",
  ...p,
});

describe("service options and weight bands", () => {
  const services = [
    line({ maxMtomKg: 2000, price: 25 }),
    line({ maxMtomKg: 1000, price: 15 }),
    line({ category: "fuel", fuelType: "avgas_100ll", price: 2.859, unit: "litre" }),
    line({ category: "fuel", fuelType: "jet_a1", price: 2.1, unit: "litre" }),
    line({ category: "parking_hangar", label: "Heated", price: null, unit: "night" }),
  ];
  const options = serviceOptions(services);

  it("groups bands of one kind, lightest first; fuels and names apart", () => {
    expect(options.map((o) => o.key)).toEqual([
      "landing||",
      "fuel||avgas_100ll",
      "fuel||jet_a1",
      "parking_hangar|Heated|",
    ]);
    expect(options[0]!.bands.map((b) => b.maxMtomKg)).toEqual([1000, 2000]);
  });

  it("picks the band the aircraft fits in", () => {
    const landing = options[0]!;
    expect(bandFor(landing, 900)?.service.price).toBe(15);
    expect(bandFor(landing, 1000)?.service.price).toBe(15);
    expect(bandFor(landing, 1157)?.service.price).toBe(25);
    expect(bandFor(landing, 2155)).toBeNull();
    // Without the MTOM: the lightest band, not exact.
    expect(bandFor(landing, null)).toMatchObject({ service: { price: 15 }, exact: false });
    expect(bandFor(options[1]!, null)).toMatchObject({ exact: true });
  });
});

describe("quantities and the rough total", () => {
  const arrivalAt = new Date("2026-10-20T09:00:00Z");
  const departureAt = new Date("2026-10-22T07:30:00Z");
  const trip = { arrivalAt, departureAt, pob: 3 };

  it("fits the quantity to the trip", () => {
    expect(defaultQuantity("night", trip)).toBe(2);
    expect(defaultQuantity("day", trip)).toBe(3);
    expect(defaultQuantity("hour", trip)).toBe(47);
    expect(defaultQuantity("movement", trip)).toBe(2);
    expect(defaultQuantity("movement", { ...trip, departureAt: null })).toBe(1);
    expect(defaultQuantity("pax", trip)).toBe(3);
    expect(defaultQuantity("litre", trip)).toBeNull();
    expect(defaultQuantity("night", { ...trip, departureAt: null })).toBe(1);
  });

  it("adds up the priced lines and counts the rest", () => {
    expect(
      estimate([
        { price: 15, quantity: 1 },
        { price: 2.859, quantity: 80 },
        { price: null, quantity: 2 },
      ]),
    ).toEqual({ total: 243.72, onRequest: 1 });
  });
});

describe("warnings", () => {
  const base = {
    airportCountry: "BG",
    fromCountry: "BG",
    toCountry: null,
    asksCustoms: false,
    pprRequired: true,
    pprNoticeHours: 24,
    // 08:00–18:00 Sofia time every day (05:00–15:00 UTC in summer)
    hours: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, opens: "08:00", closes: "18:00" })),
    closures: [{ startsOn: "2026-07-03", endsOn: "2026-07-03", note: "Air show" }],
    timeZone: "Europe/Sofia",
    departureAt: null,
    sentAt: new Date("2026-06-29T12:00:00Z"),
  };

  it("is quiet inside the hours with enough notice", () => {
    expect(requestWarnings({ ...base, arrivalAt: new Date("2026-07-01T06:00:00Z") })).toEqual([]);
  });

  it("warns outside the hours, on a closed day and with short notice", () => {
    expect(requestWarnings({ ...base, arrivalAt: new Date("2026-07-01T16:00:00Z") })).toEqual([
      { kind: "outside_hours", at: "arrival" },
    ]);
    expect(requestWarnings({ ...base, arrivalAt: new Date("2026-07-03T09:00:00Z") })).toEqual([
      { kind: "closed", at: "arrival", note: "Air show" },
    ]);
    expect(requestWarnings({ ...base, arrivalAt: new Date("2026-06-30T06:00:00Z") })).toEqual([
      { kind: "short_notice", hours: 24 },
    ]);
  });

  it("asks for customs across Schengen or customs borders", () => {
    const arrivalAt = new Date("2026-07-01T06:00:00Z");
    const from = (fromCountry: string, asksCustoms = false) =>
      requestWarnings({ ...base, arrivalAt, fromCountry, asksCustoms }).map((w) => w.kind);
    expect(from("RO")).toEqual([]);
    expect(from("GB")).toEqual(["customs"]);
    expect(from("CH")).toEqual(["customs"]); // Schengen but outside the EU customs area
    expect(from("CY")).toEqual(["customs"]); // EU but outside Schengen
    expect(from("GB", true)).toEqual([]);
  });
});
