/**
 * POST /api/extension/session
 * Exchange personalToken → session, or refresh rotated refresh tokens.
 * Do NOT log request/response bodies — they carry secrets.
 */
import { NextResponse } from "next/server";
import {
  checkAndBindMachine,
  checkRateLimit,
  findUserByPersonalToken,
  getClientIp,
  getClientUserAgent,
  getExtensionSessionSecret,
  issueSessionBundle,
  rotateRefreshToken,
} from "@/lib/extension-auth";
import { extensionOptionsResponse } from "@/lib/extension-cors";

export function OPTIONS(req: Request) { return extensionOptionsResponse(req); }


// FIX: bound the incoming body before req.json() parses it.
const MAX_SESSION_BODY_BYTES = 64 * 1024; // 64 KB is generous for this payload

// FIX: cap the bearer / refresh token length before any hashing or DB lookup.
// Real tokens are ~40 chars; the cap only affects malicious payloads.
const MAX_TOKEN_LEN = 200;

export async function POST(req: Request) {
  const ip = getClientIp(req) || "unknown";
  const userAgent = getClientUserAgent(req);

  const ipLimit = checkRateLimit(`session:ip:${ip}`, 180);
  if (!ipLimit.ok) {
    return NextResponse.json(
      { success: false, error: "Quá nhiều yêu cầu. Thử lại sau." },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } }
    );
  }

  // FIX: reject oversized bodies before parsing.
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_SESSION_BODY_BYTES) {
    return NextResponse.json(
      { success: false, error: "Payload quá lớn." },
      { status: 413 }
    );
  }

  let body: {
    refreshToken?: string;
    machineId?: string;
    machineName?: string;
    osUsername?: string;
    nonce?: string;
    ts?: number | string;
    sig?: string;
  } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  try {
    getExtensionSessionSecret();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[extension/session]", message);
    return NextResponse.json(
      { success: false, error: "Cấu hình phiên Extension chưa sẵn sàng." },
      { status: 500 }
    );
  }

  const refreshTokenRaw =
    typeof body.refreshToken === "string" ? body.refreshToken.trim() : "";

  // FIX: length cap on refresh token.
  const refreshToken = refreshTokenRaw.length > MAX_TOKEN_LEN ? "" : refreshTokenRaw;

  if (refreshToken) {
    // FIX: refresh-path rate limiting.
    //
    // The previous code checked `session:user:${userId}` AFTER rotateRefreshToken
    // had already consumed the old token in the DB. If that check failed, the
    // server returned 429 without giving the client the new refresh token —
    // the client's stored token was now dead, and every subsequent refresh
    // would fail. That is a session-breaking bug.
    //
    // The per-IP limit at the top (180/min) is the real protection here. Any
    // per-user limit would need to be enforced *before* rotation, which would
    // require a "peek" helper on the lib side. Until that exists, do not gate
    // the refresh path on a post-rotation check.
    const result = await rotateRefreshToken(refreshToken, { ip, userAgent });
    if (!result.ok) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          reuseDetected: result.reuseDetected || false,
        },
        { status: result.status }
      );
    }

    return NextResponse.json({
      success: true,
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      refreshToken: result.refreshToken,
    });
  }

  const authHeader = req.headers.get("authorization");
  const bearerRaw = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  // FIX: length cap on bearer as well.
  const bearer = bearerRaw.length > MAX_TOKEN_LEN ? "" : bearerRaw;

  if (!bearer.startsWith("ttf_sec_")) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Cần Authorization: Bearer <personalToken> để đổi phiên, hoặc body.refreshToken để làm mới.",
      },
      { status: 401 }
    );
  }

  const user = await findUserByPersonalToken(bearer);
  if (!user || user.deletedAt) {
    return NextResponse.json(
      {
        success: false,
        error: "Personal Token không hợp lệ hoặc đã bị thu hồi.",
      },
      { status: 401 }
    );
  }

  const userLimit = checkRateLimit(`session:user:${user.id}`, 40);
  if (!userLimit.ok) {
    return NextResponse.json(
      { success: false, error: "Quá nhiều yêu cầu. Thử lại sau." },
      {
        status: 429,
        headers: { "Retry-After": String(userLimit.retryAfterSec) },
      }
    );
  }

  if (!user.isActive || user.extensionAccessEnabled === false) {
    return NextResponse.json(
      { success: false, error: "Quyền Extension đã bị vô hiệu hóa." },
      { status: 403 }
    );
  }

  const machineCheck = await checkAndBindMachine(
    user.id,
    {
      machineId: body.machineId,
      machineName: body.machineName,
      osUsername: body.osUsername,
      nonce: body.nonce,
      ts: body.ts,
      sig: body.sig,
    },
    { ip, rlPrefix: "session" }
  );
  if (!machineCheck.ok) {
    const headers =
      machineCheck.status === 429
        ? { "Retry-After": String(machineCheck.retryAfterSec ?? 60) }
        : undefined;
    return NextResponse.json(
      {
        success: false,
        error: machineCheck.error,
        reason: machineCheck.reason,
      },
      { status: machineCheck.status, headers }
    );
  }

  const session = await issueSessionBundle(user, { ip, userAgent });

  return NextResponse.json({
    success: true,
    accessToken: session.accessToken,
    expiresIn: session.expiresIn,
    refreshToken: session.refreshToken,
  });
}