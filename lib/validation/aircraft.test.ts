import { describe, expect, it } from "vitest";

import { detailsSchema, equipmentSchema, pricingSchema, registrationSchema } from "./aircraft";

const details = {
  registration: " lz-abc ",
  category: "aeroplane",
  manufacturer: "Cessna",
  model: "172S",
  typeDesignator: "c172",
  year: "2004",
  seats: "4",
  engine: "",
  fuelType: "avgas_100ll",
  fuelBurn: "9,5",
  cruiseKt: "120",
  usefulLoad: "800",
  mtom: "2550",
  enduranceH: "",
};

describe("aircraft details", () => {
  it("normalises registration and type, and converts to SI units", () => {
    const r = detailsSchema("imperial").safeParse(details);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({
      registration: "LZ-ABC",
      typeDesignator: "C172",
      year: 2004,
      seats: 4,
      engine: null,
      fuelBurnLph: 36,
      usefulLoadKg: 363,
      mtomKg: 1157,
      enduranceH: null,
    });
  });

  it("keeps metric values", () => {
    const r = detailsSchema("metric").parse({ ...details, fuelBurn: "36", usefulLoad: "363" });
    expect(r).toMatchObject({ fuelBurnLph: 36, usefulLoadKg: 363 });
  });

  it("rejects bad registrations, seats and years", () => {
    const r = detailsSchema("metric").safeParse({
      ...details,
      registration: "LZ ABC!",
      seats: "0",
      year: "1850",
    });
    expect(r.success).toBe(false);
    const messages = Object.fromEntries(r.error!.issues.map((i) => [i.path[0], i.message]));
    expect(messages).toMatchObject({
      registration: "registrationInvalid",
      seats: "seatsInvalid",
      year: "yearInvalid",
    });
  });

  it("accepts registrations from around Europe", () => {
    for (const reg of ["D-EFGH", "G-ABCD", "OK-NUL23", "9H-ABC", "N12345", "LZ-UL1"]) {
      expect(registrationSchema.safeParse(reg).success, reg).toBe(true);
    }
  });
});

describe("equipment", () => {
  it("reads checkboxes", () => {
    expect(
      equipmentSchema.parse({ avionics: "G1000", transponder: "mode_s", ifr: "on" }),
    ).toMatchObject({ autopilot: false, nightVfr: false, ifr: true, avionics: "G1000" });
  });
});

describe("pricing", () => {
  const pricing = {
    pricePerHour: "185.555",
    weekendPricePerHour: "",
    currency: "EUR",
    priceBasis: "wet",
    timeBasis: "hobbs",
    minHoursPerDay: "",
    oilUnit: "qt",
    cancellationPolicy: "moderate",
  };

  it("rounds prices and leaves optional ones empty", () => {
    expect(pricingSchema.parse(pricing)).toMatchObject({
      pricePerHour: 185.56,
      weekendPricePerHour: null,
      minHoursPerDay: null,
    });
  });

  it("requires a price and keeps the daily minimum within a day", () => {
    const r = pricingSchema.safeParse({ ...pricing, pricePerHour: "", minHoursPerDay: "13" });
    const messages = Object.fromEntries(r.error!.issues.map((i) => [i.path[0], i.message]));
    expect(messages).toEqual({ pricePerHour: "priceInvalid", minHoursPerDay: "minHoursInvalid" });
  });
});
