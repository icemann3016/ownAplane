import { describe, expect, it } from "vitest";

import { FeedError, isPrivateAddress, parseIcsFeed, parseJsonFeed } from "./feeds";

const now = new Date("2026-10-09T12:00:00Z");
const iso = (d: Date) => d.toISOString().slice(0, 16);

const ics = (...body: string[]) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test//EN", ...body, "END:VCALENDAR"].join("\r\n");

const SOFIA = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Sofia",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0300",
  "DTSTART:19700329T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0300",
  "TZOFFSETTO:+0200",
  "DTSTART:19701025T040000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

describe("iCal feeds", () => {
  it("reads single events in UTC, with time zones and as all-day", () => {
    const events = parseIcsFeed(
      ics(
        ...SOFIA,
        "BEGIN:VEVENT",
        "UID:utc-1",
        "DTSTART:20261020T080000Z",
        "DTEND:20261020T110000Z",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:sofia-1",
        "DTSTART;TZID=Europe/Sofia:20261021T100000",
        "DTEND;TZID=Europe/Sofia:20261021T120000",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:berlin-no-vtimezone",
        "DTSTART;TZID=Europe/Berlin:20261022T100000",
        "DTEND;TZID=Europe/Berlin:20261022T110000",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:allday",
        "DTSTART;VALUE=DATE:20261023",
        "DTEND;VALUE=DATE:20261024",
        "END:VEVENT",
      ),
      now,
    );
    const byId = Object.fromEntries(events.map((e) => [e.id, [iso(e.from), iso(e.to)]]));
    expect(byId["utc-1"]).toEqual(["2026-10-20T08:00", "2026-10-20T11:00"]);
    expect(byId["sofia-1"]).toEqual(["2026-10-21T07:00", "2026-10-21T09:00"]); // UTC+3
    expect(byId["berlin-no-vtimezone"]).toEqual(["2026-10-22T08:00", "2026-10-22T09:00"]); // UTC+2
    expect(byId["allday"]).toEqual(["2026-10-23T00:00", "2026-10-24T00:00"]);
  });

  it("expands recurring events with moved and cancelled occurrences", () => {
    const events = parseIcsFeed(
      ics(
        "BEGIN:VEVENT",
        "UID:club-tuesdays",
        "DTSTART:20261013T090000Z",
        "DTEND:20261013T120000Z",
        "RRULE:FREQ=WEEKLY;COUNT=4",
        "EXDATE:20261027T090000Z",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:club-tuesdays",
        "RECURRENCE-ID:20261020T090000Z",
        "DTSTART:20261020T130000Z",
        "DTEND:20261020T150000Z",
        "END:VEVENT",
      ),
      now,
    );
    expect(events.map((e) => [iso(e.from), iso(e.to)])).toEqual([
      ["2026-10-13T09:00", "2026-10-13T12:00"],
      ["2026-10-20T13:00", "2026-10-20T15:00"], // moved
      ["2026-11-03T09:00", "2026-11-03T12:00"], // 27 Oct excluded
    ]);
    // Each occurrence has its own stable id.
    expect(events[1]!.id).toBe("club-tuesdays#2026-10-20T09:00:00.000Z");
  });

  it("skips cancelled and free events, and old occurrences", () => {
    const events = parseIcsFeed(
      ics(
        "BEGIN:VEVENT",
        "UID:cancelled",
        "STATUS:CANCELLED",
        "DTSTART:20261020T080000Z",
        "DTEND:20261020T090000Z",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:free",
        "TRANSP:TRANSPARENT",
        "DTSTART:20261020T080000Z",
        "DTEND:20261020T090000Z",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:daily-since-2020",
        "DTSTART:20200101T060000Z",
        "DTEND:20200101T070000Z",
        "RRULE:FREQ=DAILY",
        "END:VEVENT",
      ),
      now,
    );
    expect(events.some((e) => e.id === "cancelled" || e.id === "free")).toBe(false);
    const daily = events.filter((e) => e.id.startsWith("daily-since-2020#"));
    expect(iso(daily[0]!.from)).toBe("2026-10-09T06:00"); // nothing older than a day
    expect(daily.length).toBeLessThanOrEqual(2000);
  });

  it("refuses something that isn't a calendar", () => {
    expect(() => parseIcsFeed("<html>Sign in</html>", now)).toThrow(FeedError);
  });
});

describe("JSON feeds", () => {
  it("reads { busy: [...] } or a plain list, with start/end or from/to", () => {
    const a = parseJsonFeed(
      JSON.stringify({
        busy: [{ id: 42, start: "2026-10-20T10:00:00+02:00", end: "2026-10-20T12:00:00+02:00" }],
      }),
    );
    expect(a).toEqual([
      { id: "42", from: new Date("2026-10-20T08:00:00Z"), to: new Date("2026-10-20T10:00:00Z") },
    ]);
    const b = parseJsonFeed(
      JSON.stringify([{ id: "x", from: "2026-10-20T08:00:00Z", to: "2026-10-20T09:00:00Z" }]),
    );
    expect(b[0]!.id).toBe("x");
  });

  it("explains what is wrong", () => {
    expect(() => parseJsonFeed("nope")).toThrow("json_invalid");
    expect(() => parseJsonFeed(JSON.stringify({ busy: [{ id: "1", start: "tomorrow" }] }))).toThrow(
      "json_invalid",
    );
  });
});

describe("feed links", () => {
  it("never reach private or internal addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "169.254.169.254",
      "172.20.0.1",
      "192.168.1.1",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "185.199.108.153", "2a00:1450:4001:80b::200e"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});
