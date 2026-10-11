import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { asUser } from "@/lib/db/rls";
import { bookings, flightLogs } from "@/lib/db/schema";

// Owner statistics (SUB-10): what an aircraft earned from confirmed flight logs (the amount due
// the owner confirmed), per currency, in all and over the last 12 months. RLS: only the
// booking's owner (and admins) see them.

export async function aircraftEarnings(ownerId: string, aircraftId: string) {
  return asUser(ownerId, (tx) =>
    tx
      .select({
        currency: bookings.currency,
        total: sql<number>`coalesce(sum(${flightLogs.amountDue}), 0)`.mapWith(Number),
        lastYear: sql<number>`coalesce(sum(${flightLogs.amountDue}) filter (
          where ${flightLogs.confirmedAt} > now() - interval '12 months'), 0)`.mapWith(Number),
      })
      .from(flightLogs)
      .innerJoin(bookings, eq(bookings.id, flightLogs.bookingId))
      .where(
        and(
          eq(bookings.aircraftId, aircraftId),
          eq(bookings.ownerId, ownerId),
          eq(flightLogs.status, "confirmed"),
        ),
      )
      .groupBy(bookings.currency),
  );
}
