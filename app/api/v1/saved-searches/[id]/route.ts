import { isUuid } from "@/lib/aircraft/queries";
import { requireApiUser } from "@/lib/api/auth";
import { ApiError, apiRoute, bodyOf, json, parse } from "@/lib/api/http";
import { savedSearchDto, savedSearchPatch } from "@/lib/api/social";
import { deleteSavedSearch, listSavedSearches, setSearchAlerts } from "@/lib/saved/searches";

type Context = RouteContext<"/api/v1/saved-searches/[id]">;

const notFound = () => new ApiError("not_found", "No saved search with this id.");

/** PATCH /api/v1/saved-searches/{id} `{ alerts }`: switch its alerts on or off. */
export const PATCH = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  const { alerts } = parse(savedSearchPatch, await bodyOf(request));
  if (!isUuid(id) || !(await setSearchAlerts(user.id, id, alerts))) throw notFound();
  const saved = (await listSavedSearches(user.id)).find((s) => s.id === id)!;
  return json({ data: savedSearchDto(saved) });
});

/** DELETE /api/v1/saved-searches/{id}: remove it. */
export const DELETE = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  if (!isUuid(id) || !(await deleteSavedSearch(user.id, id))) throw notFound();
  return json({ data: { deleted: true } });
});
