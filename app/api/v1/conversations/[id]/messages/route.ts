import { isUuid } from "@/lib/aircraft/queries";
import { requireApiUser } from "@/lib/api/auth";
import { ApiError, apiRoute, bodyOf, json, parse } from "@/lib/api/http";
import { conversationDto, messageBody } from "@/lib/api/social";
import { openConversation, sendMessage } from "@/lib/messages";
import { sendMessageEmailsSoon } from "@/lib/messages/soon";

type Context = RouteContext<"/api/v1/conversations/[id]/messages">;

/** POST /api/v1/conversations/{id}/messages `{ body }`: send a message (MSG-1). */
export const POST = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  if (!isUuid(id)) throw new ApiError("not_found", "No conversation with this id.");
  const { body } = parse(messageBody, await bodyOf(request));
  const result = await sendMessage(user.id, id, body);
  if (!result.ok) {
    if (result.error === "too_many_messages") {
      throw new ApiError("rate_limited", "Too many messages; wait a few minutes.");
    }
    throw new ApiError("not_found", "No conversation with this id you can write in.");
  }
  sendMessageEmailsSoon();
  return json(
    { data: conversationDto((await openConversation(user.id, id))!, user.id) },
    { status: 201 },
  );
});
