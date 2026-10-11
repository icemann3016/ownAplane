import { requireApiUser } from "@/lib/api/auth";
import { checkSaved, credentialInput, credentialsResponse, kindOf } from "@/lib/api/credentials";
import { apiRoute, bodyOf } from "@/lib/api/http";
import { saveCredential } from "@/lib/pilot/credential-ops";

type Context = RouteContext<"/api/v1/me/credentials/[kind]">;

/**
 * POST /api/v1/me/credentials/{licences|ratings|medicals}: add one; an admin then verifies it.
 * Answers with all credentials.
 */
export const POST = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const kind = kindOf((await params).kind);
  const input = credentialInput(kind, await bodyOf(request));
  checkSaved(await saveCredential(user.id, kind, undefined, input));
  return credentialsResponse(user.id, 201);
});
