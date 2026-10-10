import { isUuid } from "@/lib/aircraft/queries";
import { requireApiUser } from "@/lib/api/auth";
import { ApiError, apiRoute, json } from "@/lib/api/http";
import { conversationDto } from "@/lib/api/social";
import { openConversation } from "@/lib/messages";

type Context = RouteContext<"/api/v1/conversations/[id]">;

/** GET /api/v1/conversations/{id}: the messages, oldest first; marks them read. */
export const GET = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  const found = isUuid(id) ? await openConversation(user.id, id) : null;
  if (!found) throw new ApiError("not_found", "No conversation with this id.");
  return json({ data: conversationDto(found, user.id) });
});
