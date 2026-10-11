import "server-only";

import { isUuid } from "@/lib/aircraft/queries";
import { ApiError } from "./http";

/** A path id that can be an aircraft (or one of its items), else 404. */
export function ownAircraftId(id: string, what = "aircraft"): string {
  if (!isUuid(id)) throw new ApiError("not_found", `No such ${what}.`);
  return id;
}
