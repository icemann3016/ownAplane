import "server-only";

import { getBusyPeriods } from "@/lib/aircraft/calendar";
import { type LogCheck, logChecks } from "@/lib/domain/log-checks";
import type { FlightLogData } from "./flight-log";
import type { BookingDetail } from "./queries";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Cross-checks of a flight log (wrong fuel, meters, fuel burn, flying outside the booked time)
 * for its pilot and owner. The next busy time of the aircraft comes from the calendar view
 * everyone may see (times and kinds only).
 */
export async function getLogChecks(
  viewerId: string,
  detail: BookingDetail,
  data: FlightLogData,
): Promise<LogCheck[]> {
  const { period, aircraft: plane } = detail;
  const busy = await getBusyPeriods(
    viewerId,
    plane.id,
    period.from,
    new Date(period.to.getTime() + 2 * DAY),
  );
  // Calendar entries can't overlap, so the first one starting after this booking is the next.
  const nextFrom =
    busy
      .map((p) => p.from)
      .filter((from) => from > period.from)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  return logChecks({
    aircraft: { fuelType: plane.fuelType, fuelBurnLph: plane.fuelBurnLph },
    booked: period,
    nextFrom,
    legs: data.legs,
    uplifts: data.uplifts,
  });
}
