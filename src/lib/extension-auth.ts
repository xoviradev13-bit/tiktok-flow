/**
 * Extension / Client Agent auth helpers.
 *
 * Threat model note for killAllExtensionSessions:
 * personalToken and refresh tokens are co-located on the client
 * (chrome.storage.local / config.json). Killing all sessions buys detection +
 * admin response time, NOT automatic attacker lockout — the attacker can
 * re-exchange with a stolen personalToken until revokeExtensionCredentials.
 */

import crypto from "crypto";
import jwt from "jsonwebtoken";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import { clearUserCache } from "@/lib/auth";
import type { Prisma, PrismaClient, User } from "@/generated/prisma/client";

export const BUG_REPORT_ALERT_EMAILS_KEY = "bug_report_alert_emails";

export const LEGACY_EXTENSION_PERSONAL_TOKEN_SUNSET =
  "2026-11-10T00:00:00.000Z";

export const EXT_ACCESS_TYP = "ext_access" as const;
export const ACCESS_TOKEN_TTL_SEC = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const PAIRING_CODE_TTL_MS = 24 * 60 * 60 * 1000; // 24h first-redeem window; used codes kept longer for rebootstrap
export const REFRESH_PII_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
export const AUTH_EVENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

type DbClient = PrismaClient | Prisma.TransactionClient;

let alertingHealthChecked = false;

function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function getExtensionSessionSecret(): string {
  const dedicated = process.env.EXTENSION_SESSION_SECRET?.trim();
  if (dedicated) return dedicated;
  if (isProduction()) {
    throw new Error(
      "EXTENSION_SESSION_SECRET is required in production (no AUTH_SECRET fallback)."
    );
  }
  const fallback = process.env.AUTH_SECRET?.trim();
  if (!fallback) {
    throw new Error(
      "EXTENSION_SESSION_SECRET or AUTH_SECRET required for extension sessions in development."
    );
  }
  return fallback;
}

export function isLegacyPersonalTokenAuthAllowed(): boolean {
  const override = process.env.ALLOW_LEGACY_EXTENSION_PERSONAL_TOKEN?.trim().toLowerCase();
  if (override === "false" || override === "0") return false;
  if (override === "true" || override === "1") return true;
  return Date.now() < new Date(LEGACY_EXTENSION_PERSONAL_TOKEN_SUNSET).getTime();
}

export function hashOpaqueToken(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

/** 128-bit pairing code: ttf_pair_ + base64url(16 bytes) */
export function generatePairingCodePlaintext(): string {
  const raw = crypto.randomBytes(16).toString("base64url");
  return `ttf_pair_${raw}`;
}

export function generatePersonalToken(): string {
  return `ttf_sec_${crypto.randomBytes(16).toString("hex")}`;
}

/** AES-GCM sealed personal tokens at rest: e1.<hmac>.<iv>.<cipher>.<tag> */
function getPersonalTokenCryptoKey(): Buffer {
  return crypto.createHash("sha256").update(getExtensionSessionSecret(), "utf8").digest();
}

export function isSealedPersonalToken(stored: string): boolean {
  return stored.startsWith("e1.");
}

export function isLegacyPlainPersonalToken(stored: string): boolean {
  return /^ttf_sec_[a-f0-9]{16,64}$/i.test(stored);
}

export function sealPersonalToken(plain: string): string {
  if (!isLegacyPlainPersonalToken(plain)) {
    throw new Error("Invalid personal token format for sealing");
  }
  const key = getPersonalTokenCryptoKey();
  const hmac = crypto.createHmac("sha256", key).update(plain, "utf8").digest("hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `e1.${hmac}.${iv.toString("hex")}.${enc.toString("hex")}.${tag.toString("hex")}`;
}

/** Value to persist in User.extensionToken (never store raw ttf_sec_ going forward). */
export function persistPersonalTokenValue(plain: string): string {
  return sealPersonalToken(plain);
}

/** Reveal plaintext for pairing / Settings / admin when sealed or legacy plaintext. */
export function revealPersonalToken(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (isLegacyPlainPersonalToken(stored)) return stored;
  if (!isSealedPersonalToken(stored)) return null;
  const parts = stored.split(".");
  if (parts.length !== 5 || parts[0] !== "e1") return null;
  const [, , ivHex, encHex, tagHex] = parts;
  try {
    const key = getPersonalTokenCryptoKey();
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivHex!, "hex")
    );
    decipher.setAuthTag(Buffer.from(tagHex!, "hex"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(encHex!, "hex")),
      decipher.final(),
    ]).toString("utf8");
    return isLegacyPlainPersonalToken(plain) ? plain : null;
  } catch {
    return null;
  }
}

