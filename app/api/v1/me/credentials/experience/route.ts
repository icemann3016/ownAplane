import { requireApiUser } from "@/lib/api/auth";
import { credentialsResponse, experienceBody } from "@/lib/api/credentials";
import { apiRoute, bodyOf, parse } from "@/lib/api/http";
import { saveExperience } from "@/lib/pilot/credential-ops";

/** PUT /api/v1/me/credentials/experience: total, PIC and last-90-days hours, date of birth. */
export const PUT = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  await saveExperience(user.id, parse(experienceBody, await bodyOf(request)));
  return credentialsResponse(user.id);
});
