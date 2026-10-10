// Cross-checks on a flight log (BKG-7, BKG-12…14): fuel of the wrong type, meters against the
// engine times, fuel burn against the aircraft's usual figure, and flying outside the booked
// time. Pure. Warnings for pilot and owner, never blocks: the owner decides when confirming.

import type { FUEL_TYPES } from "@/lib/aircraft/catalog";

export type FuelType = (typeof FUEL_TYPES)[number];

/** Meter tolerance: 0.1 h plus 10 % of the engine time (meters show tenths, people round). */
const meterTolerance = (hours: number) => 0.1 + hours * 0.1;
/** Fuel burn outside these multiples of the aircraft's L/h is flagged (gauges are rough). */
export const BURN_HIGH = 1.6;
export const BURN_LOW = 0.4;
/** Legs shorter than this (engine time) are mostly taxi and climb: no burn check. */
const MIN_BURN_HOURS = 0.5;
/** Starting a little early or finishing a little late isn't worth a warning. */
export const GRACE_MINUTES = 15;

export type LogCheck =
  | {
      type: "wrongFuel";
      /** danger: piston fuel in a Jet A-1 engine or the other way round; caution: lower grade. */
      severity: "danger" | "caution";
      airport: string;
      fuel: FuelType;
      expected: FuelType;
    }
  | { type: "hobbsLong" | "tachLong"; seq: number; meterH: number; engineH: number }
  | { type: "hobbsShort"; seq: number; meterH: number; airH: number }
  | {
      type: "fuelHigh" | "fuelLow";
      seq: number;
      usedL: number;
      hours: number;
      lph: number;
      expectedLph: number;
    }
  | { type: "early"; seq: number; at: Date; limit: Date }
  | { type: "late" | "intoNext"; seq: number; at: Date; limit: Date };

/** Piston fuels by grade: a lower grade than the aircraft's needs an engine approval. */
const GRADE: Record<Exclude<FuelType, "jet_a1">, number> = { mogas: 1, ul91: 2, avgas_100ll: 3 };

/** How wrong a fuel is for an aircraft: null when it's the right one (or a higher grade). */
export function fuelMismatch(aircraft: FuelType, fuel: FuelType): "danger" | "caution" | null {
  if ((aircraft === "jet_a1") !== (fuel === "jet_a1")) return "danger";
  if (aircraft === "jet_a1" || fuel === "jet_a1") return null;
  return GRADE[fuel] < GRADE[aircraft] ? "caution" : null;
}

export type LegForLogChecks = {
  seq: number;
  engineStart: Date;
  engineStop: Date;
  takeoffAt: Date | null;
  landingAt: Date | null;
  hobbsStart: number | null;
  hobbsEnd: number | null;
  tachStart: number | null;
  tachEnd: number | null;
  fuelBeforeL: number | null;
  fuelAfterL: number | null;
};

export type LogCheckInput = {
  aircraft: { fuelType: FuelType; fuelBurnLph: number | null };
  booked: { from: Date; to: Date };
  /** Start of the next busy time of the aircraft after this booking, if any. */
  nextFrom: Date | null;
  legs: LegForLogChecks[];
  uplifts: { kind: "fuel" | "oil"; airportIdent: string; fuelType: FuelType | null }[];
};

const hoursBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000;
const round1 = (v: number) => Math.round(v * 10) / 10;

export function logChecks({ aircraft, booked, nextFrom, legs, uplifts }: LogCheckInput) {
  const checks: LogCheck[] = [];

  const seenFuel = new Set<string>();
  for (const u of uplifts) {
    if (u.kind !== "fuel" || !u.fuelType) continue;
    const severity = fuelMismatch(aircraft.fuelType, u.fuelType);
    const key = `${u.airportIdent}:${u.fuelType}`;
    if (!severity || seenFuel.has(key)) continue;
    seenFuel.add(key);
    checks.push({
      type: "wrongFuel",
      severity,
      airport: u.airportIdent,
      fuel: u.fuelType,
      expected: aircraft.fuelType,
    });
  }

  const grace = GRACE_MINUTES * 60_000;
  for (const leg of [...legs].sort((a, b) => a.seq - b.seq)) {
    const engineH = hoursBetween(leg.engineStart, leg.engineStop);
    const airH = leg.takeoffAt && leg.landingAt ? hoursBetween(leg.takeoffAt, leg.landingAt) : null;
    const tolerance = meterTolerance(engineH);

    if (leg.hobbsStart !== null && leg.hobbsEnd !== null) {
      const meterH = round1(leg.hobbsEnd - leg.hobbsStart);
      if (meterH > engineH + tolerance) {
        checks.push({ type: "hobbsLong", seq: leg.seq, meterH, engineH: round1(engineH) });
      } else if (airH !== null && meterH < airH - meterTolerance(airH)) {
        checks.push({ type: "hobbsShort", seq: leg.seq, meterH, airH: round1(airH) });
      }
    }
    if (leg.tachStart !== null && leg.tachEnd !== null) {
      const meterH = round1(leg.tachEnd - leg.tachStart);
      if (meterH > engineH + tolerance) {
        checks.push({ type: "tachLong", seq: leg.seq, meterH, engineH: round1(engineH) });
      }
    }

    if (
      aircraft.fuelBurnLph &&
      engineH >= MIN_BURN_HOURS &&
      leg.fuelBeforeL !== null &&
      leg.fuelAfterL !== null
    ) {
      const usedL = leg.fuelBeforeL - leg.fuelAfterL;
      const lph = usedL / engineH;
      const out =
        lph > aircraft.fuelBurnLph * BURN_HIGH
          ? "fuelHigh"
          : lph < aircraft.fuelBurnLph * BURN_LOW
            ? "fuelLow"
            : null;
      if (out) {
        checks.push({
          type: out,
          seq: leg.seq,
          usedL: round1(usedL),
          hours: round1(engineH),
          lph: Math.round(lph),
          expectedLph: aircraft.fuelBurnLph,
        });
      }
    }

    if (leg.engineStart.getTime() < booked.from.getTime() - grace) {
      checks.push({ type: "early", seq: leg.seq, at: leg.engineStart, limit: booked.from });
    }
    if (nextFrom && leg.engineStop > nextFrom) {
      checks.push({ type: "intoNext", seq: leg.seq, at: leg.engineStop, limit: nextFrom });
    } else if (leg.engineStop.getTime() > booked.to.getTime() + grace) {
      checks.push({ type: "late", seq: leg.seq, at: leg.engineStop, limit: booked.to });
    }
  }
  return checks;
}