export function resolvePublicAppUrl(req?: Request): string {
  const configured = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
  if (configured) return configured;

  if (req) {
    const host = req.headers.get("host") || "localhost:3000";
    const proto =
      req.headers.get("x-forwarded-proto") ||
      (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    return `${proto}://${host}`;
  }

  return "http://localhost:3000";
}

export function generateRefreshTokenPlaintext(): string {
  return `ttf_rt_${crypto.randomBytes(32).toString("base64url")}`;
}

export function getClientIp(req: Request): string | undefined {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim().slice(0, 64) || undefined;
  const real = req.headers.get("x-real-ip");
  return real?.trim().slice(0, 64) || undefined;
}

export function getClientUserAgent(req: Request): string | undefined {
  return req.headers.get("user-agent")?.trim().slice(0, 200) || undefined;
}

// --- In-memory sliding-window rate limiter (single-node) ---
type RateBucket = number[];
const rateBuckets = new Map<string, RateBucket>();

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs = 60_000
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const cutoff = now - windowMs;
  let hits = rateBuckets.get(key) || [];
  hits = hits.filter((t) => t > cutoff);
  if (hits.length >= limit) {
    rateBuckets.set(key, hits);
    const retryAfterSec = Math.max(1, Math.ceil((hits[0]! + windowMs - now) / 1000));
    return { ok: false, retryAfterSec };
  }
  hits.push(now);
  rateBuckets.set(key, hits);
  return { ok: true, retryAfterSec: 0 };
}

export async function getBugAlertEmails(db: DbClient = prisma): Promise<string[]> {
  const config = await db.systemConfig.findUnique({
    where: { key: BUG_REPORT_ALERT_EMAILS_KEY },
  });
  if (!config?.value) return [];
  try {
    const parsed = JSON.parse(config.value);
    const list = Array.isArray(parsed) ? parsed : [String(parsed)];
    return list.map((e) => String(e).trim()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  } catch {
    return String(config.value)
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  }
}

export async function ensureExtensionAuthAlertingHealth(): Promise<void> {
  if (alertingHealthChecked || !isProduction()) return;
  alertingHealthChecked = true;
  const hasSentry = Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);
  let hasEmail = false;
  try {
    hasEmail = (await getBugAlertEmails()).length > 0;
  } catch {
    hasEmail = false;
  }
  if (!hasSentry && !hasEmail) {
    const msg =
      "[EXTENSION_AUTH_ALERTING_UNCONFIGURED] Production has neither Sentry DSN nor bug-alert admin emails — REFRESH_REUSE_DETECTED will only persist to DB.";
    console.error(msg);
    try {
      Sentry.captureMessage(msg, { level: "error", tags: { extension_auth: "alerting_unconfigured" } });
    } catch {
      /* ignore */
    }
  }
}

export type AuthIncidentType = "REFRESH_REUSE_DETECTED";

