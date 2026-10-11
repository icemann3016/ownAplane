import { savePhoto } from "@/lib/aircraft/photos";
import { requireApiUser } from "@/lib/api/auth";
import { ApiError, apiRoute } from "@/lib/api/http";
import { myAircraftResponse } from "@/lib/api/my-aircraft-dto";
import { ownAircraftId } from "@/lib/api/my-aircraft-route";
import { PHOTO_MAX_BYTES } from "@/lib/validation/aircraft";

type Context = RouteContext<"/api/v1/me/aircraft/[id]/photos">;

const tooLarge = () =>
  new ApiError(
    "payload_too_large",
    `At most ${PHOTO_MAX_BYTES / 1024 / 1024} MB; shrink it first.`,
  );

/**
 * POST /api/v1/me/aircraft/{id}/photos (multipart/form-data, field `file`): add a JPEG, PNG or
 * WebP photo as the last one (at most 20). Photos are public once the aircraft is listed.
 */
export const POST = apiRoute(async (request, { params }: Context) => {
  const user = await requireApiUser(request);
  const id = ownAircraftId((await params).id);
  const length = Number(request.headers.get("content-length") ?? NaN);
  if (!Number.isFinite(length)) throw new ApiError("bad_request", "Send a Content-Length.");
  if (length > PHOTO_MAX_BYTES + 64 * 1024) throw tooLarge();
  const file = (await request.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) {
    throw new ApiError("bad_request", "Send the photo as multipart/form-data in the field `file`.");
  }
  const result = await savePhoto(user.id, id, file);
  if (result.ok) return myAircraftResponse(user.id, id, 201);
  if (result.error === "notFound") throw new ApiError("not_found", "No such aircraft.");
  if (result.error === "tooLarge") throw tooLarge();
  if (result.error === "tooMany") {
    throw new ApiError("conflict", "At most 20 photos.", undefined, { reason: "too_many" });
  }
  throw new ApiError("validation_failed", "Some fields are invalid.", {
    file: ["Only JPEG, PNG or WebP."],
  });
});
