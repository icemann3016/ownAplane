import { getAircraftDocuments } from "@/lib/aircraft/documents";
import { deleteAircraftDocument, saveAircraftDocument } from "@/lib/aircraft/manage-parts";
import { requireApiUser } from "@/lib/api/auth";
import { ApiError, apiRoute, bodyOf, parse } from "@/lib/api/http";
import { aircraftDocumentBody, aircraftError } from "@/lib/api/my-aircraft";
import { myAircraftResponse } from "@/lib/api/my-aircraft-dto";
import { ownAircraftId } from "@/lib/api/my-aircraft-route";

type Context = RouteContext<"/api/v1/me/aircraft/[id]/documents/[documentId]">;

async function ids(params: Context["params"]) {
  const { id, documentId } = await params;
  return { aircraftId: ownAircraftId(id), documentId: ownAircraftId(documentId, "document") };
}

/**
 * PUT …/documents/{documentId}: change its title, expiry or file (same kind). A checked document
 * goes back to the admins; a listed aircraft can't lose its valid ARC or insurance this way.
 */
export const PUT = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { aircraftId, documentId } = await ids(params);
  const input = parse(aircraftDocumentBody, await bodyOf(request));
  const existing = (await getAircraftDocuments(user.id, aircraftId)).find(
    (d) => d.id === documentId,
  );
  if (!existing) throw new ApiError("not_found", "No such document.");
  if (existing.kind !== input.kind) {
    throw new ApiError("validation_failed", "Some fields are invalid.", {
      kind: ["Can't change the kind: add a new document."],
    });
  }
  const saved = await saveAircraftDocument(user.id, aircraftId, documentId, input);
  if (!saved.ok) throw aircraftError(saved);
  return myAircraftResponse(user.id, aircraftId);
});

/** DELETE …/documents/{documentId}: remove it and its file. */
export const DELETE = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const { aircraftId, documentId } = await ids(params);
  const outcome = await deleteAircraftDocument(user.id, aircraftId, documentId);
  if (!outcome.ok) throw aircraftError(outcome);
  return myAircraftResponse(user.id, aircraftId);
});
