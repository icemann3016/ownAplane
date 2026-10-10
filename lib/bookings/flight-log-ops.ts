import "server-only";

import { eq, sql } from "drizzle-orm";

import { asUser } from "@/lib/db/rls";
import { flightLogs } from "@/lib/db/schema";
import { fuelSettlement } from "@/lib/domain/flight-log";
import { bookingAmount } from "./amount";
import { getFlightLog } from "./flight-log";
import { type Done, refusal } from "./outcome";
import { getBooking } from "./queries";

// Flight log operations (BKG-7, BKG-14, BKG-18): check-out, check-in, correction and the owner's
// confirmation, shared by the website's forms and the API. Legs, fuel and remarks are in
// log-entries.ts. The database decides who may do what (RLS and its functions).

/** Check-out: start the flight log; with passengers the pilot confirms FCL.060 (BKG-18). */
export async function startFlightLog(
  userId: string,
  bookingId: string,
  recencyConfirmed: boolean,
): Promise<Done<{ logId: string }>> {
  try {
    const [row] = (await asUser(userId, (tx) =>
      tx.execute(
        sql`select public.start_flight_log(${bookingId}::uuid, ${recencyConfirmed}) as id`,
      ),
    )) as unknown as { id: string }[];
    return { ok: true, logId: row!.id };
  } catch (e) {
    return refusal(e);
  }
}

export type CheckoutReadings = {
  hobbsStart: number | null;
  tachStart: number | null;
  fuelStartL: number | null;
  oilStartL: number | null;
  checkoutPhotoId?: string | null;
};

export async function saveCheckoutReadings(
  userId: string,
  logId: string,
  readings: CheckoutReadings,
): Promise<Done> {
  try {
    const rows = await asUser(userId, (tx) =>
      tx
        .update(flightLogs)
        .set(readings)
        .where(eq(flightLogs.id, logId))
        .returning({ id: flightLogs.id }),
    );
    return rows.length ? { ok: true } : { ok: false, error: "not_editable" };
  } catch (e) {
    return refusal(e);
  }
}

async function run(userId: string, query: ReturnType<typeof sql>): Promise<Done> {
  try {
    await asUser(userId, (tx) => tx.execute(query));
    return { ok: true };
  } catch (e) {
    return refusal(e);
  }
}

/** Check-in: the pilot sends the log to the owner. */
export const submitFlightLog = (userId: string, logId: string) =>
  run(userId, sql`select public.submit_flight_log(${logId}::uuid)`);

/** The owner asks the pilot to correct the log. */
export const requestLogCorrection = (userId: string, logId: string, note: string) =>
  run(userId, sql`select public.request_log_correction(${logId}::uuid, ${note})`);

/** The owner confirms; flown time and amount due are worked out again here, never sent in. */
export async function confirmFlightLog(userId: string, bookingId: string): Promise<Done> {
  const detail = await getBooking(userId, bookingId);
  const data = detail ? await getFlightLog(userId, bookingId) : null;
  if (!detail || !data) return { ok: false, error: "not_found" };
  const fuel = fuelSettlement(data.uplifts, detail.booking.priceBasis);
  const result = bookingAmount(detail.booking, detail.period, "UTC", data.legs, fuel.adjustment);
  if (!result) return { ok: false, error: "missing_meters" };
  return run(
    userId,
    sql`select public.confirm_flight_log(${data.log.id}::uuid, ${result.minutes}, ${result.amount}, ${result.fuelAdjustment})`,
  );
}
