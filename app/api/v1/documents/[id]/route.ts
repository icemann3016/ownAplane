import { isUuid } from "@/lib/aircraft/queries";
import { requireApiUser } from "@/lib/api/auth";
import { ApiError, apiRoute } from "@/lib/api/http";
import { readDocument } from "@/lib/documents";
import { documentResponse } from "@/lib/files/document-response";

type Context = RouteContext<"/api/v1/documents/[id]">;

/**
 * GET /api/v1/documents/{id}: the file itself, for its owner and (flight log photos and receipts)
 * the other party of the booking; 404 for everyone else. `?download` to save it.
 */
export const GET = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  const result = isUuid(id) ? await readDocument(user.id, id) : null;
  if (!result) throw new ApiError("not_found", "No such document.");
  const download = new URL(request.url).searchParams.has("download");
  return documentResponse(result.doc, result.body, download);
});
