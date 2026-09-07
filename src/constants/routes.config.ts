/**
 * Routes Configuration for TikTok Automation (TIKTOKFLOW)
 */

// ============================================================================
// BASE & AUTH ROUTES
// ============================================================================

export const API_AUTH_PREFIX = "/api/auth";

export const AUTH_ROUTES = [
  "/signin",
  "/signup",
  "/forgot-password",
  "/auth/reset-password",
  "/auth/verify-request",
  "/auth/error",
];

export const PUBLIC_ROUTES = [
  "/",
  "/privacy",
  "/terms",
  "/auth/oauth-popup-complete",
];

export const PROTECTED_ROUTES = [
  "/accounts",
  "/checklist",
  "/revenue",
  "/leaderboard",
  "/users",
  "/gpm",
  "/settings",
];

// ============================================================================
// APP & DASHBOARD ROUTES
// ============================================================================

export const APP_ROUTES = {
  HOME: "/",
  DASHBOARD: "/accounts",
  ACCOUNTS: "/accounts",
  CHECKLIST: "/checklist",
  REVENUE: "/revenue",
  LEADERBOARD: "/leaderboard",
  USERS: "/users",
  GPM: "/gpm",
  SETTINGS: "/settings",
  SIGNIN: "/signin",
  SIGNUP: "/signup",
  FORGOT_PASSWORD: "/forgot-password",
  PRIVACY: "/privacy",
  TERMS: "/terms",
} as const;

// Backward-compatibility alias
export const DASHBOARD_ROUTES = {
  ROOT: "/accounts",
  ACCOUNTS: "/accounts",
  CHECKLIST: "/checklist",
  REVENUE: "/revenue",
  LEADERBOARD: "/leaderboard",
  USERS: "/users",
  GPM: "/gpm",
  SETTINGS: "/settings",
} as const;

// ============================================================================
// ROUTE HELPERS
// ============================================================================

/**
 * Build URL with query parameters
 * @param base Base URL path
 * @param params Query parameters object
 * @returns Complete URL with query string
 */
export function buildUrl(
  base: string,
  params?: Record<string, string | number | boolean | undefined | null>
): string {
  if (!params) return base;

  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  });

  const queryString = searchParams.toString();
  return queryString ? `${base}?${queryString}` : base;
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type AppRoute = (typeof APP_ROUTES)[keyof typeof APP_ROUTES];
export type DashboardRoute = (typeof DASHBOARD_ROUTES)[keyof typeof DASHBOARD_ROUTES];
