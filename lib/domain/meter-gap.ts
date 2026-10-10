// Meter continuity between rentals (BKG-7): a rental's start readings against the last known
// readings of the aircraft (the previous rental's end, or a reading the owner recorded). Pure.
// Meters never run backwards, so a lower start is a typo (shown to pilot and owner). A higher
// start means flying outside ownAplane or an unlogged flight (owner only, never a block).

export type Meter = "hobbs" | "tach";

/** A known reading: the end of an earlier rental, or one the owner recorded. */
export type MeterPoint = {
  at: Date;
  hobbs: number | null;
  tach: number | null;
  source: "log" | "reading";
};

export type MeterFinding = {
  meter: Meter;
  type: "below" | "gap";
  start: number;
  known: number;
  knownAt: Date;
  source: "log" | "reading";
  /** start − known, in hours (one decimal). */
  diff: number;
};

/** Meters show tenths and people round: differences up to this are the same reading. */
export const GAP_TOLERANCE_H = 0.1;

export function meterFindings(
  start: { hobbs: number | null; tach: number | null },
  points: MeterPoint[],
  before: Date,
): MeterFinding[] {
  const findings: MeterFinding[] = [];
  for (const meter of ["hobbs", "tach"] as const) {
    const value = start[meter];
    if (value === null) continue;
    // The latest earlier point that has this meter.
    const last = points
      .filter((p) => p[meter] !== null && p.at < before)
      .sort((a, b) => b.at.getTime() - a.at.getTime())[0];
    if (!last) continue;
    const known = last[meter]!;
    const diff = Math.round((value - known) * 10) / 10;
    if (Math.abs(value - known) <= GAP_TOLERANCE_H) continue;
    findings.push({
      meter,
      type: diff < 0 ? "below" : "gap",
      start: value,
      known,
      knownAt: last.at,
      source: last.source,
      diff,
    });
  }
  return findings;
}
