import { getUser } from "@/lib/auth/session";
import { csvResponse } from "@/lib/csv";
import { entriesInOrder } from "@/lib/logbook/entries";
import { logbookCsv } from "@/lib/logbook/csv";

/** GET /logbook/export: the logbook as CSV in the EASA column order (LOG-5). */
export async function GET() {
  const user = await getUser();
  if (!user) return new Response("Not found", { status: 404 });
  const csv = logbookCsv(await entriesInOrder(user.id));
  return csvResponse(csv, `logbook-${new Date().toISOString().slice(0, 10)}.csv`);
}
