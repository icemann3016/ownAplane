import { z } from "zod";

import { getMyEligibility } from "@/lib/aircraft/eligibility";
import { getVisibleAircraft } from "@/lib/aircraft/public";
import { isUuid } from "@/lib/aircraft/queries";
import { requireApiUser } from "@/lib/api/auth";
import { eligibilityReasons } from "@/lib/api/eligibility";
import { ApiError, apiRoute, json, parse, queryOf } from "@/lib/api/http";
import { periodQuery } from "@/lib/api/schemas";

type Context = RouteContext<"/api/v1/aircraft/[id]/eligibility">;

const query = z.union([periodQuery, z.object({}).transform(() => undefined)]);

/**
 * GET /api/v1/aircraft/{id}/eligibility?from&to: "can I rent this" for the signed-in pilot
 * (RAT-8), with a sentence per reason in the user's language. Without dates, credentials are
 * checked for today and night isn't.
 */
export const GET = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  const visible = isUuid(id) ? await getVisibleAircraft(user.id, id) : null;
  if (!visible) throw new ApiError("not_found", "No aircraft with this id.");
  const q = queryOf(request);
  const period = parse(q.from || q.to ? periodQuery : query, q);
  const failures = await getMyEligibility(user.id, id, period);
  const reasons = await eligibilityReasons(user.id, failures, visible.aircraft.typeDesignator);
  return json({ data: { eligible: !reasons.some((r) => r.blocking), reasons } });
});
