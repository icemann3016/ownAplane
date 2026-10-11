import { requireApiUser } from "@/lib/api/auth";
import { ApiError, apiRoute, json } from "@/lib/api/http";
import { saveDocument } from "@/lib/documents";
import { DOCUMENT_MAX_BYTES } from "@/lib/validation/pilot";

/**
 * POST /api/v1/documents (multipart/form-data, field `file`): upload a private document — a
 * licence or medical scan, the check-out photo, a fuel receipt — then send its `id` with the
 * credential or flight log entry. PDF, JPEG, PNG or WebP, at most 4 MB; uploads nothing refers to
 * are removed after a day.
 */
export const POST = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  // Refuse oversized (or unsized) bodies before reading them; the form adds a little overhead.
  const length = Number(request.headers.get("content-length") ?? NaN);
  if (!Number.isFinite(length)) throw new ApiError("bad_request", "Send a Content-Length.");
  if (length > DOCUMENT_MAX_BYTES + 64 * 1024) throw tooLarge();
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    throw new ApiError("bad_request", "Send the file as multipart/form-data in the field `file`.");
  }
  const result = await saveDocument(user.id, file);
  if (result.ok) {
    const { id, filename, sizeBytes } = result;
    return json({ data: { id, filename, sizeBytes } }, { status: 201 });
  }
  if (result.error === "tooLarge") throw tooLarge();
  if (result.error === "invalidType") {
    throw new ApiError("validation_failed", "Some fields are invalid.", {
      file: ["Only PDF, JPEG, PNG or WebP."],
    });
  }
  if (result.error === "tooMany") {
    throw new ApiError("conflict", "Too many documents: remove some first.", undefined, {
      reason: "tooMany",
    });
  }
  throw new Error("document upload failed");
});

const tooLarge = () =>
  new ApiError("payload_too_large", `At most ${DOCUMENT_MAX_BYTES / 1024 / 1024} MB.`);
