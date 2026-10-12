import { z } from "zod";

import { zonedDay, zonedToUtc } from "@/lib/domain/time";
import type { ExternalEvent } from "./events";
import { FeedError, fetchFeed } from "./feeds";
import { PARTNER_INFO } from "./partner-list";

// RAF Aviation's public API (https://rafaviation.flights/api-docs, SYN-7): GET /api/v1/bookings
// with the owner's key as a Bearer token returns the bookings of EC-IDR that haven't ended, as
// local dates and times in Europe/Sofia, "pending" or "approved". It only reads: RAF Aviation
// can subscribe to the connection's iCal link to see our bookings.

const ZONE = "Europe/Sofia";
const DAY_MS = 24 * 60 * 60 * 1000;
/** How far ahead we ask (our window is 400 days; a year covers what clubs book). */
const DAYS_AHEAD = 366;
/** Statuses that don't keep the aircraft busy, should the API ever send them. */
const NOT_BUSY = new Set(["rejected", "expired", "cancelled", "canceled"]);

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/);
const response = z.object({
  data: z.array(
    z.object({
      date: z.iso.date(),
      from: time,
      to: time,
      status: z.string().max(40),
    }),
  ),
});

const nextDay = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

/** A local date and time ("24:00" = the next midnight) as an instant. */
const instant = (date: string, hhmm: string) =>
  hhmm === "24:00"
    ? zonedToUtc(`${nextDay(date)}T00:00`, ZONE)
    : zonedToUtc(`${date}T${hhmm}`, ZONE);

/**
 * RAF Aviation bookings as busy times: local times to UTC; an end at or before the start is on
 * the next day; "pending" ones are tentative. Their id is the date and times (the API has none).
 * Pure.
 */
export function rafBookingsToEvents(json: unknown): ExternalEvent[] {
  const parsed = response.safeParse(json);
  if (!parsed.success) throw new FeedError("json_invalid", parsed.error.issues[0]?.message);
  const registration = PARTNER_INFO.rafaviation.registrations[0] ?? null;
  const events: ExternalEvent[] = [];
  for (const b of parsed.data.data) {
    const status = b.status.toLowerCase();
    if (NOT_BUSY.has(status)) continue;
    const endDate = b.to === "24:00" || b.to > b.from ? b.date : nextDay(b.date);
    const from = instant(b.date, b.from);
    const to = b.to === "24:00" ? instant(b.date, b.to) : instant(endDate, b.to);
    if (!from || !to) throw new FeedError("json_invalid", `bad time on ${b.date}`);
    events.push({
      id: `${b.date}T${b.from}/${b.to}`,
      from,
      to,
      type: "booking",
      tentative: status === "pending",
      registration,
    });
  }
  return events;
}

/** Read RAF Aviation's bookings from today (Sofia) to a year ahead with the owner's key. */
export async function readRafAviation(
  apiKey: string,
  now = new Date(),
  fetcher: typeof fetchFeed = fetchFeed,
): Promise<ExternalEvent[]> {
  const base = (process.env.RAFAVIATION_API_URL || PARTNER_INFO.rafaviation.site).replace(
    /\/$/,
    "",
  );
  const query = new URLSearchParams({
    from: zonedDay(now, ZONE),
    to: zonedDay(new Date(now.getTime() + DAYS_AHEAD * DAY_MS), ZONE),
  });
  const { text } = await fetcher(`${base}/api/v1/bookings?${query}`, {
    headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
    trusted: true,
  });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new FeedError("json_invalid", "not JSON");
  }
  return rafBookingsToEvents(json);
}
