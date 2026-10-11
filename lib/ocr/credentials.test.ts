import { describe, expect, it } from "vitest";

import { licenceSuggestion, medicalSuggestion } from "./credentials";

describe("what is read from a licence", () => {
  it("keeps known states and codes, maps written class ratings and drops the rest", () => {
    const s = licenceSuggestion({
      isLicence: true,
      type: "ppl_a",
      issuingState: " bg ",
      number: " BG.FCL.123 ",
      issuedOn: "2019-05-14",
      expiresOn: "1850-01-01",
      ratings: [
        { kind: "class", code: "SEP (land)", expiresOn: "2027-05-31" },
        { kind: "class", code: "SEP-LAND", expiresOn: "2027-05-31" },
        { kind: "class", code: "JET", expiresOn: null },
        { kind: "privilege", code: "night", expiresOn: null },
        { kind: "type", code: "c-510", expiresOn: "2026-12-31" },
      ],
    });
    expect(s).toEqual({
      type: "ppl_a",
      issuingState: "BG",
      number: "BG.FCL.123",
      issuedOn: "2019-05-14",
      expiresOn: null,
      ratings: [
        { kind: "class", code: "SEP_LAND", expiresOn: "2027-05-31" },
        { kind: "privilege", code: "NIGHT", expiresOn: null },
        { kind: "type", code: "C510", expiresOn: "2026-12-31" },
      ],
    });
    expect(licenceSuggestion({ ...baseLicence, issuingState: "US" }).issuingState).toBeNull();
  });
});

const baseLicence = {
  isLicence: true,
  type: null,
  issuingState: null,
  number: null,
  issuedOn: null,
  expiresOn: null,
  ratings: [],
};

describe("what is read from a medical", () => {
  const read = (classes: { class: "class1" | "class2" | "lapl"; validUntil: string | null }[]) =>
    medicalSuggestion({ isMedical: true, issuingState: "de", classes }, "2026-10-11");

  it("takes the highest class still valid, with its date", () => {
    expect(
      read([
        { class: "class2", validUntil: "2030-06-30" },
        { class: "class1", validUntil: "2026-01-31" },
      ]),
    ).toEqual({ class: "class2", issuingState: "DE", validUntil: "2030-06-30" });
    expect(read([{ class: "class1", validUntil: "2027-01-31" }]).class).toBe("class1");
  });

  it("falls back to the highest class when none is valid, and to nothing when empty", () => {
    expect(
      read([
        { class: "lapl", validUntil: "2025-01-01" },
        { class: "class2", validUntil: "2024-01-01" },
      ]),
    ).toMatchObject({ class: "class2", validUntil: "2024-01-01" });
    expect(read([])).toEqual({ class: null, issuingState: "DE", validUntil: null });
  });
});
