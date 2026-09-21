import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { API_AUTH_PREFIX, AUTH_ROUTES, PROTECTED_ROUTES, PUBLIC_ROUTES } from "./constants/routes.config";

// ── Extension / Agent CORS ────────────────────────────────────────────────────
// These API routes are called by Chrome extensions (chrome-extension://<id>)
// and the local client agent. Auth is enforced via Bearer token so it is safe
// to reflect any chrome-extension://, 127.0.0.1, or localhost origin.
const EXTENSION_API_PREFIXES = [
  "/api/extension/",
  "/api/gpm/",
  "/api/client-agent/",
];

const CORS_ALLOWED_METHODS = "GET, POST, OPTIONS";
const CORS_ALLOWED_HEADERS = "Content-Type, Authorization";
const CORS_MAX_AGE = "86400";

function isExtensionApiPath(pathname: string) {
  return EXTENSION_API_PREFIXES.some((p) => pathname.startsWith(p));
}

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowOrigin =
    origin &&
    (origin.startsWith("chrome-extension://") ||
      origin.startsWith("http://127.0.0.1") ||
      origin.startsWith("http://localhost"))
      ? origin
      : "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": CORS_ALLOWED_METHODS,
    "Access-Control-Allow-Headers": CORS_ALLOWED_HEADERS,
    "Access-Control-Max-Age": CORS_MAX_AGE,
  };
}

export async function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const pathname = url.pathname;

  // ── CORS for Extension / Agent API routes ────────────────────────────────
  if (isExtensionApiPath(pathname)) {
    const origin = request.headers.get("origin");
    const corsHeaders = buildCorsHeaders(origin);

    // Handle OPTIONS preflight immediately — no auth needed for preflight
    if (request.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers: corsHeaders });
    }

    // For actual requests, pass through to the route handler but stamp CORS
    // headers on the response so the browser accepts it
    const response = NextResponse.next();
    for (const [k, v] of Object.entries(corsHeaders)) {
      response.headers.set(k, v);
    }
    return response;
  }

  // Skip proxy for static files and Sentry monitoring tunnel
  const isStatic = pathname.startsWith("/_next") || /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/.test(pathname);
  const isMonitoring = pathname === "/monitoring" || pathname.startsWith("/monitoring/");
  if (isStatic || isMonitoring) {
    return NextResponse.next();
  }

  const isAccessingApiAuthRoute = pathname.startsWith(API_AUTH_PREFIX);
  const isApiRoute = pathname.startsWith("/api");
  const isTrpcRoute = pathname.startsWith("/api/trpc");
  const isInviteApiRoute = pathname.startsWith("/api/invitations");

  // Allow auth callbacks, tRPC (handled by tRPC context/procedures) and invitation validation
  if (isAccessingApiAuthRoute || isTrpcRoute || isInviteApiRoute) {
    return NextResponse.next();
  }

  // Subdomain routing support (e.g. docs.domain.com -> /docs, api.domain.com -> /api-docs)
  // Runs after the API/auth bypass above so subdomain-hosted API/auth traffic
  // (e.g. api.domain.com/api/trpc/..., docs.domain.com/api/auth/session) is
  // never rewritten into a page route.
  const host = request.headers.get("host") || "";
  if (!isApiRoute) {
    if (host.startsWith("docs.") && !pathname.startsWith("/docs")) {
      return NextResponse.rewrite(new URL(`/docs${pathname === "/" ? "" : pathname}`, request.url));
    }
    if ((host.startsWith("api.") || host.startsWith("developers.")) && !pathname.startsWith("/api-docs")) {
      return NextResponse.rewrite(new URL(`/api-docs${pathname === "/" ? "" : pathname}`, request.url));
    }
    if ((host.startsWith("trust.") || host.startsWith("legal.")) && !pathname.startsWith("/security")) {
      return NextResponse.rewrite(new URL(`/security${pathname === "/" ? "" : pathname}`, request.url));
    }
  }

  const isOAuthPopupComplete = pathname.startsWith("/auth/oauth-popup-complete");
  const isInviteAccept = pathname.startsWith("/invite/accept");
  const isAccessingAuthRoute =
    !isOAuthPopupComplete &&
    AUTH_ROUTES.some(route => pathname === route || pathname.startsWith(route + "/"));
  const isPublicRoute =
    isInviteAccept ||
    pathname === "/" ||
    PUBLIC_ROUTES.some(
      (route) => pathname === route || (route !== "/" && pathname.startsWith(route + "/"))
    );
  const isProtectedRoute =
    !isAccessingAuthRoute &&
    !isPublicRoute &&
    !isInviteAccept &&
    PROTECTED_ROUTES.some(route => pathname === route || pathname.startsWith(route + "/"));
  const isAdminRoute = pathname === "/dashboard/admin" || pathname.startsWith("/dashboard/admin/");

  const IS_PRODUCTION = process.env.APP_ENV === "production";
  const SHARED_COOKIE_NAME = IS_PRODUCTION
    ? "__Secure-tiktokflow.session-token"
    : "tiktokflow.session-token";
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    cookieName: SHARED_COOKIE_NAME,
    secureCookie: IS_PRODUCTION,
  });

  // token.id is normalized in the `jwt` callback (auth.ts): it's set from
  // user.id or token.sub on sign-in, and explicitly cleared to "" when
  // dbUser.isActive is false (ACCOUNT_LOCKED). So token.id alone is the
  // correct signed-in check.
  const isAccountLocked = (token as any)?.error === "ACCOUNT_LOCKED";
  const isAuthenticated = !!token?.id;

  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Locked accounts: send to the dedicated error page instead of /signin,
  // for both protected routes and auth routes (so they can't just retry
  // sign-in and land in a loop — /auth/error explains why they're blocked).
  if (isAccountLocked && (isProtectedRoute || isAccessingAuthRoute)) {
    if (isApiRoute) {
      return NextResponse.json({ error: "ACCOUNT_LOCKED" }, { status: 403 });
    }
    const lockedUrl = new URL("/auth/error", url);
    lockedUrl.searchParams.set("error", "ACCOUNT_LOCKED");
    return NextResponse.redirect(lockedUrl);
  }

  // Redirect authenticated users away from auth routes, honoring preserved destination
  if (isAuthenticated && isAccessingAuthRoute) {
    const callbackUrl = url.searchParams.get("callbackUrl");
    const isCallbackAuthRoute = callbackUrl && AUTH_ROUTES.some(r => callbackUrl === r || callbackUrl.startsWith(r + "/") || callbackUrl.startsWith(r + "?"));
    const safeDest = callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") && !isCallbackAuthRoute ? callbackUrl : "/accounts";
    return NextResponse.redirect(new URL(safeDest, url));
  }

  // Redirect unauthenticated users to signin, preserving destination.
  // For API routes, return 401 JSON instead of an HTML redirect so client-side
  // fetches get a handleable error rather than a redirect response.
  if (!isAuthenticated && isProtectedRoute) {
    if (isApiRoute) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/signin", url);
    const targetDest = pathname + url.search;
    if (!AUTH_ROUTES.some(r => targetDest === r || targetDest.startsWith(r + "/") || targetDest.startsWith(r + "?"))) {
      loginUrl.searchParams.set("callbackUrl", targetDest);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Handle authenticated role checks
  if (isAuthenticated) {
    if (isAdminRoute) {
      const role = String((token as any)?.userType ?? "");
      if (role.toUpperCase() !== "ADMIN") {
        return NextResponse.redirect(new URL("/", url));
      }
    }
  }
  return NextResponse.next();
}

export default proxy;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};