export async function notifyExtensionAuthIncident(
  eventType: AuthIncidentType,
  opts: {
    userId: string;
    userEmail?: string | null;
    familyId?: string;
    ip?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await ensureExtensionAuthAlertingHealth();

  const safeMeta = { ...(opts.metadata || {}), familyId: opts.familyId };
  // Never include tokens in metadata
  delete (safeMeta as any).personalToken;
  delete (safeMeta as any).refreshToken;
  delete (safeMeta as any).accessToken;

  try {
    await prisma.extensionAuthEvent.create({
      data: {
        userId: opts.userId,
        eventType,
        ip: opts.ip,
        userAgent: opts.userAgent,
        metadata: safeMeta as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error("[extension-auth] Failed to persist ExtensionAuthEvent:", err);
  }

  try {
    Sentry.captureMessage(`[${eventType}] userId=${opts.userId}`, {
      level: "error",
      tags: { "extension.auth_incident": eventType },
      fingerprint: [eventType],
      extra: {
        userId: opts.userId,
        userEmail: opts.userEmail,
        familyId: opts.familyId,
        ip: opts.ip,
      },
    });
  } catch {
    /* ignore */
  }

  try {
    const emails = await getBugAlertEmails();
    if (emails.length === 0) return;
    const { emailService } = await import("@/utils/email/emailService");
    const when = new Date().toISOString();
    await emailService.sendNodemailerEmail(
      emails,
      `[TikTokFlow] ${eventType}`,
      `
        <p><strong>${eventType}</strong></p>
        <p>User ID: ${opts.userId}</p>
        <p>Email: ${opts.userEmail || "(unknown)"}</p>
        <p>IP: ${opts.ip || "(unknown)"}</p>
        <p>Family: ${opts.familyId || "(n/a)"}</p>
        <p>Time: ${when}</p>
        <p>Session kill buys detection + admin response time — use full revoke/regenerate to lock out if personalToken was also stolen.</p>
      `
    );
  } catch (err) {
    console.error("[extension-auth] Failed to email auth incident:", err);
  }
}

/**
 * Full credential revoke: null token, disable access, bump session version,
 * wipe refresh + unused pairing rows.
 */
export async function revokeExtensionCredentials(
  userId: string,
  reason = "admin_revoke",
  tx?: Prisma.TransactionClient
): Promise<void> {
  const db = tx || prisma;
  const now = new Date();

  await db.user.update({
    where: { id: userId },
    data: {
      extensionToken: null,
      extensionAccessEnabled: false,
      extensionRevokedAt: now,
      extensionSessionVersion: { increment: 1 },
    },
  });

  await db.extensionRefreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now },
  });

  await db.extensionPairingCode.deleteMany({
    where: { userId, usedAt: null },
  });

  if (!tx) clearUserCache(userId);
  console.info(
    JSON.stringify({
      event: "extension_credentials_revoked",
      userId,
      reason,
      at: now.toISOString(),
    })
  );
}

/**
 * Global session kill (all families for the user).
 * Does NOT null personalToken — see threat model at top of file.
 */
export async function killAllExtensionSessions(
  userId: string,
  reason = "refresh_reuse"
): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { extensionSessionVersion: { increment: 1 } },
    });
    await tx.extensionRefreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
  });
  clearUserCache(userId);
  console.info(
    JSON.stringify({
      event: "kill_all_extension_sessions",
      userId,
      reason,
      blastRadius: "all_refresh_rows_for_user",
      at: now.toISOString(),
    })
  );
}

export async function createPairingCodeForUser(
  userId: string,
  db: DbClient = prisma
): Promise<string> {
  const plaintext = generatePairingCodePlaintext();
  const codeHash = hashOpaqueToken(plaintext);
  await db.extensionPairingCode.create({
    data: {
      userId,
      codeHash,
      expiresAt: new Date(Date.now() + PAIRING_CODE_TTL_MS),
    },
  });
  return plaintext;
}

export type ExtAccessJwtPayload = {
  sub: string;
  typ: typeof EXT_ACCESS_TYP;
  ver: number;
};

export function signExtAccessToken(userId: string, ver: number): {
  accessToken: string;
  expiresIn: number;
} {
  const secret = getExtensionSessionSecret();
  const expiresIn = ACCESS_TOKEN_TTL_SEC;
  const accessToken = jwt.sign(
    { sub: userId, typ: EXT_ACCESS_TYP, ver } satisfies ExtAccessJwtPayload,
    secret,
    { expiresIn }
  );
  return { accessToken, expiresIn };
}

export function verifyExtAccessToken(token: string): ExtAccessJwtPayload | null {
  try {
    const secret = getExtensionSessionSecret();
    const decoded = jwt.verify(token, secret) as jwt.JwtPayload;
    if (decoded.typ !== EXT_ACCESS_TYP || typeof decoded.sub !== "string") {
      return null;
    }
    const ver = typeof decoded.ver === "number" ? decoded.ver : Number(decoded.ver);
    if (!Number.isFinite(ver)) return null;
    return { sub: decoded.sub, typ: EXT_ACCESS_TYP, ver };
  } catch {
    return null;
  }
}

/** Reject ext_access tokens on AUTH_SECRET JWT paths (belt-and-suspenders). */
export function rejectIfExtAccessTyp(decoded: unknown): boolean {
  return Boolean(
    decoded &&
      typeof decoded === "object" &&
      "typ" in decoded &&
      (decoded as { typ?: string }).typ === EXT_ACCESS_TYP
  );
}

