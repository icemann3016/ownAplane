import { requireApiUser } from "@/lib/api/auth";
import { apiRoute, json } from "@/lib/api/http";
import { requirePlanFeature } from "@/lib/api/pilot-plus";
import { getFlyingStats } from "@/lib/logbook/stats";

/** GET /api/v1/me/logbook/stats: flying statistics (Pilot Plus). */
export const GET = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  await requirePlanFeature(user.id, "logbookExtras");
  return json({ data: await getFlyingStats(user.id) });
});
