import { isUuid } from "@/lib/aircraft/queries";
import { requireApiUser } from "@/lib/api/auth";
import { ApiError, apiRoute, bodyOf, json, parse } from "@/lib/api/http";
import { logbookEntryDto, logbookError, voidBody } from "@/lib/api/logbook";
import { getEntry } from "@/lib/logbook/entries";
import { voidEntry } from "@/lib/logbook/ops";

type Context = RouteContext<"/api/v1/me/logbook/[id]/void">;

/** POST …/logbook/{id}/void `{ reason }`: strike a certified entry through (LOG-2). */
export const POST = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  if (!isUuid(id)) throw new ApiError("not_found", "No such logbook entry.");
  const { reason } = parse(voidBody, await bodyOf(request));
  const outcome = await voidEntry(user.id, id, reason);
  if (!outcome.ok) throw logbookError(outcome);
  return json({ data: logbookEntryDto((await getEntry(user.id, id))!.entry) });
});
