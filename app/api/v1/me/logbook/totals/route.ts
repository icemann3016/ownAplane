import { requireApiUser } from "@/lib/api/auth";
import { apiRoute, json } from "@/lib/api/http";
import { logbookTotalsDto } from "@/lib/api/logbook";
import { getTotals } from "@/lib/logbook/entries";

/** GET /api/v1/me/logbook/totals: per column to date, the last 90 days, hours per type. */
export const GET = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  return json({ data: logbookTotalsDto(await getTotals(user.id)) });
});
