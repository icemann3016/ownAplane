import { requireApiUser } from "@/lib/api/auth";
import { apiRoute, bodyOf, json, parse } from "@/lib/api/http";
import { certifyBody, logbookError } from "@/lib/api/logbook";
import { certifyEntries } from "@/lib/logbook/ops";

/**
 * POST /api/v1/me/logbook/certify `{ ids }`: certify drafts, all or nothing (LOG-2). 409
 * `incomplete` (with `details.incomplete` ids), `date_in_future` or `already_corrected`.
 */
export const POST = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  const { ids } = parse(certifyBody, await bodyOf(request));
  const outcome = await certifyEntries(user.id, ids);
  if (!outcome.ok) throw logbookError(outcome);
  return json({ data: { certified: outcome.count } });
});
