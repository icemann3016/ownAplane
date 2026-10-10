import { describe, expect, it } from "vitest";

import { exportFields, importFields } from "./fields";
import { prepareIncoming } from "./incoming";
import { type BusyDetail, type IcsTexts, sharedDetails, toIcsEvent } from "./outgoing";

const booking: BusyDetail = {
  id: "e1",
  from: new Date("2026-10-20T08:00:00Z"),
  to: new Date("2026-10-20T11:00:00Z"),
  kind: "booking",
  external: false,
  bookingId: "b1",
  bookingStatus: "requested",
  departure: "LBSF",
  arrival: "LBPD",
  pilotName: "Ana Petrova",
  note: null,
  registration: "LZ-ABC",
};
const block: BusyDetail = {
  ...booking,
  id: "e2",
  kind: "maintenance",
  bookingId: null,
  bookingStatus: null,
  departure: null,
  arrival: null,
  pilotName: null,
  note: "50 h check",
};
const texts: IcsTexts = {
  titles: {
    booked: "Booked (ownAplane)",
    owner_use: "Own use",
    maintenance: "Maintenance",
    unavailable: "Unavailable",
  },
  labels: {
    status: "Status",
    route: "Route",
    pilot: "Pilot",
    booking: "Booking",
    note: "Note",
    aircraft: "Aircraft",
  },
  statuses: { requested: "Requested" },
};

describe("what is shared with another system", () => {
  it("shares only times and booked/unavailable by default", () => {
    expect(Object.values(sharedDetails(booking, [], "u")).every((v) => v === undefined)).toBe(true);
    expect(toIcsEvent(booking, [], texts, "u")).toEqual({
      id: "e1",
      from: booking.from,
      to: booking.to,
      summary: "Booked (ownAplane)",
      description: undefined,
      location: undefined,
      status: undefined,
      url: undefined,
    });
    expect(toIcsEvent(block, [], texts, "").summary).toBe("Unavailable");
  });

  it("adds each chosen detail", () => {
    const all = exportFields([
      "type",
      "status",
      "route",
      "pilot",
      "reference",
      "note",
      "registration",
    ]);
    const event = toIcsEvent(booking, all, texts, "https://ownaplane.eu/bookings/b1");
    expect(event).toMatchObject({
      summary: "Booked (ownAplane)",
      location: "LBSF",
      status: "TENTATIVE",
      url: "https://ownaplane.eu/bookings/b1",
    });
    expect(event.description).toBe(
      "Status: Requested\nRoute: LBSF → LBPD\nPilot: Ana Petrova\nBooking: https://ownaplane.eu/bookings/b1\nAircraft: LZ-ABC",
    );
    const blocked = toIcsEvent(block, all, texts, "");
    expect(blocked.summary).toBe("Maintenance");
    expect(blocked.description).toBe("Note: 50 h check\nAircraft: LZ-ABC");
  });

  it("never passes on another system's titles", () => {
    const fromElsewhere = {
      ...block,
      kind: "unavailable" as const,
      external: true,
      note: "Club: John",
    };
    expect(sharedDetails(fromElsewhere, ["note"], "").note).toBeUndefined();
  });

  it("ignores unknown field names", () => {
    expect(exportFields(["pilot", "email", "phone"])).toEqual(["pilot"]);
    expect(importFields(["registration", "title", "x"])).toEqual(["title", "registration"]);
  });
});

describe("what is taken from another system", () => {
  const ev = (id: string, extra: object = {}) => ({
    id,
    from: new Date("2026-10-20T08:00:00Z"),
    to: new Date("2026-10-20T09:00:00Z"),
    ...extra,
  });
  const events = [
    ev("plain", { title: "Club flight Ivan" }),
    ev("maint", { type: "maintenance", title: "Annual" }),
    ev("maybe", { tentative: true }),
    ev("other", { registration: "lz-xyz" }),
    ev("same", { registration: "lzabc" }),
  ];

  it("takes only times by default: everything blocks, without titles", () => {
    const { keep, skipped } = prepareIncoming(events, [], "LZ-ABC");
    expect(keep.map((k) => [k.event.id, k.kind, k.note])).toEqual([
      ["plain", "unavailable", null],
      ["maint", "unavailable", null],
      ["maybe", "unavailable", null],
      ["other", "unavailable", null],
      ["same", "unavailable", null],
    ]);
    expect(skipped.size).toBe(0);
  });

  it("takes titles and types, skips tentative ones and other aircraft when chosen", () => {
    const { keep, skipped } = prepareIncoming(
      events,
      ["title", "type", "status", "registration"],
      "LZ-ABC",
    );
    expect(keep.map((k) => [k.event.id, k.kind, k.note])).toEqual([
      ["plain", "unavailable", "Club flight Ivan"],
      ["maint", "maintenance", "Annual"],
      ["same", "unavailable", null],
    ]);
    expect(Object.fromEntries(skipped)).toEqual({ maybe: "ignored", other: "wrong_aircraft" });
  });
});
