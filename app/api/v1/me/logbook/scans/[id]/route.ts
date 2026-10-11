import { isUuid } from "@/lib/aircraft/queries";
import { requireApiUser } from "@/lib/api/auth";
import { ApiError, apiRoute, json } from "@/lib/api/http";
import { logbookSpreadDto } from "@/lib/api/logbook";
import { getSpread } from "@/lib/ocr/logbook-read";

type Context = RouteContext<"/api/v1/me/logbook/scans/[id]">;

/** GET /api/v1/me/logbook/scans/{id}: a read spread with its totals check and entries. */
export const GET = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  const found = isUuid(id) ? await getSpread(user.id, id) : null;
  if (!found || found.spread.pilotId !== user.id) throw new ApiError("not_found", "No such scan.");
  return json({ data: logbookSpreadDto(found.spread, found.entries) });
});