export async function issueSessionBundle(
  user: Pick<User, "id" | "extensionSessionVersion">,
  opts: { ip?: string; userAgent?: string; db?: DbClient } = {}
): Promise<{
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}> {
  const db = opts.db || prisma;
  const familyId = crypto.randomUUID();
  const refreshPlain = generateRefreshTokenPlaintext();
  const tokenHash = hashOpaqueToken(refreshPlain);
  const { accessToken, expiresIn } = signExtAccessToken(
    user.id,
    user.extensionSessionVersion
  );

  await db.extensionRefreshToken.create({
    data: {
      userId: user.id,
      tokenHash,
      familyId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      issuedIp: opts.ip,
      issuedUserAgent: opts.userAgent,
    },
  });

  return { accessToken, expiresIn, refreshToken: refreshPlain };
}

export async function rotateRefreshToken(
  rawRefresh: string,
  opts: { ip?: string; userAgent?: string }
): Promise<
  | { ok: true; accessToken: string; expiresIn: number; refreshToken: string; userId: string }
  | { ok: false; status: 401 | 409; reuseDetected?: boolean; error: string }
> {
  const tokenHash = hashOpaqueToken(rawRefresh);
  const existing = await prisma.extensionRefreshToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          isActive: true,
          extensionAccessEnabled: true,
          extensionToken: true,
          extensionSessionVersion: true,
        },
      },
    },
  });

  if (!existing) {
    return { ok: false, status: 401, error: "Refresh token không hợp lệ." };
  }

  // Reuse of a rotated-away token — soft-fail only (do NOT killAll).
  // Multi-profile fleets false-trigger reuse under concurrent refresh and
  // killAll + Prisma contention takes down every profile on the machine.
  if (existing.replacedById) {
    return {
      ok: false,
      status: 401,
      reuseDetected: false,
      error: "Refresh token đã được thay thế. Dùng personalToken hoặc đổi phiên lại.",
    };
  }

  if (existing.revokedAt || existing.expiresAt.getTime() < Date.now()) {
    return { ok: false, status: 401, error: "Refresh token đã hết hạn hoặc bị thu hồi." };
  }

  const user = existing.user;
  if (!user.isActive || user.extensionAccessEnabled === false || !user.extensionToken) {
    return { ok: false, status: 401, error: "Quyền Extension đã bị vô hiệu hóa." };
  }

  const newPlain = generateRefreshTokenPlaintext();
  const newHash = hashOpaqueToken(newPlain);
  const now = new Date();

  const result = await prisma.$transaction(
    async (tx) => {
      const successor = await tx.extensionRefreshToken.create({
        data: {
          userId: user.id,
          tokenHash: newHash,
          familyId: existing.familyId,
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
          issuedIp: opts.ip,
          issuedUserAgent: opts.userAgent,
          lastUsedAt: now,
        },
      });

      const rotated = await tx.extensionRefreshToken.updateMany({
        where: {
          id: existing.id,
          revokedAt: null,
          replacedById: null,
        },
        data: {
          revokedAt: now,
          replacedById: successor.id,
          lastUsedAt: now,
        },
      });

      if (rotated.count !== 1) {
        // Concurrent rotation or reuse race → treat as reuse
        return null;
      }

      return successor;
    },
    { maxWait: 10_000, timeout: 15_000 }
  );

  if (!result) {
    // Soft-fail concurrent rotation — do not kill every fleet session.
    return {
      ok: false,
      status: 409,
      reuseDetected: false,
      error: "Xung đột làm mới phiên. Thử lại hoặc dùng personalToken.",
    };
  }

  // Reload version after possible concurrent bumps
  const fresh = await prisma.user.findUnique({
    where: { id: user.id },
    select: { extensionSessionVersion: true },
  });
  const ver = fresh?.extensionSessionVersion ?? user.extensionSessionVersion;
  const { accessToken, expiresIn } = signExtAccessToken(user.id, ver);

  void purgeExpiredExtensionAuthData().catch(() => {});

  return {
    ok: true,
    accessToken,
    expiresIn,
    refreshToken: newPlain,
    userId: user.id,
  };
}

export type ResolvedExtensionAuth =
  | {
      ok: true;
      user: {
        id: string;
        name: string | null;
        email: string | null;
        username: string | null;
        role: string;
        isActive: boolean;
        extensionAccessEnabled: boolean;
        extensionToken: string | null;
        extensionSessionVersion: number;
      };
      authMode: "jwt" | "legacy_personal_token";
    }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Resolve Bearer as access JWT or (while allowed) legacy personalToken.
 * Used by report + client-sync. Does NOT accept personalToken for JWT path after sunset.
 */
