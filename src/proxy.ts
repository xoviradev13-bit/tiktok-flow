import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { API_AUTH_PREFIX, AUTH_ROUTES, PROTECTED_ROUTES, PUBLIC_ROUTES } from "./constants/routes.config";

export async function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const pathname = url.pathname;

  // Skip proxy for static files and API routes
  const isStatic = pathname.startsWith("/_next") || /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/.test(pathname);
  const isAccessingApiAuthRoute = pathname.startsWith(API_AUTH_PREFIX);
  const isApiRoute = pathname.startsWith("/api");

  if (isAccessingApiAuthRoute || isStatic || isApiRoute) {
    return NextResponse.next();
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
  const isAuthenticated = !!token;

  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Redirect authenticated users away from auth routes, honoring preserved destination
  if (isAuthenticated && isAccessingAuthRoute) {
    const callbackUrl = url.searchParams.get("callbackUrl");
    const isCallbackAuthRoute = callbackUrl && AUTH_ROUTES.some(r => callbackUrl === r || callbackUrl.startsWith(r + "/") || callbackUrl.startsWith(r + "?"));
    const safeDest = callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") && !isCallbackAuthRoute ? callbackUrl : "/accounts";
    return NextResponse.redirect(new URL(safeDest, url));
  }

  // Redirect unauthenticated users to signin, preserving destination
  if (!isAuthenticated && isProtectedRoute) {
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
