import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/extension-auth";
import { extensionOptionsResponse } from "@/lib/extension-cors";

export function OPTIONS(req: Request) { return extensionOptionsResponse(req); }

// FIX: explicitly disable route-level caching. A stale challengeTs served to
// an agent would break HMAC attestation if the server enforces a freshness
// window on the timestamp (and it should — otherwise the attest is replayable
// indefinitely). Next.js will otherwise reuse the response in the full-route
// cache under some deployment configurations.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: Request) {
  try {
    const ip = getClientIp(req) || "unknown";
    const lim = checkRateLimit(`challenge:ip:${ip}`, 600);
    if (!lim.ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: {
            "Retry-After": String(lim.retryAfterSec),
            "Cache-Control": "no-store",
          },
        }
      );
    }

    return NextResponse.json(
      { challengeTs: Date.now() },
      {
        // FIX: belt-and-suspenders cache defeat. Any intermediate proxy or CDN
        // must NOT serve a cached timestamp to a subsequent caller — that would
        // let a stale challengeTs circulate forever, defeating the freshness
        // property of the attest scheme.
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, private",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (err: any) {
    // FIX: the original had no try/catch. A rate-limiter or IP-resolver throw
    // would surface Next's default 500 HTML page, which the agent's
    // `res.json()` would fail to parse — the agent would then fall back to
    // `Date.now()` in dev, or throw `challenge_unavailable` in production,
    // producing a hard-to-diagnose failure.
    console.error("[/api/extension/challenge] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

// FIX: reject non-GET methods explicitly. Without this, some deployment
// configurations allow POST/PUT through to the GET handler and a
// misconfigured CDN may cache the response.
export async function POST() {
  return NextResponse.json(
    { error: "Method not allowed" },
    {
      status: 405,
      headers: { Allow: "GET", "Cache-Control": "no-store" },
    }
  );
}