export async function resolveExtensionBearerAuth(
  bearerOrToken: string,
  route: string
): Promise<ResolvedExtensionAuth> {
  const token = bearerOrToken.trim();
  if (!token) {
    return { ok: false, status: 401, error: "Thiếu Authorization Bearer." };
  }

  // Prefer JWT if it looks like one / verifies
  if (token.split(".").length === 3 && !token.startsWith("ttf_sec_")) {
    let payload: ExtAccessJwtPayload | null = null;
    try {
      payload = verifyExtAccessToken(token);
    } catch (err: any) {
      if (isProduction() && err?.message?.includes("EXTENSION_SESSION_SECRET")) {
        return { ok: false, status: 401, error: "Cấu hình phiên Extension chưa sẵn sàng." };
      }
      payload = null;
    }
    if (!payload) {
      return { ok: false, status: 401, error: "Access token không hợp lệ hoặc đã hết hạn." };
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        role: true,
        isActive: true,
        extensionAccessEnabled: true,
        extensionToken: true,
        extensionSessionVersion: true,
        deletedAt: true,
      },
    });

    if (!user || user.deletedAt) {
      return { ok: false, status: 401, error: "Access token không hợp lệ." };
    }
    if (!user.isActive || user.extensionAccessEnabled === false || !user.extensionToken) {
      return {
        ok: false,
        status: 403,
        error: "Quyền truy cập Extension đã bị vô hiệu hóa hoặc bị khóa.",
      };
    }
    if (user.extensionSessionVersion !== payload.ver) {
      return { ok: false, status: 401, error: "Phiên Extension đã bị hủy. Vui lòng xác thực lại." };
    }

    console.info(
      JSON.stringify({ event: "extension_auth", authMode: "jwt", userId: user.id, route })
    );
    return { ok: true, user, authMode: "jwt" };
  }

  // Legacy / exchange-style personalToken on API routes
  if (token.startsWith("ttf_sec_")) {
    if (!isLegacyPersonalTokenAuthAllowed()) {
      return {
        ok: false,
        status: 401,
        error:
          "Personal Token Bearer trên API báo cáo/đồng bộ đã hết hạn hỗ trợ (sunset 2026-11-10). Cập nhật Extension/Client Agent để dùng session JWT, hoặc gọi POST /api/extension/session.",
      };
    }

    const user = await findUserByPersonalToken(token);

    if (!user || user.deletedAt) {
      return {
        ok: false,
        status: 401,
        error: "Mã personalToken không hợp lệ hoặc đã bị thu hồi.",
      };
    }
    if (!user.isActive || user.extensionAccessEnabled === false) {
      return {
        ok: false,
        status: 403,
        error: "Quyền truy cập Extension đã bị vô hiệu hóa hoặc bị khóa.",
      };
    }

    console.info(
      JSON.stringify({
        event: "extension_auth",
        authMode: "legacy_personal_token",
        userId: user.id,
        route,
      })
    );
    return { ok: true, user, authMode: "legacy_personal_token" };
  }

  // Try JWT for non-ttf_sec tokens that might still be JWTs
  const payload = verifyExtAccessToken(token);
  if (payload) {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        role: true,
        isActive: true,
        extensionAccessEnabled: true,
        extensionToken: true,
        extensionSessionVersion: true,
        deletedAt: true,
      },
    });
    if (!user || user.deletedAt) {
      return { ok: false, status: 401, error: "Access token không hợp lệ." };
    }
    if (!user.isActive || user.extensionAccessEnabled === false || !user.extensionToken) {
      return {
        ok: false,
        status: 403,
        error: "Quyền truy cập Extension đã bị vô hiệu hóa hoặc bị khóa.",
      };
    }
    if (user.extensionSessionVersion !== payload.ver) {
      return { ok: false, status: 401, error: "Phiên Extension đã bị hủy. Vui lòng xác thực lại." };
    }
    console.info(
      JSON.stringify({ event: "extension_auth", authMode: "jwt", userId: user.id, route })
    );
    return { ok: true, user, authMode: "jwt" };
  }

  return { ok: false, status: 401, error: "Authorization Bearer không hợp lệ." };
}

