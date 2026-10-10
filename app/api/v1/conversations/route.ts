import { requireApiUser } from "@/lib/api/auth";
import { ApiError, apiRoute, bodyOf, json, parse } from "@/lib/api/http";
import { conversationDto, conversationSummaryDto, startConversationBody } from "@/lib/api/social";
import { listConversations, openConversation, startConversation } from "@/lib/messages";
import { sendMessageEmailsSoon } from "@/lib/messages/soon";

/** GET /api/v1/conversations: the signed-in user's conversations, newest first (MSG-1). */
export const GET = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  const rows = await listConversations(user.id);
  return json({ data: rows.map(conversationSummaryDto), nextCursor: null });
});

/**
 * POST /api/v1/conversations `{ aircraftId, bookingId?, body? }`: open (or find) the
 * conversation about a booking or a listed aircraft, optionally with a first message.
 */
export const POST = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  const { aircraftId, bookingId, body } = parse(startConversationBody, await bodyOf(request));
  const result = await startConversation(user.id, { aircraftId, bookingId }, body);
  if (!result.ok) {
    if (result.error === "too_many_messages") {
      throw new ApiError("rate_limited", "Too many messages; wait a few minutes.");
    }
    throw new ApiError("not_found", "No such aircraft or booking to write about.", undefined, {
      reason: result.error,
    });
  }
  if (body) sendMessageEmailsSoon();
  const opened = await openConversation(user.id, result.value);
  return json({ data: conversationDto(opened!, user.id) }, { status: 201 });
});
