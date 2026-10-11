import { requireApiUser } from "@/lib/api/auth";
import { aircraftTypeParam, credentialsResponse, typeHoursBody } from "@/lib/api/credentials";
import { ApiError, apiRoute, bodyOf, parse } from "@/lib/api/http";
import { deleteTypeHours, saveTypeHours } from "@/lib/pilot/credential-ops";

type Context = RouteContext<"/api/v1/me/credentials/type-hours/[aircraftType]">;

async function typeOf(params: Context["params"]) {
  const parsed = aircraftTypeParam.safeParse((await params).aircraftType);
  if (!parsed.success) throw new ApiError("not_found", "Not an ICAO type designator.");
  return parsed.data;
}

/** PUT …/type-hours/{type} `{ hours }`: hours on an aircraft type (ICAO designator, e.g. C172). */
export const PUT = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const type = await typeOf(params);
  const { hours } = parse(typeHoursBody, await bodyOf(request));
  await saveTypeHours(user.id, type, hours);
  return credentialsResponse(user.id);
});

/** DELETE …/type-hours/{type}. */
export const DELETE = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  if (!(await deleteTypeHours(user.id, await typeOf(params)))) {
    throw new ApiError("not_found", "No hours for this type.");
  }
  return credentialsResponse(user.id);
});
