import { getOwnSettings, getProfileAndRoles } from "@/lib/account/profile";
import { requireApiUser } from "@/lib/api/auth";
import { meDto } from "@/lib/api/dto";
import { ApiError, apiRoute, json } from "@/lib/api/http";

/** GET /api/v1/me: the signed-in user's account, profile, roles and settings. */
export const GET = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  const [account, settings] = await Promise.all([
    getProfileAndRoles(user.id),
    getOwnSettings(user.id),
  ]);
  if (!account) throw new ApiError("not_found", "This account has no profile.");
  return json({ data: meDto(user, account, settings) });
});
