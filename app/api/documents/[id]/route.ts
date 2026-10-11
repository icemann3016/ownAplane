import { getUser } from "@/lib/auth/session";
import { readDocument } from "@/lib/documents";
import { documentResponse } from "@/lib/files/document-response";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound() {
  return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
}

/**
 * View a private document. Only its owner, admins and (for flight log photos and receipts) the other party of the booking may; everyone else gets 404 (so ids can't
 * be probed). Admin views are logged in admin_actions.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/documents/[id]">) {
  const { id } = await ctx.params;
  const user = await getUser();
  if (!user || !UUID.test(id)) return notFound();

  const result = await readDocument(user.id, id);
  if (!result) return notFound();
  const { doc, body } = result;

  return documentResponse(doc, body, new URL(request.url).searchParams.has("download"));
}
