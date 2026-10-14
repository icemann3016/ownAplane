import "server-only";

import { and, eq } from "drizzle-orm";

import { pgError } from "@/lib/aircraft/manage";
import { asUser } from "@/lib/db/rls";
import { airportRequestItems, airportRequests } from "@/lib/db/schema";
import type { AirportRequestInput, RequestAnswerInput } from "@/lib/validation/airport-request";

// Pilots' requests to airfields (APT-2…4), with the user's own rights: pilots send and cancel
// theirs, the airfield's team answers (RLS + triggers in 0087). Prices of the services asked
// for are copied from the airfield's list by the database.

export type SendError =
  | "not_pilot"
  | "unknown_airfield"
  | "booking_not_yours"
  | "in_the_past"
  | "too_many_requests"
  | "unknown_service";
export type SendResult =
  { ok: true; id: string; status: "pending" | "approved" } | { ok: false; error: SendError };

const KNOWN: SendError[] = [
  "unknown_airfield",
  "booking_not_yours",
  "in_the_past",
  "too_many_requests",
  "unknown_service",
];

/** Send a request: pending for airfields with PPR, confirmed at once for the others. */
export async function sendAirportRequest(
  userId: string,
  ident: string,
  input: AirportRequestInput,
): Promise<SendResult> {
  try {
    const row = await asUser(userId, async (tx) => {
      const [request] = await tx
        .insert(airportRequests)
        .values({
          airportIdent: ident,
          pilotId: userId,
          bookingId: input.bookingId,
          registration: input.registration,
          aircraftType: input.aircraftType,
          mtomKg: input.mtomKg,
          arrivalAt: input.arrivalAt,
          fromIdent: input.fromIdent,
          departureAt: input.departureAt,
          toIdent: input.toIdent,
          pob: input.pob,
          purpose: input.purpose,
          otherRequest: input.other,
        })
        .returning({ id: airportRequests.id, status: airportRequests.status });
      if (input.services.length) {
        await tx.insert(airportRequestItems).values(
          input.services.map((s) => ({
            requestId: request!.id,
            serviceId: s.serviceId,
            quantity: s.quantity,
            // Name, unit and price are filled in from the airfield's list.
            category: "other" as const,
            unit: "once" as const,
          })),
        );
      }
      return request!;
    });
    return { ok: true, id: row.id, status: row.status === "approved" ? "approved" : "pending" };
  } catch (e) {
    const { code, message = "" } = pgError(e);
    if (code === "42501") return { ok: false, error: "not_pilot" };
    if (code === "23503") return { ok: false, error: "unknown_airfield" };
    const known = KNOWN.find((k) => message.includes(k));
    if (known) return { ok: false, error: known };
    if (message.includes("too_many_rows")) return { ok: false, error: "unknown_service" };
    throw e;
  }
}

export type ChangeResult = { ok: true } | { ok: false; error: "not_allowed" | "request_closed" };

async function change(run: () => Promise<unknown[]>): Promise<ChangeResult> {
  try {
    return (await run()).length ? { ok: true } : { ok: false, error: "not_allowed" };
  } catch (e) {
    const { code, message = "" } = pgError(e);
    if (message.includes("request_closed")) return { ok: false, error: "request_closed" };
    if (message.includes("not_allowed") || code === "42501") {
      return { ok: false, error: "not_allowed" };
    }
    throw e;
  }
}

/** The pilot cancels an open or approved request. */
export function cancelAirportRequest(userId: string, id: string) {
  return change(() =>
    asUser(userId, (tx) =>
      tx
        .update(airportRequests)
        .set({ status: "cancelled" })
        .where(and(eq(airportRequests.id, id), eq(airportRequests.pilotId, userId)))
        .returning({ id: airportRequests.id }),
    ),
  );
}

/** The airfield's team approves (with a PPR number and conditions) or declines. */
export function answerAirportRequest(userId: string, id: string, input: RequestAnswerInput) {
  const approve = input.decision === "approve";
  return change(() =>
    asUser(userId, (tx) =>
      tx
        .update(airportRequests)
        .set({
          status: approve ? "approved" : "declined",
          pprNumber: approve ? input.pprNumber : null,
          conditions: approve ? input.conditions : null,
          operatorNote: input.note,
        })
        .where(eq(airportRequests.id, id))
        .returning({ id: airportRequests.id }),
    ),
  );
}
