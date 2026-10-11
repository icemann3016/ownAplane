import { describe, expect, it } from "vitest";

import { changeKind, periodEnd, PLANS, PRICES, proratedCharge } from "./plans";

describe("plans", () => {
  it("go up in what they allow", () => {
    expect(PLANS.free.aircraft).toBeLessThan(PLANS.owner.aircraft);
    expect(PLANS.owner.aircraft).toBeLessThan(PLANS.fleet.aircraft);
    expect(PRICES.owner.year).toBeLessThan(PRICES.owner.month * 12);
  });

  it("tell upgrades from downgrades", () => {
    expect(
      changeKind({ plan: "owner", interval: "month" }, { plan: "fleet", interval: "month" }),
    ).toBe("upgrade");
    expect(
      changeKind({ plan: "owner", interval: "month" }, { plan: "owner", interval: "year" }),
    ).toBe("upgrade");
    expect(
      changeKind({ plan: "fleet", interval: "year" }, { plan: "owner", interval: "year" }),
    ).toBe("downgrade");
    expect(
      changeKind({ plan: "owner", interval: "year" }, { plan: "owner", interval: "month" }),
    ).toBe("downgrade");
    expect(
      changeKind({ plan: "owner", interval: "year" }, { plan: "owner", interval: "year" }),
    ).toBe("same");
  });

  it("charge an upgrade less what is left of the period", () => {
    const current = {
      priceCents: 900,
      periodStart: new Date("2026-10-01T00:00:00Z"),
      periodEnd: new Date("2026-10-31T00:00:00Z"),
    };
    // Half the month left: 450 unused.
    expect(proratedCharge(current, 3900, new Date("2026-10-16T00:00:00Z"))).toBe(3450);
    expect(proratedCharge(current, 100, new Date("2026-10-02T00:00:00Z"))).toBe(0);
    expect(proratedCharge(current, 3900, new Date("2026-11-05T00:00:00Z"))).toBe(3900);
  });

  it("end periods on the same day of the month, or the month's last day", () => {
    expect(periodEnd(new Date("2026-01-31T10:00:00Z"), "month").toISOString()).toBe(
      "2026-02-28T10:00:00.000Z",
    );
    expect(periodEnd(new Date("2026-10-11T10:00:00Z"), "month").toISOString()).toBe(
      "2026-11-11T10:00:00.000Z",
    );
    expect(periodEnd(new Date("2028-02-29T10:00:00Z"), "year").toISOString()).toBe(
      "2029-02-28T10:00:00.000Z",
    );
  });
});
