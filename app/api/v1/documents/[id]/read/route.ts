import { isUuid } from "@/lib/aircraft/queries";
import { requireApiUser } from "@/lib/api/auth";
import { readScanBody } from "@/lib/api/credentials";
import { ApiError, apiRoute, bodyOf, json, parse } from "@/lib/api/http";
import { readCredentialScan } from "@/lib/ocr/credentials";

type Context = RouteContext<"/api/v1/documents/[id]/read">;

export const maxDuration = 60;

const MESSAGES = {
  not_configured: "Reading scans isn't available on this server.",
  limit: "Too many documents read in the last 24 hours.",
  not_this_document: "This doesn't look like that kind of document.",
  unreadable: "The scan couldn't be read; a sharper, straight photo usually helps.",
  failed: "Reading didn't work this time; try again.",
} as const;

/**
 * POST /api/v1/documents/{id}/read `{ as: licence | medical, consent }`: read one of your own
 * uploads with the AI and get the fields to fill in (VER-9). Nothing is saved: send them, checked
 * by the pilot, to /api/v1/me/credentials. A medical needs `consent: true`.
 */
export const POST = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  if (!isUuid(id)) throw new ApiError("not_found", "No such document.");
  const input = parse(readScanBody, await bodyOf(request, {}));
  const consentAt = input.consent ? new Date() : null;
  const read = await readCredentialScan(user.id, id, input.as, consentAt);
  if (read.ok) {
    return json({
      data: {
        as: read.kind,
        licence: read.kind === "licence" ? read.suggestion : null,
        medical: read.kind === "medical" ? read.suggestion : null,
      },
    });
  }
  const details = { reason: read.error };
  switch (read.error) {
    case "not_found":
      throw new ApiError("not_found", "No such document of yours.");
    case "consent_required":
      throw new ApiError(
        "validation_failed",
        "Some fields are invalid.",
        {
          consent: ["A medical is read only with the pilot's consent."],
        },
        details,
      );
    case "limit":
      throw new ApiError("rate_limited", MESSAGES.limit, undefined, details);
    case "not_configured":
      throw new ApiError("conflict", MESSAGES.not_configured, undefined, details);
    default:
      throw new ApiError("conflict", MESSAGES[read.error], undefined, details);
  }
});