const personalTokenUserSelect = {
  id: true,
  name: true,
  email: true,
  username: true,
  role: true,
  isActive: true,
  extensionAccessEnabled: true,
  extensionToken: true,
  extensionSessionVersion: true,
  deletedAt: true,
} as const;

export async function findUserByPersonalToken(personalToken: string) {
  const plain = personalToken.trim();
  if (!isLegacyPlainPersonalToken(plain)) return null;

  const key = getPersonalTokenCryptoKey();
  const hmac = crypto.createHmac("sha256", key).update(plain, "utf8").digest("hex");
  const sealed = await prisma.user.findFirst({
    where: { extensionToken: { startsWith: `e1.${hmac}.` } },
    select: personalTokenUserSelect,
  });
  if (sealed) return sealed;

  const legacy = await prisma.user.findUnique({
    where: { extensionToken: plain },
    select: personalTokenUserSelect,
  });
  if (!legacy) return null;

  // Lazy upgrade plaintext → sealed at rest
  try {
    const sealedValue = sealPersonalToken(plain);
    await prisma.user.update({
      where: { id: legacy.id },
      data: { extensionToken: sealedValue },
    });
    return { ...legacy, extensionToken: sealedValue };
  } catch {
    return legacy;
  }
}

export async function purgeExpiredExtensionAuthData(): Promise<{
  refreshDeleted: number;
  eventsDeleted: number;
  pairingDeleted: number;
  attestNoncesDeleted: number;
}> {
  const now = new Date();
  const refreshCutoff = new Date(now.getTime() - REFRESH_PII_GRACE_MS);
  const eventCutoff = new Date(now.getTime() - AUTH_EVENT_RETENTION_MS);

  const [refreshDeleted, eventsDeleted, pairingDeleted, attestNoncesDeleted] =
    await Promise.all([
      prisma.extensionRefreshToken.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: refreshCutoff } },
            {
              AND: [
                { revokedAt: { not: null } },
                { revokedAt: { lt: refreshCutoff } },
              ],
            },
          ],
        },
      }),
      prisma.extensionAuthEvent.deleteMany({
        where: { createdAt: { lt: eventCutoff } },
      }),
      prisma.extensionPairingCode.deleteMany({
        where: {
          OR: [
            // Unused codes past expiry only
            { usedAt: null, expiresAt: { lt: now } },
            // Used codes kept for multi-profile rebootstrap, then purged after grace
            { usedAt: { not: null, lt: refreshCutoff } },
          ],
        },
      }),
      prisma.extensionAttestNonce.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
    ]);

  return {
    refreshDeleted: refreshDeleted.count,
    eventsDeleted: eventsDeleted.count,
    pairingDeleted: pairingDeleted.count,
    attestNoncesDeleted: attestNoncesDeleted.count,
  };
}

// --- Machine ID binding + Agent HMAC attest ---

export function generateAgentAttestSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Seal arbitrary attest secret (same AES-GCM key as personalToken). Format a1.<iv>.<enc>.<tag> */
export function sealAgentAttestSecret(plain: string): string {
  const key = getPersonalTokenCryptoKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `a1.${iv.toString("hex")}.${enc.toString("hex")}.${tag.toString("hex")}`;
}

export function revealAgentAttestSecret(
  stored: string | null | undefined
): string | null {
  if (!stored || !stored.startsWith("a1.")) return null;
  const parts = stored.split(".");
  if (parts.length !== 4) return null;
  const [, ivHex, encHex, tagHex] = parts;
  try {
    const key = getPersonalTokenCryptoKey();
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivHex!, "hex")
    );
    decipher.setAuthTag(Buffer.from(tagHex!, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(encHex!, "hex")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Reuse existing sealed secret (default) or mint. Rotate only when rotate=true.
 * Returns plaintext for Client Agent zip only.
 */
export async function ensureAgentAttestSecretPlain(
  userId: string,
  opts: { rotate?: boolean } = {},
  db: DbClient = prisma
): Promise<string> {
  if (!opts.rotate) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { agentAttestSecretSealed: true },
    });
    if (user?.agentAttestSecretSealed) {
      const plain = revealAgentAttestSecret(user.agentAttestSecretSealed);
      if (plain) return plain;
    }
  }
  const plain = generateAgentAttestSecret();
  await db.user.update({
    where: { id: userId },
    data: { agentAttestSecretSealed: sealAgentAttestSecret(plain) },
  });
  return plain;
}

