import { afterEach, describe, expect, it, vi } from "vitest";

import { FeedError, fetchFeed } from "./feeds";
import { rafBookingsToEvents, readRafAviation } from "./rafaviation";

const iso = (d: Date) => d.toISOString();
const json = (data: unknown) => ({ text: JSON.stringify(data), contentType: "application/json" });

describe("RAF Aviation bookings (SYN-7)", () => {
  it("turns Sofia local times into UTC busy times, summer and winter", () => {
    const events = rafBookingsToEvents({
      data: [
        { date: "2026-07-15", from: "10:00", to: "12:00", status: "approved" }, // UTC+3
        { date: "2026-12-15", from: "10:00", to: "12:30", status: "pending" }, // UTC+2
      ],
    });
    expect(events.map((e) => [e.id, iso(e.from), iso(e.to), e.tentative])).toEqual([
      [
        "ECIDR:2026-07-15T10:00/12:00",
        "2026-07-15T07:00:00.000Z",
        "2026-07-15T09:00:00.000Z",
        false,
      ],
      [
        "ECIDR:2026-12-15T10:00/12:30",
        "2026-12-15T08:00:00.000Z",
        "2026-12-15T10:30:00.000Z",
        true,
      ],
    ]);
    expect(events[0]).toMatchObject({ type: "booking", registration: "EC-IDR" });
  });

  it("ends a booking at or before its start on the next day, and 24:00 at midnight", () => {
    const events = rafBookingsToEvents({
      data: [
        { date: "2026-10-20", from: "22:00", to: "02:00", status: "approved" },
        { date: "2026-10-21", from: "18:00", to: "24:00", status: "approved" },
        { date: "2026-10-22", from: "00:00", to: "00:00", status: "approved" },
      ],
    });
    expect(events.map((e) => [iso(e.from), iso(e.to)])).toEqual([
      ["2026-10-20T19:00:00.000Z", "2026-10-20T23:00:00.000Z"],
      ["2026-10-21T15:00:00.000Z", "2026-10-21T21:00:00.000Z"],
      ["2026-10-21T21:00:00.000Z", "2026-10-22T21:00:00.000Z"],
    ]);
  });

  it("leaves out bookings that don't keep the aircraft busy", () => {
    const events = rafBookingsToEvents({
      data: [
        { date: "2026-10-20", from: "10:00", to: "11:00", status: "rejected" },
        { date: "2026-10-20", from: "12:00", to: "13:00", status: "Expired" },
        { date: "2026-10-20", from: "14:00", to: "15:00", status: "something new" },
      ],
    });
    // An unknown status still blocks: better a free slot missed than a double booking.
    expect(events.map((e) => e.id)).toEqual(["ECIDR:2026-10-20T14:00/15:00"]);
  });

  it("takes a booking's registration when the API sends one, else EC-IDR", () => {
    const events = rafBookingsToEvents({
      data: [
        { date: "2026-10-20", from: "10:00", to: "11:00", status: "approved" },
        {
          date: "2026-10-21",
          from: "10:00",
          to: "11:00",
          status: "approved",
          registration: "LZABC",
        },
      ],
    });
    expect(events.map((e) => e.registration)).toEqual(["EC-IDR", "LZABC"]);
  });

  it("refuses an answer in another format", () => {
    for (const body of [{ data: [{ date: "20.10.2026", from: "10:00", to: "11:00" }] }, []]) {
      expect(() => rafBookingsToEvents(body)).toThrow(FeedError);
    }
    expect(rafBookingsToEvents({ data: [] })).toEqual([]);
  });

  it("asks for today (in Sofia) to a year ahead, with the key as a Bearer token", async () => {
    const fetcher = vi.fn(async () => json({ data: [] }));
    // 22:30 UTC on 12 October is already the 13th in Sofia.
    await readRafAviation("secret-key", new Date("2026-10-12T22:30:00Z"), fetcher);
    expect(fetcher).toHaveBeenCalledWith(
      "https://rafaviation.flights/api/v1/bookings?from=2026-10-13&to=2027-10-14",
      {
        headers: { authorization: "Bearer secret-key", accept: "application/json" },
        trusted: true,
      },
    );
  });
});

describe("fetching with a partner's key", () => {
  afterEach(() => vi.unstubAllGlobals());

  const answer = (status: number, headers: Record<string, string> = {}) =>
    vi.fn(async () => new Response(status === 200 ? "{}" : null, { status, headers }));
  const withKey = { headers: { authorization: "Bearer k" }, trusted: true };

  it("tells a refused key and too many requests apart from other errors", async () => {
    for (const [status, code] of [
      [401, "key_rejected"],
      [403, "key_rejected"],
      [429, "rate_limited"],
      [422, "http_error"],
    ] as const) {
      vi.stubGlobal("fetch", answer(status));
      await expect(fetchFeed("https://partner.example/x", withKey)).rejects.toMatchObject({ code });
    }
  });

  it("never follows a redirect with the key", async () => {
    const fetch = answer(302, { location: "https://elsewhere.example/" });
    vi.stubGlobal("fetch", fetch);
    await expect(fetchFeed("https://partner.example/x", withKey)).rejects.toMatchObject({
      code: "http_error",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
