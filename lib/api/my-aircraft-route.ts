import "server-only";

import { getOwnAircraft, isUuid } from "@/lib/aircraft/queries";
import { ApiError } from "./http";

/** A path id that can be an aircraft (or one of its items), else 404. */
export function ownAircraftId(id: string, what = "aircraft"): string {
  if (!isUuid(id)) throw new ApiError("not_found", `No such ${what}.`);
  return id;
}

/** One of the user's own aircraft, else 404 (also for other people's aircraft). */
export async function requireOwnAircraft(userId: string, id: string) {
  const plane = await getOwnAircraft(userId, ownAircraftId(id));
  if (!plane) throw new ApiError("not_found", "No such aircraft.");
  return plane;
}
