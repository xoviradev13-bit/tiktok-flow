/**
 * CORS helpers for Chrome Extension → Next.js API routes.
 *
 * Chrome extension origins (chrome-extension://<id>) are always cross-origin
 * relative to localhost. Auth is enforced via Bearer token, so we can safely
 * reflect any chrome-extension:// origin without weakening security.
 */

const ALLOWED_METHODS = "GET, POST, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization";
const MAX_AGE = "86400";

/**
 * Build CORS headers for an extension / agent request.
 * Returns an object suitable for spreading into a NextResponse headers init.
 */
export function extensionCorsHeaders(origin: string | null): Record<string, string> {
  // Reflect chrome-extension:// and localhost agent origins; deny everything else.
  const allowOrigin =
    origin &&
    (origin.startsWith("chrome-extension://") ||
      origin.startsWith("http://127.0.0.1") ||
      origin.startsWith("http://localhost"))
      ? origin
      : "null";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Max-Age": MAX_AGE,
  };
}

/**
 * Returns a 204 No Content OPTIONS preflight response with CORS headers.
 * Export this as `OPTIONS` from any API route that the extension calls.
 */
export function extensionOptionsResponse(req: Request): Response {
  const origin = req.headers.get("origin");
  return new Response(null, {
    status: 204,
    headers: extensionCorsHeaders(origin),
  });
}

/**
 * Adds CORS headers to an existing NextResponse.
 * Use this in GET/POST handlers so the actual response also carries CORS headers.
 */
export function withExtensionCors(response: Response, req: Request): Response {
  const origin = req.headers.get("origin");
  const cors = extensionCorsHeaders(origin);
  const newHeaders = new Headers(response.headers);
  for (const [k, v] of Object.entries(cors)) {
    newHeaders.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
