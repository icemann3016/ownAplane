import { requireApiUser } from "@/lib/api/auth";
import { apiRoute, json } from "@/lib/api/http";
import { favouriteDto } from "@/lib/api/social";
import { listFavourites } from "@/lib/saved/favourites";

/** GET /api/v1/favourites: the user's favourite aircraft, newest first (SRC-6). */
export const GET = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  return json({ data: (await listFavourites(user.id)).map(favouriteDto), nextCursor: null });
});
