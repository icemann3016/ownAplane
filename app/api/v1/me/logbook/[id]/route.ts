import { isUuid } from "@/lib/aircraft/queries";
import { requireApiUser } from "@/lib/api/auth";
import { ApiError, apiRoute, bodyOf, json, parse } from "@/lib/api/http";
import { logbookEntryBody, logbookEntryDto, logbookError } from "@/lib/api/logbook";
import { getEntry } from "@/lib/logbook/entries";
import { deleteEntry, updateEntry } from "@/lib/logbook/ops";

type Context = RouteContext<"/api/v1/me/logbook/[id]">;

async function entryOf(userId: string, params: Context["params"]) {
  const { id } = await params;
  const found = isUuid(id) ? await getEntry(userId, id) : null;
  if (!found) throw new ApiError("not_found", "No such logbook entry.");
  return found;
}

/** GET …/logbook/{id}: the entry, the ones it corrects (history) and what corrected it. */
export const GET = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { entry, history, correctedBy } = await entryOf(user.id, params);
  return json({
    data: {
      ...logbookEntryDto(entry),
      history: history.map(logbookEntryDto),
      correctedBy: correctedBy.map(logbookEntryDto),
    },
  });
});

/** PUT …/logbook/{id}: change a draft (all fields; 409 not_editable once certified). */
export const PUT = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { entry } = await entryOf(user.id, params);
  // The kind stays what it is: the body is checked against it.
  const body = (await bodyOf(request)) as Record<string, unknown>;
  const values = parse(logbookEntryBody, { ...body, kind: entry.kind });
  const outcome = await updateEntry(user.id, entry.id, values);
  if (!outcome.ok) throw logbookError(outcome);
  return json({ data: logbookEntryDto((await getEntry(user.id, entry.id))!.entry) });
});

/** DELETE …/logbook/{id}: delete a draft (certified entries are struck through instead). */
export const DELETE = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { entry } = await entryOf(user.id, params);
  const outcome = await deleteEntry(user.id, entry.id);
  if (!outcome.ok) throw logbookError(outcome);
  return json({ data: { id: entry.id, deleted: true } });
});
