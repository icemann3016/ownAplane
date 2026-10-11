import { requireApiUser } from "@/lib/api/auth";
import { credentialsResponse } from "@/lib/api/credentials";
import { ApiError, apiRoute } from "@/lib/api/http";
import { applyLogbookExperience } from "@/lib/logbook/experience";

/**
 * POST /api/v1/me/credentials/experience/from-logbook: take total, PIC, last-90-days and
 * per-type hours from the certified logbook (LOG-7). 409 `no_logbook` without certified entries.
 */
export const POST = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  const outcome = await applyLogbookExperience(user.id);
  if (!outcome.ok) {
    throw new ApiError("conflict", "No certified logbook entries yet.", undefined, {
      reason: outcome.error,
    });
  }
  return credentialsResponse(user.id);
});
