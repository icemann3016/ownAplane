import { openApiDocument } from "@/lib/api/openapi";

/** GET /api/v1/openapi.json: the API's OpenAPI description (API-5). */
export function GET() {
  return Response.json(openApiDocument(), {
    headers: { "cache-control": "public, max-age=300" },
  });
}
