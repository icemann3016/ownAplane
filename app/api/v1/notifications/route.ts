import { getOwnSettings } from "@/lib/account/profile";
import { requireApiUser } from "@/lib/api/auth";
import { apiRoute, json } from "@/lib/api/http";
import { notificationDtos } from "@/lib/api/social";
import { listNotifications, unreadCount } from "@/lib/notifications";

/**
 * GET /api/v1/notifications: the latest 50, newest first, each with a sentence in the user's
 * language; `unread` counts the unread ones (BKG-9).
 */
export const GET = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  const [rows, unread, settings] = await Promise.all([
    listNotifications(user.id),
    unreadCount(user.id),
    getOwnSettings(user.id),
  ]);
  return json({ data: notificationDtos(rows, settings.locale), unread, nextCursor: null });
});
