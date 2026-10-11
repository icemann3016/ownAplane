import { requireApiUser } from "@/lib/api/auth";
import { apiRoute, json } from "@/lib/api/http";
import { requirePlanFeature } from "@/lib/api/pilot-plus";
import { getCurrency } from "@/lib/logbook/currency-data";

/** GET /api/v1/me/logbook/currency: currency from the logbook (Pilot Plus). */
export const GET = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  await requirePlanFeature(user.id, "currencyTracker");
  return json({ data: await getCurrency(user.id) });
});
