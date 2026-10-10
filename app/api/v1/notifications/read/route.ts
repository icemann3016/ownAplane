import { requireApiUser } from "@/lib/api/auth";
import { apiRoute, json } from "@/lib/api/http";
import { markAllRead } from "@/lib/notifications";

/** POST /api/v1/notifications/read: mark all notifications read. */
export const POST = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  await markAllRead(user.id);
  return json({ data: { unread: 0 } });
});
