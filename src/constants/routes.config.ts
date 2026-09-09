/**
 * Routes Configuration for TikTok Automation (TIKTOKFLOW)
 * Centralized routes & navigation links for all pages & layouts.
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
  "/security",
  "/docs",
  "/api-docs",
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
  "/logs",
  "/extensions",
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
  LOGS: "/logs",
  DOCS: "/docs",
  API_DOCS: "/api-docs",
  SECURITY: "/security",
  EXTENSIONS: "/extensions",
  PRIVACY: "/privacy",
  TERMS: "/terms",
  SIGNIN: "/signin",
  SIGNUP: "/signup",
  FORGOT_PASSWORD: "/forgot-password",
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
  LOGS: "/logs",
  EXTENSIONS: "/extensions",
} as const;

// ============================================================================
// CENTRALIZED PUBLIC & FOOTER NAVIGATION CONFIGS
// Edit here to update links across all pages and footers instantly!
// ============================================================================

export interface NavLinkItem {
  readonly label: string;
  readonly href: string;
}

/** Top navigation bar links across public pages */
export const PUBLIC_NAV_LINKS: readonly NavLinkItem[] = [
  { label: "Hướng Dẫn (Docs)", href: APP_ROUTES.DOCS },
  { label: "Tải Tiện Ích", href: APP_ROUTES.EXTENSIONS },
  { label: "API Reference", href: APP_ROUTES.API_DOCS },
  { label: "Bảo Mật", href: APP_ROUTES.SECURITY },
  { label: "Điều Khoản", href: APP_ROUTES.TERMS },
];

/** Footer: Vận Hành & Sản Phẩm */
export const FOOTER_PRODUCT_LINKS: readonly NavLinkItem[] = [
  { label: "Quản Lý Dàn Account", href: APP_ROUTES.ACCOUNTS },
  { label: "GPMLogin Fleet Hub", href: APP_ROUTES.GPM },
  { label: "Kho Tiện Ích Mở Rộng", href: APP_ROUTES.EXTENSIONS },
  { label: "Báo Cáo & Doanh Thu", href: APP_ROUTES.REVENUE },
  { label: "Bảng Xếp Hạng Studio", href: APP_ROUTES.LEADERBOARD },
];

/** Footer: Tài Liệu & Hướng Dẫn */
export const FOOTER_DOC_LINKS: readonly NavLinkItem[] = [
  { label: "Hướng Dẫn Nhập Môn", href: APP_ROUTES.DOCS },
  { label: "API Reference & Webhooks", href: APP_ROUTES.API_DOCS },
  { label: "Companion Extension", href: APP_ROUTES.EXTENSIONS },
  { label: "Client Agent Worker (Portable)", href: APP_ROUTES.SETTINGS },
  { label: "Nhật Ký Hệ Thống (Audit Logs)", href: APP_ROUTES.LOGS },
];

/** Footer: Bảo Mật & Pháp Lý */
export const FOOTER_LEGAL_LINKS: readonly NavLinkItem[] = [
  { label: "Trung Tâm Bảo Mật (Trust Center)", href: APP_ROUTES.SECURITY },
  { label: "Điều Khoản Dịch Vụ (TOS)", href: APP_ROUTES.TERMS },
  { label: "Chính Sách Quyền Riêng Tư", href: APP_ROUTES.PRIVACY },
  { label: "Cổng Đăng Nhập Studio", href: APP_ROUTES.SIGNIN },
];

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
