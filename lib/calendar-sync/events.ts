// Busy times from other booking systems (SYN-1, SYN-4), before they are stored. Pure.

export type ExternalEvent = {
  /** The other system's id for this booking (iCal UID, JSON id, pushed id). */
  id: string;
  from: Date;
  to: Date;
  // Optional extras; used only when the owner chose to take them (IMPORT_FIELDS).
  /** The booking's title or summary. */
  title?: string | null;
  /** Maintenance, or anything else (a booking). */
  type?: "booking" | "maintenance";
  /** Not confirmed yet (iCal STATUS:TENTATIVE, JSON/API status "tentative"). */
  tentative?: boolean;
  /** The aircraft the other system says this is for. */
  registration?: string | null;
};

/** Registrations compared loosely: "lz-abc", "LZABC" and "LZ-ABC" are the same aircraft. */
export const sameRegistration = (a: string, b: string) =>
  a.replace(/[^a-z0-9]/gi, "").toUpperCase() === b.replace(/[^a-z0-9]/gi, "").toUpperCase();

/** How far back and ahead busy times are kept: past ones don't matter, far future ones rarely. */
export const SYNC_PAST_MS = 24 * 60 * 60 * 1000;
export const SYNC_AHEAD_MS = 400 * 24 * 60 * 60 * 1000;
/** Longest single busy time (a year, like owner blocks) and most events per connection. */
const MAX_LENGTH_MS = 366 * 24 * 60 * 60 * 1000;
export const MAX_EVENTS = 2000;

export type EventProblem = { id: string; problem: "invalid" | "too_long" };

/**
 * Valid events within the sync window, end clipped to it, one per id (the last wins), sorted by
 * start, at most MAX_EVENTS; plus the ones that were refused and why.
 */
export function normalizeEvents(
  events: ExternalEvent[],
  now = new Date(),
): { events: ExternalEvent[]; problems: EventProblem[] } {
  const earliest = now.getTime() - SYNC_PAST_MS;
  const latest = now.getTime() + SYNC_AHEAD_MS;
  const byId = new Map<string, ExternalEvent>();
  const problems: EventProblem[] = [];
  for (const e of events) {
    const id = e.id.trim();
    const from = e.from.getTime();
    const to = e.to.getTime();
    if (!id || id.length > 200 || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
      problems.push({ id: id.slice(0, 200), problem: "invalid" });
      continue;
    }
    if (to - from > MAX_LENGTH_MS) {
      problems.push({ id, problem: "too_long" });
      continue;
    }
    if (to <= earliest || from >= latest) continue; // outside the window: nothing to block
    byId.set(id, {
      ...e,
      id,
      title: e.title?.trim().slice(0, 200) || null,
      to: new Date(Math.min(to, latest)),
    });
  }
  const sorted = [...byId.values()].sort((a, b) => a.from.getTime() - b.from.getTime());
  return { events: sorted.slice(0, MAX_EVENTS), problems };
}

/** A Postgres tstzrange literal, start inclusive, end exclusive. */
export const rangeOf = (e: { from: Date; to: Date }) =>
  `[${e.from.toISOString()},${e.to.toISOString()})`;
