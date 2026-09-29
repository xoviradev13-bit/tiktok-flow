export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

const IS_PRODUCTION = process.env.APP_ENV === "production" || process.env.NODE_ENV === "production";

const BASE_AUTH_COOKIE_NAMES = [
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
 * Clears all session + CSRF cookies server-side across all domains/subdomains and redirects to /signin.
 */
async function handleForceSignOut(req: NextRequest) {
  // Security guard: Ignore embedded/subresource requests
  const fetchDest = req.headers.get("sec-fetch-dest");
  if (fetchDest && ["image", "script", "style", "video", "audio", "font", "track"].includes(fetchDest)) {
    return new NextResponse(null, { status: 400 });
  }

  const { searchParams } = req.nextUrl;
  const rawCallback = searchParams.get("callbackUrl") || "";

  // Open-redirect protection & strip circular signin callback
  const cleanCallback =
    rawCallback.startsWith("/") &&
    !rawCallback.startsWith("//") &&
    !rawCallback.startsWith("/signin") &&
    !rawCallback.startsWith("/signup") &&
    !rawCallback.startsWith("/auth")
      ? rawCallback
      : "";

  const signinPath = cleanCallback
    ? `/signin?callbackUrl=${encodeURIComponent(cleanCallback)}`
    : "/signin";

  // Derive trusted origin
  const rawOrigin = req.nextUrl.origin;
  const isBadOrigin = rawOrigin.includes("0.0.0.0") || rawOrigin.includes("::");
  const hostHeader = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const host = hostHeader.split(":")[0];
  const proto = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const headerOrigin = host && !host.includes("0.0.0.0") && !host.includes("::") ? `${proto}://${host}` : null;
  const trustedOrigin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    headerOrigin ||
    (isBadOrigin ? "http://localhost:3000" : rawOrigin);

  const signinUrl = new URL(signinPath, trustedOrigin);
  const res = NextResponse.redirect(signinUrl);

  // Prevent caching of sign-out response
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");

  // Collect all cookie names to expire, including chunked (.0, .1, .2)
  const cookieNamesToClear = new Set<string>();
  for (const base of BASE_AUTH_COOKIE_NAMES) {
    cookieNamesToClear.add(base);
    for (let i = 0; i <= 5; i++) {
      cookieNamesToClear.add(`${base}.${i}`);
    }
  }

  // Also include any cookie currently present on the request matching auth tokens
  for (const cookie of req.cookies.getAll()) {
    const n = cookie.name.toLowerCase();
    if (
      n.includes("session-token") ||
      n.includes("csrf") ||
      n.includes("callback-url") ||
      n.includes("streamdash") ||
      n.includes("tiktokflow") ||
      n.includes("auth")
    ) {
      cookieNamesToClear.add(cookie.name);
    }
  }

  // Determine potential cookie domains to purge
  const candidateDomains = new Set<string>();
  if (process.env.COOKIE_DOMAIN) candidateDomains.add(process.env.COOKIE_DOMAIN);
  candidateDomains.add(".streamdash.site");
  candidateDomains.add("streamdash.site");
  candidateDomains.add(".tiktokflow.site");
  candidateDomains.add("tiktokflow.site");
  if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
    candidateDomains.add(host);
    candidateDomains.add(`.${host}`);
    const parts = host.split(".");
    if (parts.length >= 2) {
      const rootDomain = parts.slice(-2).join(".");
      candidateDomains.add(`.${rootDomain}`);
      candidateDomains.add(rootDomain);
    }
  }

  const isHttps = proto === "https" || IS_PRODUCTION;

  // IMPORTANT: Do NOT call `res.cookies.set()` here!
  // In Next.js, calling `res.cookies.set()` creates an internal ResponseCookies map
  // that overwrites or drops raw Set-Cookie headers appended via `res.headers.append()`.
  // Using pure `res.headers.append('Set-Cookie', ...)` guarantees ALL deletion headers are sent.
  for (const name of cookieNamesToClear) {
    const isHostCookie = name.startsWith("__Host-");
    const isSecureCookie = name.startsWith("__Secure-") || isHostCookie || isHttps;

    // 1. Host-only removal (no Domain attribute)
    let hostVal = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax`;
    if (isSecureCookie) hostVal += "; Secure";
    res.headers.append("Set-Cookie", hostVal);

    if (!name.startsWith("__Secure-") && !name.startsWith("__Host-")) {
      res.headers.append("Set-Cookie", `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax`);
    }

    // 2. Domain-scoped removal (RFC 6265 forbids Domain attribute on __Host- cookies)
    if (!isHostCookie) {
      for (const domain of candidateDomains) {
        if (!domain) continue;
        let domainVal = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax; Domain=${domain}`;
        if (isSecureCookie) domainVal += "; Secure";
        res.headers.append("Set-Cookie", domainVal);

        if (!name.startsWith("__Secure-")) {
          res.headers.append("Set-Cookie", `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax; Domain=${domain}`);
        }
      }
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
