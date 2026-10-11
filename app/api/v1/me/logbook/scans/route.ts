import { requireApiUser } from "@/lib/api/auth";
import { ApiError, apiRoute, bodyOf, json, parse } from "@/lib/api/http";
import { logbookSpreadDto, spreadBody } from "@/lib/api/logbook";
import { getSpread, readLogbookSpread } from "@/lib/ocr/logbook-read";

export const maxDuration = 60;

const MESSAGES = {
  not_configured: "Reading scans isn't available on this server.",
  no_credits: "No AI reading credits left: buy credits on the website (Plan & billing).",
  limit: "Too many pages read in the last 24 hours.",
  not_this_document: "This doesn't look like a logbook page.",
  nothing_read: "No lines with a readable date were found.",
  unreadable: "The pages couldn't be read; a sharper, straight photo usually helps.",
  failed: "Reading didn't work this time; try again.",
} as const;

/**
 * POST /api/v1/me/logbook/scans `{ leftDocumentId, rightDocumentId }`: read a two-page spread
 * of a paper logbook (LOG-6). Each line becomes a draft; the totals written on the page are
 * checked against the lines (`differences`). Upload the pages first with POST /api/v1/documents.
 */
export const POST = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  const { leftDocumentId, rightDocumentId } = parse(spreadBody, await bodyOf(request));
  const read = await readLogbookSpread(user.id, leftDocumentId, rightDocumentId);
  if (!read.ok) {
    const details = { reason: read.error };
    if (read.error === "not_found") throw new ApiError("not_found", "No such document of yours.");
    if (read.error === "limit")
      throw new ApiError("rate_limited", MESSAGES.limit, undefined, details);
    if (read.error === "no_credits")
      throw new ApiError("payment_required", MESSAGES.no_credits, undefined, details);
    throw new ApiError("conflict", MESSAGES[read.error], undefined, details);
  }
  const found = await getSpread(user.id, read.spreadId);
  return json({ data: logbookSpreadDto(found!.spread, found!.entries) }, { status: 201 });
});
