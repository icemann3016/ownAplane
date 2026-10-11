import { isUuid } from "@/lib/aircraft/queries";
import { requireApiUser } from "@/lib/api/auth";
import { checkSaved, credentialInput, credentialsResponse, kindOf } from "@/lib/api/credentials";
import { ApiError, apiRoute, bodyOf } from "@/lib/api/http";
import { deleteCredential, saveCredential } from "@/lib/pilot/credential-ops";

type Context = RouteContext<"/api/v1/me/credentials/[kind]/[id]">;

async function target(params: Context["params"]) {
  const { kind, id } = await params;
  const credentialKind = kindOf(kind);
  if (!isUuid(id)) throw new ApiError("not_found", "No such credential.");
  return { kind: credentialKind, id };
}

/** PUT …/{kind}/{id}: change it (all fields); a verified item goes back to "pending". */
export const PUT = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { kind, id } = await target(params);
  const input = credentialInput(kind, await bodyOf(request));
  checkSaved(await saveCredential(user.id, kind, id, input));
  return credentialsResponse(user.id);
});

/** DELETE …/{kind}/{id}: remove it and its scan. */
export const DELETE = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { kind, id } = await target(params);
  if (!(await deleteCredential(user.id, kind, id))) {
    throw new ApiError("not_found", "No such credential.");
  }
  return credentialsResponse(user.id);
});
