import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { getAirport } from "@/lib/airports";
import { asUser } from "@/lib/db/rls";
import { type FlightUplift, flightLegs, flightRemarks, flightUplifts } from "@/lib/db/schema";
import { type LegInstants, legTimeIssues } from "@/lib/domain/leg-times";
import { type Done, refusal } from "./outcome";

// What the pilot enters in a flight log while it's editable (BKG-12…15): legs, fuel and oil
// added, remarks. Shared by the website's forms and the API; SI units and UTC; RLS decides.

export type LegInput = LegInstants & {
  from: string;
  to: string;
  landings: number;
  hobbsStart: number | null;
  hobbsEnd: number | null;
  tachStart: number | null;
  tachEnd: number | null;
  fuelBeforeL: number | null;
  fuelAfterL: number | null;
  oilBeforeL: number | null;
  oilAfterL: number | null;
};

/** Add a leg (legId null) or change one; times must be in the order they happen. */
export async function saveLeg(
  userId: string,
  logId: string,
  legId: string | null,
  leg: LegInput,
): Promise<Done<{ legId: string }>> {
  const issues = legTimeIssues(leg);
  if (issues.length) return { ok: false, error: "leg_order", issues };
  const [fromAirport, toAirport] = await Promise.all([getAirport(leg.from), getAirport(leg.to)]);
  if (!fromAirport) return { ok: false, error: "unknown_airfield", field: "from" };
  if (!toAirport) return { ok: false, error: "unknown_airfield", field: "to" };
  const { from: _from, to: _to, ...rest } = leg;
  const values = { ...rest, fromIdent: fromAirport.ident, toIdent: toAirport.ident };
  try {
    const saved = await asUser(userId, async (tx) => {
      if (legId) {
        return tx
          .update(flightLegs)
          .set(values)
          .where(and(eq(flightLegs.id, legId), eq(flightLegs.flightLogId, logId)))
          .returning({ id: flightLegs.id });
      }
      const [last] = await tx
        .select({ seq: sql<number>`coalesce(max(${flightLegs.seq}), 0)::int` })
        .from(flightLegs)
        .where(eq(flightLegs.flightLogId, logId));
      return tx
        .insert(flightLegs)
        .values({ ...values, flightLogId: logId, seq: (last?.seq ?? 0) + 1 })
        .returning({ id: flightLegs.id });
    });
    return saved[0] ? { ok: true, legId: saved[0].id } : { ok: false, error: "not_editable" };
  } catch (e) {
    const fail = refusal(e);
    return fail.error === "checks_failed" ? { ...fail, error: "leg_checks" } : fail;
  }
}

export async function deleteLeg(userId: string, logId: string, legId: string): Promise<Done> {
  const rows = await asUser(userId, (tx) =>
    tx
      .delete(flightLegs)
      .where(and(eq(flightLegs.id, legId), eq(flightLegs.flightLogId, logId)))
      .returning({ id: flightLegs.id }),
  );
  return rows.length ? { ok: true } : { ok: false, error: "not_editable" };
}

export type UpliftInput = Pick<
  FlightUplift,
  "kind" | "quantityL" | "fuelType" | "oilGrade" | "price" | "paidBy" | "receiptId"
> & { airport: string };

/** Fuel or oil added during the rental (BKG-13, BKG-14): add (upliftId null) or change. */
export async function saveUplift(
  userId: string,
  logId: string,
  upliftId: string | null,
  input: UpliftInput,
): Promise<Done<{ upliftId: string }>> {
  const found = await getAirport(input.airport);
  if (!found) return { ok: false, error: "unknown_airfield", field: "airport" };
  const { airport: _airport, ...rest } = input;
  const row = { ...rest, airportIdent: found.ident };
  try {
    const saved = await asUser(userId, (tx) =>
      upliftId
        ? tx
            .update(flightUplifts)
            .set(row)
            .where(and(eq(flightUplifts.id, upliftId), eq(flightUplifts.flightLogId, logId)))
            .returning({ id: flightUplifts.id })
        : tx
            .insert(flightUplifts)
            .values({ ...row, flightLogId: logId })
            .returning({ id: flightUplifts.id }),
    );
    return saved[0] ? { ok: true, upliftId: saved[0].id } : { ok: false, error: "not_editable" };
  } catch (e) {
    return refusal(e);
  }
}

export async function deleteUplift(userId: string, logId: string, upliftId: string): Promise<Done> {
  const rows = await asUser(userId, (tx) =>
    tx
      .delete(flightUplifts)
      .where(and(eq(flightUplifts.id, upliftId), eq(flightUplifts.flightLogId, logId)))
      .returning({ id: flightUplifts.id }),
  );
  return rows.length ? { ok: true } : { ok: false, error: "not_editable" };
}

export type RemarkInput = {
  kind: "aircraft" | "weather" | "airfield";
  airport: string | null;
  body: string;
};

/** A remark or PIREP (BKG-15). */
export async function addRemark(
  userId: string,
  logId: string,
  input: RemarkInput,
): Promise<Done<{ remarkId: string }>> {
  const found = input.airport ? await getAirport(input.airport) : null;
  if (input.airport && !found) return { ok: false, error: "unknown_airfield", field: "airport" };
  try {
    const [row] = await asUser(userId, (tx) =>
      tx
        .insert(flightRemarks)
        .values({
          flightLogId: logId,
          // Filled in from the booking by a database trigger.
          aircraftId: sql`null`,
          kind: input.kind,
          airportIdent: found?.ident ?? null,
          body: input.body,
        })
        .returning({ id: flightRemarks.id }),
    );
    return { ok: true, remarkId: row!.id };
  } catch (e) {
    return refusal(e);
  }
}

export async function deleteRemark(userId: string, logId: string, remarkId: string): Promise<Done> {
  const rows = await asUser(userId, (tx) =>
    tx
      .delete(flightRemarks)
      .where(and(eq(flightRemarks.id, remarkId), eq(flightRemarks.flightLogId, logId)))
      .returning({ id: flightRemarks.id }),
  );
  return rows.length ? { ok: true } : { ok: false, error: "not_editable" };
}
