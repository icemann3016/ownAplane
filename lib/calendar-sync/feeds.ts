import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import ICAL from "ical.js";
import { z } from "zod";

import { zonedToUtc } from "@/lib/domain/time";
import { type ExternalEvent, SYNC_AHEAD_MS, SYNC_PAST_MS } from "./events";

// Reading another system's busy times from a link (SYN-1): an iCal feed (Google Calendar,
// Outlook, most booking systems) or a simple JSON list (easy to add to a custom system; format
// in docs/api.md). Errors are FeedErrors with a code the owner sees, translated.

export type FeedErrorCode =
  | "url_invalid"
  | "address_blocked"
  | "unreachable"
  | "http_error"
  | "too_large"
  | "ical_invalid"
  | "json_invalid";

export class FeedError extends Error {
  constructor(
    readonly code: FeedErrorCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

/** Loopback, private, link-local (cloud metadata), carrier-grade NAT and other non-public IPs. */
export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const v6 = ip.toLowerCase();
  return (
    v6 === "::" ||
    v6 === "::1" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    v6.startsWith("fe8") ||
    v6.startsWith("fe9") ||
    v6.startsWith("fea") ||
    v6.startsWith("feb") ||
    v6.startsWith("ff")
  );
}

async function assertPublic(url: URL) {
  if (url.protocol !== "https:") throw new FeedError("url_invalid", "only https links");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [host]
    : await lookup(host, { all: true }).then(
        (r) => r.map((a) => a.address),
        () => {
          throw new FeedError("unreachable", "unknown host");
        },
      );
  if (!addresses.length || addresses.some(isPrivateAddress)) {
    throw new FeedError("address_blocked");
  }
}

/** GET a public https link (redirects checked too), at most 2 MB and 8 seconds. */
export async function fetchFeed(link: string): Promise<{ text: string; contentType: string }> {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new FeedError("url_invalid");
  }
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal,
        headers: { accept: "text/calendar, application/json;q=0.9, */*;q=0.5" },
      });
    } catch (e) {
      throw new FeedError("unreachable", e instanceof Error ? e.message : undefined);
    }
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    if (!res.ok) throw new FeedError("http_error", String(res.status));
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES)
      throw new FeedError("too_large");
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new FeedError("too_large");
      }
      chunks.push(value);
    }
    return {
      text: Buffer.concat(chunks).toString("utf8"),
      contentType: res.headers.get("content-type") ?? "",
    };
  }
  throw new FeedError("unreachable", "too many redirects");
}

// --- JSON: { "busy": [ { "id": "42", "start": "2026-10-20T08:00:00Z", "end": "…" } ] } ---

const instant = z.iso.datetime({ offset: true }).transform((v) => new Date(v));
const jsonItem = z
  .object({
    id: z.union([z.string().min(1).max(200), z.number()]).transform(String),
    start: instant.optional(),
    end: instant.optional(),
    from: instant.optional(),
    to: instant.optional(),
  })
  .transform((i) => ({ id: i.id, from: i.start ?? i.from, to: i.end ?? i.to }))
  .refine((i) => i.from && i.to, "start and end are required");
const jsonFeed = z.union([z.array(jsonItem), z.object({ busy: z.array(jsonItem) })]);

export function parseJsonFeed(text: string): ExternalEvent[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new FeedError("json_invalid", "not JSON");
  }
  const parsed = jsonFeed.safeParse(data);
  if (!parsed.success) throw new FeedError("json_invalid", parsed.error.issues[0]?.message);
  const items = Array.isArray(parsed.data) ? parsed.data : parsed.data.busy;
  return items.map((i) => ({ id: i.id, from: i.from!, to: i.to! }));
}

// --- iCal (RFC 5545), recurring events expanded with ical.js ---

const MAX_OCCURRENCES = 2000;

/** An iCal time as an instant. Floating and all-day times count as UTC (all our times are). */
function toDate(time: ICAL.Time, tzid: string | null): Date {
  const zone = time.zone?.tzid;
  if (!time.isDate && tzid && (zone === "floating" || !zone)) {
    // TZID without a VTIMEZONE in the feed: use the IANA zone if it is one.
    const local = time.toString().slice(0, 16);
    const resolved = zonedToUtc(local, tzid);
    if (resolved) return resolved;
  }
  return new Date(time.toUnixTime() * 1000);
}

const idFor = (uid: string, occurrence?: Date) => {
  const base = uid.length > 160 ? uid.slice(0, 160) : uid;
  return occurrence ? `${base}#${occurrence.toISOString()}` : base;
};

export function parseIcsFeed(text: string, now = new Date()): ExternalEvent[] {
  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(text));
  } catch (e) {
    throw new FeedError("ical_invalid", e instanceof Error ? e.message : undefined);
  }
  if (root.name !== "vcalendar") throw new FeedError("ical_invalid", "no VCALENDAR");
  for (const tz of root.getAllSubcomponents("vtimezone")) {
    try {
      ICAL.TimezoneService.register(tz);
    } catch {
      // a broken time zone only affects its own events
    }
  }
  const windowStart = now.getTime() - SYNC_PAST_MS;
  const windowEnd = now.getTime() + SYNC_AHEAD_MS;

  // Recurring events with changed or cancelled occurrences (RECURRENCE-ID) are related first.
  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Component[] = [];
  for (const vevent of root.getAllSubcomponents("vevent")) {
    if (vevent.hasProperty("recurrence-id")) exceptions.push(vevent);
    else {
      const event = new ICAL.Event(vevent);
      if (event.uid) masters.set(event.uid, event);
    }
  }
  for (const ex of exceptions) {
    const uid = String(ex.getFirstPropertyValue("uid") ?? "");
    masters.get(uid)?.relateException(ex);
  }

  const busy = (component: ICAL.Component) =>
    String(component.getFirstPropertyValue("status") ?? "").toUpperCase() !== "CANCELLED" &&
    String(component.getFirstPropertyValue("transp") ?? "").toUpperCase() !== "TRANSPARENT";
  const tzidOf = (component: ICAL.Component, prop: string) =>
    (component.getFirstProperty(prop)?.getParameter("tzid") as string | undefined) ?? null;

  const out: ExternalEvent[] = [];
  for (const [uid, event] of masters) {
    if (!busy(event.component) || !event.startDate) continue;
    const startTz = tzidOf(event.component, "dtstart");
    if (!event.isRecurring()) {
      const from = toDate(event.startDate, startTz);
      const to = event.endDate
        ? toDate(event.endDate, tzidOf(event.component, "dtend") ?? startTz)
        : from;
      out.push({ id: idFor(uid), from, to });
      continue;
    }
    const it = event.iterator();
    for (let next = it.next(); next && out.length < MAX_OCCURRENCES; next = it.next()) {
      const details = event.getOccurrenceDetails(next);
      const from = toDate(details.startDate, startTz);
      if (from.getTime() > windowEnd) break;
      const to = toDate(details.endDate, startTz);
      if (to.getTime() <= windowStart) continue;
      if (!busy(details.item.component)) continue;
      out.push({ id: idFor(uid, toDate(details.recurrenceId, startTz)), from, to });
    }
  }
  return out;
}

/** Parse a feed by what it looks like (connections say which, but servers mislabel types). */
export function parseFeed(kind: "ical" | "json", text: string, now?: Date): ExternalEvent[] {
  return kind === "ical" ? parseIcsFeed(text, now) : parseJsonFeed(text);
}
