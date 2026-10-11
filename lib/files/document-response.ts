/**
 * A private document as a response: never cached, its checked content type, no sniffing, and
 * images locked down. `download` asks the browser to save it instead of showing it.
 */
export function documentResponse(
  doc: { contentType: string; filename: string },
  body: Uint8Array,
  download: boolean,
): Response {
  const headers: Record<string, string> = {
    "content-type": doc.contentType,
    "content-length": String(body.length),
    "content-disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };
  // Images can't run anything, but lock them down anyway. (A CSP sandbox would stop the
  // browser's PDF viewer, so PDFs rely on the checked content type + nosniff.)
  if (doc.contentType.startsWith("image/")) {
    headers["content-security-policy"] =
      "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'";
  }
  return new Response(Buffer.from(body), { headers });
}
