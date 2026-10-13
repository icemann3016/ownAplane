import { describe, expect, it } from "vitest";

import { emailDomain, isWorkEmail } from "./proof";

describe("airport claim proof (APT-1)", () => {
  it("reads the domain of an address", () => {
    expect(emailDomain(" Ops@Sofia-Airport.BG ")).toBe("sofia-airport.bg");
    expect(emailDomain("not an email")).toBeNull();
    expect(emailDomain("a@b")).toBeNull();
  });

  it("accepts organisations' own domains, not free mail", () => {
    expect(isWorkEmail("ops@sofia-airport.bg")).toBe(true);
    expect(isWorkEmail("tower@aeroclub.example.org")).toBe(true);
    expect(isWorkEmail("me@gmail.com")).toBe(false);
    expect(isWorkEmail("me@ABV.BG")).toBe(false);
    expect(isWorkEmail("me@mx.gmx.de")).toBe(false);
    expect(isWorkEmail("nonsense")).toBe(false);
  });
});
