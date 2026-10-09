import "server-only";

import { sql } from "drizzle-orm";

import { getVisibleAircraft } from "@/lib/aircraft/public";
import { getAirport } from "@/lib/airports";
import { syncAircraftCalendars } from "@/lib/calendar-sync/sync";
import { asUser } from "@/lib/db/rls";
import { isWeekend, localDaysTouched, toRange, zonedToUtc } from "@/lib/domain/time";
import { estimatePrice } from "@/lib/domain/pricing";
import type { BookingRequestInput } from "@/lib/validation/booking";

export type RequestOutcome =
  | { ok: true; id: string }
  | {
      ok: false;
      error: string;
      detail?: string;
      field?: string;
      /** UTC period, when the request got that far (to explain eligibility). */
      period?: { from: Date; to: Date };
    };

/**
 * Send a booking request as the logged-in pilot (BKG-1, BKG-2). The database checks everything
 * again (eligibility, free time, passengers); this works out UTC times and the estimate.
 */
export async function requestBooking(
  userId: string,
  input: BookingRequestInput,
): Promise<RequestOutcome> {
  const row = await getVisibleAircraft(userId, input.aircraftId);
  if (!row || row.aircraft.status !== "listed" || row.aircraft.pricePerHour === null) {
    return { ok: false, error: "aircraft_unavailable" };
  }
  const a = row.aircraft;
  const departure = await getAirport(input.departure);
  if (!departure) return { ok: false, error: "unknown_airfield", field: "departure" };
  const from = zonedToUtc(input.from, "UTC");
  const to = zonedToUtc(input.to, "UTC");
  if (!from) return { ok: false, error: "dateTimeInvalid", field: "from" };
  if (!to || to <= from) return { ok: false, error: "endBeforeStart", field: "to" };

  const price = estimatePrice({
    pricePerHour: a.pricePerHour!,
    weekendPricePerHour: a.weekendPricePerHour,
    minHoursPerDay: a.minHoursPerDay,
    priceBasis: a.priceBasis,
    fuelBurnLph: a.fuelBurnLph,
    plannedHours: input.plannedHours,
    days: localDaysTouched(from, to, "UTC"),
    weekend: isWeekend(from, "UTC"),
  });

  // SYN-2: busy times from linked calendars are fresh, so time taken elsewhere isn't requested.
  await syncAircraftCalendars(a.id);
  try {
    const rows = (await asUser(userId, (tx) =>
      tx.execute(sql`select public.request_booking(
        ${a.id}::uuid, ${toRange(from, to)}::tstzrange, ${departure.ident}, ${input.arrival},
        ${`{${input.stops.join(",")}}`}::text[], ${input.purpose}::public.booking_purpose,
        ${input.passengers}, ${input.plannedHours}, ${input.message}, ${price.amount}) as id`),
    )) as unknown as { id: string }[];
    return { ok: true, id: rows[0]!.id };
  } catch (e) {
    const err = e as { cause?: { code?: string; message?: string; detail?: string } };
    if (err.cause?.code === "23P01") return { ok: false, error: "not_free" };
    if (err.cause?.code === "P0001" && err.cause.message) {
      return {
        ok: false,
        error: err.cause.message,
        detail: err.cause.detail,
        period: { from, to },
      };
    }
    throw e;
  }
}

/** Airfields of a request (departure, stops, arrival), for the eligibility reasons. */
export function flightAirfields(
  input: Pick<BookingRequestInput, "departure" | "arrival" | "stops">,
) {
  return [input.departure, ...input.stops, input.arrival];
}
