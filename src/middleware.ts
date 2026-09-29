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
  const rawHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const hostname = rawHost.split(":")[0].toLowerCase();

  // Canonical redirect: www.domain -> root domain
  if (hostname === "www.streamdash.site" || hostname === "www.tiktokflow.site") {
    const rootDomain = hostname.replace(/^www\./, "");
    return NextResponse.redirect(new URL(`https://${rootDomain}${pathname}${url.search}`), 301);
  }

  if (!isApiRoute) {
    if (hostname.startsWith("docs.") && !pathname.startsWith("/docs")) {
      return NextResponse.rewrite(new URL(`/docs${pathname === "/" ? "" : pathname}`, request.url));
    }
    if ((hostname.startsWith("api.") || hostname.startsWith("developers.")) && !pathname.startsWith("/api-docs")) {
      return NextResponse.rewrite(new URL(`/api-docs${pathname === "/" ? "" : pathname}`, request.url));
    }
    if ((hostname.startsWith("trust.") || hostname.startsWith("legal.")) && !pathname.startsWith("/security")) {
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
    (PROTECTED_ROUTES.some(route => pathname === route || pathname.startsWith(route + "/")) || pathname.startsWith("/dashboard"));
  const isAdminRoute = pathname === "/dashboard/admin" || pathname.startsWith("/dashboard/admin/");

  const IS_PRODUCTION = process.env.APP_ENV === "production" || process.env.NODE_ENV === "production";
  const SHARED_COOKIE_NAME = IS_PRODUCTION
    ? (process.env.COOKIE_NAME || "__Secure-streamdash.session-token")
    : "streamdash.session-token";

  let token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    cookieName: SHARED_COOKIE_NAME,
    secureCookie: IS_PRODUCTION,
  });

  // Backward compatibility with previous cookie name during migration
  if (!token) {
    token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
      cookieName: IS_PRODUCTION ? "__Secure-tiktokflow.session-token" : "tiktokflow.session-token",
      secureCookie: IS_PRODUCTION,
    });
  }

  if (!token) {
    token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
    });
  }

  // token.id is normalized in the `jwt` callback (auth.ts): it's set from
  // user.id or token.sub on sign-in, and explicitly cleared to "" when
  // dbUser.isActive is false (ACCOUNT_LOCKED). So token.id alone is the
  // correct signed-in check.
  const isAccountLocked = (token as any)?.error === "ACCOUNT_LOCKED";
  const isAuthenticated = !!token?.id;

  const isPublicDomain = hostname === "streamdash.site" || hostname === "tiktokflow.site";
  const isAppDomain = hostname === "app.streamdash.site" || hostname === "app.tiktokflow.site";
  const appBaseUrl = hostname.includes("tiktokflow") ? "https://app.tiktokflow.site" : "https://app.streamdash.site";

  // Compute the real public external origin so redirects never leak internal container origins (like 0.0.0.0:3000)
  const rawProto = request.headers.get("x-forwarded-proto") || (request.url.startsWith("https") ? "https" : "http");
  const proto = rawProto.split(",")[0].trim();
  const isInternalHost = !rawHost || rawHost.startsWith("0.0.0.0") || rawHost.startsWith("127.0.0.1") || rawHost.startsWith("localhost");

  const publicBaseUrl = isAppDomain
    ? appBaseUrl
    : isPublicDomain
    ? (hostname.includes("tiktokflow") ? "https://tiktokflow.site" : "https://streamdash.site")
    : (isInternalHost ? (IS_PRODUCTION ? "https://app.streamdash.site" : url.origin) : `${proto}://${rawHost}`);

  // Helper: create a redirection response guaranteed to point to the external public domain
  const createRedirect = (destPath: string, searchParams?: Record<string, string>, statusCode: number = 307) => {
    const targetUrl = new URL(destPath, publicBaseUrl);
    if (searchParams) {
      for (const [k, v] of Object.entries(searchParams)) {
        targetUrl.searchParams.set(k, v);
      }
    }
    return NextResponse.redirect(targetUrl, statusCode);
  };

  // ── A. ROOT PUBLIC DOMAIN ──────────────────────────────────────────────────
  if (isPublicDomain) {
    // Auth routes on public domain -> redirect to app subdomain
    if (isAccessingAuthRoute) {
      return NextResponse.redirect(new URL(`${appBaseUrl}${pathname}${url.search}`));
    }

    // Protected dashboard routes on public domain -> redirect to app subdomain
    if (isProtectedRoute) {
      return NextResponse.redirect(new URL(`${appBaseUrl}${pathname}${url.search}`));
    }

    // Public pages (landing, terms, privacy, docs, security) -> serve normally
    return NextResponse.next();
  }

  // ── B. APPLICATION SUBDOMAIN (app.streamdash.site) ───────────────────────────
  if (isAppDomain) {
    // Root URL (app.streamdash.site/) -> redirect to dashboard if authenticated, or signin
    if (pathname === "/") {
      if (isAuthenticated) {
        return createRedirect("/accounts");
      }
      return createRedirect("/signin");
    }

    // Locked accounts: redirect to /auth/error
    if (isAccountLocked && (isProtectedRoute || isAccessingAuthRoute)) {
      if (isApiRoute) {
        return NextResponse.json({ error: "ACCOUNT_LOCKED" }, { status: 403 });
      }
      return createRedirect("/auth/error", { error: "ACCOUNT_LOCKED" });
    }

    // If authenticated user tries to access /signin, /signup, etc. -> redirect to accounts or callbackUrl
    if (isAuthenticated && isAccessingAuthRoute) {
      const callbackUrl = url.searchParams.get("callbackUrl");
      const isCallbackAuthRoute = callbackUrl && AUTH_ROUTES.some(r => callbackUrl === r || callbackUrl.startsWith(r + "/") || callbackUrl.startsWith(r + "?"));
      const safeDest = callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") && !isCallbackAuthRoute ? callbackUrl : "/accounts";
      return createRedirect(safeDest);
    }

    // If unauthenticated user tries to access protected routes -> redirect to /signin
    if (!isAuthenticated && isProtectedRoute) {
      if (isApiRoute) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const targetDest = pathname + url.search;
      const redirectParams: Record<string, string> = {};
      if (!AUTH_ROUTES.some(r => targetDest === r || targetDest.startsWith(r + "/") || targetDest.startsWith(r + "?"))) {
        redirectParams.callbackUrl = targetDest;
      }
      return createRedirect("/signin", redirectParams);
    }

    // Admin role check
    if (isAuthenticated && isAdminRoute) {
      const role = String((token as any)?.userType ?? "");
      if (role.toUpperCase() !== "ADMIN") {
        return createRedirect("/accounts");
      }
    }

    return NextResponse.next();
  }

  // ── C. LOCAL DEVELOPMENT / PREVIEW FALLBACK (localhost, *.sslip.io, etc.) ──
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Locked accounts: send to the dedicated error page instead of /signin
  if (isAccountLocked && (isProtectedRoute || isAccessingAuthRoute)) {
    if (isApiRoute) {
      return NextResponse.json({ error: "ACCOUNT_LOCKED" }, { status: 403 });
    }
    return createRedirect("/auth/error", { error: "ACCOUNT_LOCKED" });
  }

  // Redirect authenticated users away from auth routes, honoring preserved destination
  if (isAuthenticated && isAccessingAuthRoute) {
    const callbackUrl = url.searchParams.get("callbackUrl");
    const isCallbackAuthRoute = callbackUrl && AUTH_ROUTES.some(r => callbackUrl === r || callbackUrl.startsWith(r + "/") || callbackUrl.startsWith(r + "?"));
    const safeDest = callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") && !isCallbackAuthRoute ? callbackUrl : "/accounts";
    return createRedirect(safeDest);
  }

  // Redirect unauthenticated users to signin, preserving destination
  if (!isAuthenticated && isProtectedRoute) {
    if (isApiRoute) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const targetDest = pathname + url.search;
    const redirectParams: Record<string, string> = {};
    if (!AUTH_ROUTES.some(r => targetDest === r || targetDest.startsWith(r + "/") || targetDest.startsWith(r + "?"))) {
      redirectParams.callbackUrl = targetDest;
    }
    return createRedirect("/signin", redirectParams);
  }

  // Handle authenticated role checks
  if (isAuthenticated) {
    if (isAdminRoute) {
      const role = String((token as any)?.userType ?? "");
      if (role.toUpperCase() !== "ADMIN") {
        return createRedirect("/");
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