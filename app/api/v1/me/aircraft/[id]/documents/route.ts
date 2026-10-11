import { saveAircraftDocument } from "@/lib/aircraft/manage-parts";
import { requireApiUser } from "@/lib/api/auth";
import { apiRoute, bodyOf, parse } from "@/lib/api/http";
import { aircraftDocumentBody, aircraftError } from "@/lib/api/my-aircraft";
import { myAircraftResponse } from "@/lib/api/my-aircraft-dto";
import { ownAircraftId } from "@/lib/api/my-aircraft-route";

type Context = RouteContext<"/api/v1/me/aircraft/[id]/documents">;

/**
 * POST /api/v1/me/aircraft/{id}/documents `{ kind, title?, expiresOn?, documentId }`: CofA, ARC
 * and insurance (checked by an admin) or a reference document for renters (POH, checklist, W&B).
 * Renewals are added as new documents.
 */
export const POST = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const id = ownAircraftId((await params).id);
  const input = parse(aircraftDocumentBody, await bodyOf(request));
  const saved = await saveAircraftDocument(user.id, id, null, input);
  if (!saved.ok) throw aircraftError(saved);
  return myAircraftResponse(user.id, id, 201);
});
