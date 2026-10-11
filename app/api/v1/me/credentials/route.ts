import { requireApiUser } from "@/lib/api/auth";
import { credentialsResponse } from "@/lib/api/credentials";
import { apiRoute } from "@/lib/api/http";

/**
 * GET /api/v1/me/credentials: the pilot's licences, ratings, medicals and experience with their
 * review status (VER-1…3). Only the pilot (and admins on the website) ever see these.
 */
export const GET = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  return credentialsResponse(user.id);
});
