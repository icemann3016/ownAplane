import { describe, expect, it } from "vitest";

import { normalizeEvents } from "./events";
import { buildIcs } from "./ics";
import { hashApiKey, newApiKey } from "./keys";

const now = new Date("2026-10-09T12:00:00Z");
const ev = (id: string, from: string, to: string) => ({
  id,
  from: new Date(from),
  to: new Date(to),
});

describe("external busy times", () => {
  it("keeps valid events in the window, one per id, sorted", () => {
    const { events, problems } = normalizeEvents(
      [
        ev("b", "2026-10-20T10:00:00Z", "2026-10-20T12:00:00Z"),
        ev("a", "2026-10-15T08:00:00Z", "2026-10-15T09:00:00Z"),
        ev("b", "2026-10-21T10:00:00Z", "2026-10-21T12:00:00Z"), // the later copy wins
        ev("old", "2026-09-01T08:00:00Z", "2026-09-01T09:00:00Z"), // long past: ignored
        ev("bad", "2026-10-15T09:00:00Z", "2026-10-15T08:00:00Z"),
        ev("year", "2026-10-15T00:00:00Z", "2027-11-01T00:00:00Z"),
        { id: "nan", from: new Date("x"), to: new Date("2026-10-15T08:00:00Z") },
      ],
      now,
    );
    expect(events.map((e) => e.id)).toEqual(["a", "b"]);
    expect(events[1]!.from.toISOString()).toBe("2026-10-21T10:00:00.000Z");
    expect(problems).toEqual([
      { id: "bad", problem: "invalid" },
      { id: "year", problem: "too_long" },
      { id: "nan", problem: "invalid" },
    ]);
  });

  it("keeps a busy time that started yesterday and clips far-future ends", () => {
    const { events } = normalizeEvents(
      [ev("now", "2026-10-09T02:00:00Z", "2026-10-09T14:00:00Z")],
      now,
    );
    expect(events).toHaveLength(1);
  });
});

describe("API keys", () => {
  it("are random, stored as a hash and recognisable by their end", () => {
    const a = newApiKey();
    const b = newApiKey();
    expect(a.key).toMatch(/^oap_[A-Za-z0-9_-]{43}$/);
    expect(a.key).not.toBe(b.key);
    expect(a.hash).toBe(hashApiKey(a.key));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.key.endsWith(a.hint)).toBe(true);
  });
});

describe("iCal export", () => {
  it("lists busy times without personal details", () => {
    const ics = buildIcs({
      name: "LZ-ABC, ownAplane",
      host: "ownaplane.eu",
      busy: [
        {
          id: "e1",
          from: new Date("2026-10-20T08:00:00Z"),
          to: new Date("2026-10-20T11:30:00Z"),
          booking: true,
        },
      ],
      titles: { booking: "Booked (ownAplane)", blocked: "Unavailable" },
      now,
    });
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("X-WR-CALNAME:LZ-ABC\\, ownAplane\r\n");
    expect(ics).toContain("UID:e1@ownaplane.eu\r\n");
    expect(ics).toContain("DTSTART:20261020T080000Z\r\n");
    expect(ics).toContain("DTEND:20261020T113000Z\r\n");
    expect(ics).toContain("SUMMARY:Booked (ownAplane)\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("folds long lines", () => {
    const ics = buildIcs({
      name: "x".repeat(200),
      host: "h",
      busy: [],
      titles: { booking: "", blocked: "" },
    });
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });
});
