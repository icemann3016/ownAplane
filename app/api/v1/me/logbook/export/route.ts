import { requireApiUser } from "@/lib/api/auth";
import { apiRoute } from "@/lib/api/http";
import { csvResponse } from "@/lib/csv";
import { logbookCsv } from "@/lib/logbook/csv";
import { entriesInOrder } from "@/lib/logbook/entries";

/** GET /api/v1/me/logbook/export: certified and struck-through entries as CSV (LOG-5). */
export const GET = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  const csv = logbookCsv(await entriesInOrder(user.id));
  return csvResponse(csv, `logbook-${new Date().toISOString().slice(0, 10)}.csv`);
});
