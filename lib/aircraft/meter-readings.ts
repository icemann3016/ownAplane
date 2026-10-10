import "server-only";

import { desc, eq } from "drizzle-orm";

import { asUser } from "@/lib/db/rls";
import { meterReadings } from "@/lib/db/schema";

/** The latest meter readings the owner recorded for an aircraft (RLS: owner or admin). */
export async function getMeterReadings(userId: string, aircraftId: string, limit = 10) {
  return asUser(userId, (tx) =>
    tx
      .select()
      .from(meterReadings)
      .where(eq(meterReadings.aircraftId, aircraftId))
      .orderBy(desc(meterReadings.readAt))
      .limit(limit),
  );
}
