import { requireApiUser } from "@/lib/api/auth";
import { planDto } from "@/lib/api/billing";
import { apiRoute, json } from "@/lib/api/http";

/** GET /api/v1/me/plan: the user's plan, limits, usage, subscription and AI credits (SUB-4). */
export const GET = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  return json({ data: await planDto(user.id) });
});
