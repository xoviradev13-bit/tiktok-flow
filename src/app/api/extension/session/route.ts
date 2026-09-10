/**
 * POST /api/extension/session
 * Exchange personalToken → session, or refresh rotated refresh tokens.
 * Do NOT log request/response bodies — they carry secrets.
 */
import { NextResponse } from "next/server";
import {
  checkRateLimit,
  findUserByPersonalToken,
  getClientIp,
  getClientUserAgent,
  getExtensionSessionSecret,
  issueSessionBundle,
  rotateRefreshToken,
} from "@/lib/extension-auth";

export async function POST(req: Request) {
  // Intentionally no body logging on this route (secrets in JSON).
  const ip = getClientIp(req) || "unknown";
  const userAgent = getClientUserAgent(req);

  const ipLimit = checkRateLimit(`session:ip:${ip}`, 180);
  if (!ipLimit.ok) {
    return NextResponse.json(
      { success: false, error: "Quá nhiều yêu cầu. Thử lại sau." },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } }
    );
  }

  let body: { refreshToken?: string } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  try {
    getExtensionSessionSecret();
  } catch (err: any) {
    console.error("[extension/session]", err?.message || err);
    return NextResponse.json(
      { success: false, error: "Cấu hình phiên Extension chưa sẵn sàng." },
      { status: 500 }
    );
  }

  const refreshToken =
    typeof body.refreshToken === "string" ? body.refreshToken.trim() : "";

  if (refreshToken) {
    // Need userId for per-user limit — hash-based lookup happens inside rotate
    const result = await rotateRefreshToken(refreshToken, { ip, userAgent });
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error, reuseDetected: result.reuseDetected || false },
        { status: result.status }
      );
    }

    const userLimit = checkRateLimit(`session:user:${result.userId}`, 40);
    if (!userLimit.ok) {
      return NextResponse.json(
        { success: false, error: "Quá nhiều yêu cầu. Thử lại sau." },
        { status: 429, headers: { "Retry-After": String(userLimit.retryAfterSec) } }
      );
    }

    return NextResponse.json({
      success: true,
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      refreshToken: result.refreshToken,
    });
  }

  // Exchange: Bearer ttf_sec_…
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
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
      { success: false, error: "Personal Token không hợp lệ hoặc đã bị thu hồi." },
      { status: 401 }
    );
  }

  const userLimit = checkRateLimit(`session:user:${user.id}`, 40);
  if (!userLimit.ok) {
    return NextResponse.json(
      { success: false, error: "Quá nhiều yêu cầu. Thử lại sau." },
      { status: 429, headers: { "Retry-After": String(userLimit.retryAfterSec) } }
    );
  }

  if (!user.isActive || user.extensionAccessEnabled === false) {
    return NextResponse.json(
      { success: false, error: "Quyền Extension đã bị vô hiệu hóa." },
      { status: 403 }
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
