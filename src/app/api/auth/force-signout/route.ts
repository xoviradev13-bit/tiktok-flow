export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

const IS_PRODUCTION = process.env.APP_ENV === "production" || process.env.NODE_ENV === "production";

// All cookie names that may hold session, CSRF, or callback tokens.
// Must be cleared to prevent middleware from seeing a stale JWT and bouncing the user back.
const ALL_AUTH_COOKIE_NAMES = [
  "streamdash.session-token",
  "__Secure-streamdash.session-token",
  "tiktokflow.session-token",
  "__Secure-tiktokflow.session-token",
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "next-auth.csrf-token",
  "__Host-next-auth.csrf-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
  "next-auth.callback-url",
  "__Secure-next-auth.callback-url",
];

/**
 * GET /api/auth/force-signout?callbackUrl=/some/path
 * POST /api/auth/force-signout
 *
 * Clears all session + CSRF cookies server-side and redirects to /signin.
 * Does NOT require a CSRF token — safe because it only removes cookies, never
 * reads or mutates application data.
 */
async function handleForceSignOut(req: NextRequest) {
  // Security guard: Ignore embedded/subresource requests (e.g. cross-site <img src="...">)
  const fetchDest = req.headers.get("sec-fetch-dest");
  if (fetchDest && ["image", "script", "style", "video", "audio", "font", "track"].includes(fetchDest)) {
    return new NextResponse(null, { status: 400 });
  }

  const { searchParams } = req.nextUrl;
  const rawCallback = searchParams.get("callbackUrl") || "";

  // Open-redirect protection: only allow local relative paths
  const callbackUrl =
    rawCallback.startsWith("/") && !rawCallback.startsWith("//")
      ? rawCallback
      : "/accounts";

  // Use the canonical app URL from env if available.
  // req.nextUrl.origin can be "http://0.0.0.0:3000" in dev when Next.js binds
  // to all interfaces — that resolves to an unreachable host in the browser.
  const rawOrigin = req.nextUrl.origin;
  const isBadOrigin = rawOrigin.includes("0.0.0.0") || rawOrigin.includes("::");
  const trustedOrigin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    (isBadOrigin ? "http://localhost:3000" : rawOrigin);

  const signinUrl = new URL(
    `/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`,
    trustedOrigin
  );

  const res = NextResponse.redirect(signinUrl);

  // Prevent caching of sign-out response
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");

  const cookieDomain = process.env.COOKIE_DOMAIN || (IS_PRODUCTION ? ".streamdash.site" : undefined);

  // Expire all auth-related cookies
  for (const name of ALL_AUTH_COOKIE_NAMES) {
    const isHostCookie = name.startsWith("__Host-");
    const isSecureCookie = name.startsWith("__Secure-") || isHostCookie || IS_PRODUCTION;

    // 1. Host-only / standard cookie removal
    res.cookies.set(name, "", {
      expires: new Date(0),
      maxAge: 0,
      path: "/",
      secure: isSecureCookie,
      httpOnly: true,
      sameSite: "lax",
    });

    // 2. Domain-scoped cookie removal (RFC 6265 forbids Domain attribute on __Host- cookies)
    if (cookieDomain && !isHostCookie) {
      let headerVal = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax; Domain=${cookieDomain}`;
      if (isSecureCookie) {
        headerVal += "; Secure";
      }
      res.headers.append("Set-Cookie", headerVal);
    }
  }

  return res;
}

export async function GET(req: NextRequest) {
  return handleForceSignOut(req);
}

export async function POST(req: NextRequest) {
  return handleForceSignOut(req);
}