export async function writeMachineBindingLog(
  db: DbClient,
  entry: {
    userId: string;
    action: string;
    reason?: string | null;
    machineId?: string | null;
    machineName?: string | null;
    osUsername?: string | null;
    ip?: string | null;
    actorUserId?: string | null;
    actorName?: string | null;
    metadata?: Record<string, unknown> | null;
  }
): Promise<void> {
  await db.machineBindingLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      reason: entry.reason ?? null,
      machineId: entry.machineId ?? null,
      machineName: entry.machineName ?? null,
      osUsername: entry.osUsername ?? null,
      ip: entry.ip ?? null,
      actorUserId: entry.actorUserId ?? null,
      actorName: entry.actorName ?? null,
      metadata: entry.metadata
        ? (entry.metadata as Prisma.InputJsonValue)
        : undefined,
    },
  });
}

export type MachineAttestInput = {
  machineId?: string | null;
  machineName?: string | null;
  osUsername?: string | null;
  nonce?: string | null;
  ts?: number | string | null;
  sig?: string | null;
};

export type MachineBindResult =
  | { ok: true }
  | {
      ok: false;
      status: 403 | 429;
      error: string;
      reason?: string;
      retryAfterSec?: number;
    };

export async function checkAndBindMachine(
  userId: string,
  input: MachineAttestInput,
  meta: {
    ip?: string;
    actorName?: string;
    rlPrefix?: "pair" | "session";
  } = {},
  db: DbClient = prisma
): Promise<MachineBindResult> {
  const machineId =
    typeof input.machineId === "string" ? input.machineId.trim() : "";
  const machineName =
    typeof input.machineName === "string" ? input.machineName.trim() : "";
  const osUsername =
    typeof input.osUsername === "string" ? input.osUsername.trim() : "";
  const nonce = typeof input.nonce === "string" ? input.nonce.trim() : "";
  const sig =
    typeof input.sig === "string" ? input.sig.trim().toLowerCase() : "";
  const ts = Number(input.ts);

  if (!machineId || !nonce || !sig || !Number.isFinite(ts)) {
    await writeMachineBindingLog(db, {
      userId,
      action: "BIND_REJECTED",
      reason: "missing_attest",
      ip: meta.ip,
    });
    return {
      ok: false,
      status: 403,
      reason: "missing_attest",
      error:
        "Thiếu chứng thực Client Agent (machineId/nonce/ts/sig). Hãy đảm bảo Agent đang chạy (Windows Service) rồi thử lại.",
    };
  }

  if (Math.abs(Date.now() - ts) > 120_000) {
    await writeMachineBindingLog(db, {
      userId,
      action: "BIND_REJECTED",
      reason: "ts_window",
      machineId,
      ip: meta.ip,
    });
    return {
      ok: false,
      status: 403,
      reason: "ts_window",
      error:
        "Chứng thực Agent hết hạn hoặc đồng bộ thời gian thất bại. Thử lại.",
    };
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      boundMachineId: true,
      boundMachineName: true,
      agentAttestSecretSealed: true,
    },
  });
  if (!user) {
    return { ok: false, status: 403, error: "Người dùng không tồn tại." };
  }
  if (!user.agentAttestSecretSealed) {
    return {
      ok: false,
      status: 403,
      reason: "missing_secret",
      error:
        "Thiếu agentAttestSecret. Tải lại zip Client Agent (pairing mới) để nhận secret.",
    };
  }

  const attestSecret = revealAgentAttestSecret(user.agentAttestSecretSealed);
  if (!attestSecret) {
    return {
      ok: false,
      status: 403,
      reason: "secret_reveal_fail",
      error: "Không giải mã được agentAttestSecret. Liên hệ Admin.",
    };
  }

  const canonical = [
    machineId,
    machineName || "",
    osUsername || "",
    nonce,
    String(ts),
  ].join("\n");
  const expected = crypto
    .createHmac("sha256", attestSecret)
    .update(canonical)
    .digest("hex");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    await writeMachineBindingLog(db, {
      userId,
      action: "BIND_REJECTED",
      reason: "bad_sig",
      machineId,
      ip: meta.ip,
    });
    const prefix = meta.rlPrefix ?? "pair";
    const ip = meta.ip || "unknown";
    const ipLim = checkRateLimit(`${prefix}:attestfail:ip:${ip}`, 20);
    const userLim = checkRateLimit(`${prefix}:attestfail:user:${userId}`, 10);
    if (!ipLim.ok || !userLim.ok) {
      const retryAfterSec = Math.max(
        ipLim.retryAfterSec,
        userLim.retryAfterSec,
        1
      );
      return {
        ok: false,
        status: 429,
        reason: "attest_rate_limited",
        retryAfterSec,
        error: "Quá nhiều lần xác thực Agent thất bại. Thử lại sau.",
      };
    }
    return {
      ok: false,
      status: 403,
      reason: "bad_sig",
      error: "Chữ ký Client Agent không hợp lệ.",
    };
  }

  try {
    await db.extensionAttestNonce.create({
      data: {
        nonce,
        userId,
        expiresAt: new Date(Date.now() + 2 * 60 * 1000),
      },
    });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "P2002") {
      await writeMachineBindingLog(db, {
        userId,
        action: "BIND_REJECTED",
        reason: "nonce_replay",
        machineId,
        ip: meta.ip,
      });
      return {
        ok: false,
        status: 403,
        reason: "nonce_replay",
        error: "Nonce attest đã dùng. Thử lại.",
      };
    }
    throw e;
  }

  try {
    if (!user.boundMachineId) {
      const conflict = await db.user.findFirst({
        where: { boundMachineId: machineId, NOT: { id: userId } },
        select: { id: true },
      });
      if (conflict) {
        await writeMachineBindingLog(db, {
          userId,
          action: "BIND_REJECTED",
          reason: "occupied",
          machineId,
          metadata: { conflictUserId: conflict.id },
          ip: meta.ip,
        });
        return {
          ok: false,
          status: 403,
          reason: "occupied",
          error:
            "Thiết bị máy tính này đã được liên kết với một nhân sự khác. Liên hệ Admin để được hỗ trợ.",
        };
      }

      await db.user.update({
        where: { id: userId },
        data: {
          boundMachineId: machineId,
          boundMachineName: machineName || null,
          boundOsUser: osUsername || null,
          boundMachineAt: new Date(),
        },
      });
      clearUserCache(userId);
      await writeMachineBindingLog(db, {
        userId,
        action: "BIND",
        machineId,
        machineName,
        osUsername,
        ip: meta.ip,
        actorName: meta.actorName,
      });
      return { ok: true };
    }

    if (user.boundMachineId !== machineId) {
      await writeMachineBindingLog(db, {
        userId,
        action: "BIND_REJECTED",
        reason: "mismatch",
        machineId,
        ip: meta.ip,
      });
      return {
        ok: false,
        status: 403,
        reason: "mismatch",
        error: `Tài khoản đã được gắn cố định với máy tính "${user.boundMachineName || user.boundMachineId}". Không thể kích hoạt trên máy tính khác. Gửi yêu cầu đổi máy hoặc liên hệ Admin.`,
      };
    }

    // Same machineId — refresh display only (no audit log)
    await db.user.update({
      where: { id: userId },
      data: {
        boundMachineName: machineName || user.boundMachineName,
        boundOsUser: osUsername || undefined,
        boundMachineAt: new Date(),
      },
    });
    return { ok: true };
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "P2002") {
      await writeMachineBindingLog(db, {
        userId,
        action: "BIND_REJECTED",
        reason: "race_occupied",
        machineId,
        ip: meta.ip,
      });
      return {
        ok: false,
        status: 403,
        reason: "race_occupied",
        error: "Máy này vừa được liên kết với tài khoản khác. Liên hệ Admin.",
      };
    }
    throw e;
  }
}

/** Verify HMAC for /resolve-browser report (Track C). */
export function verifyResolveAttestSig(
  attestSecret: string,
  fields: {
    machineId: string;
    sessionHash: string;
    gpmProfileId: string;
    reason: string;
    nonce: string;
    ts: number;
    sig: string;
  }
): boolean {
  const canonical = [
    fields.machineId,
    fields.sessionHash,
    fields.gpmProfileId || "",
    fields.reason || "",
    fields.nonce,
    String(fields.ts),
  ].join("\n");
  const expected = crypto
    .createHmac("sha256", attestSecret)
    .update(canonical)
    .digest("hex");
  const a = Buffer.from(fields.sig.trim().toLowerCase(), "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Kick health check once on first import in production (non-blocking)
if (typeof process !== "undefined" && isProduction()) {
  void ensureExtensionAuthAlertingHealth().catch(() => {});
}
