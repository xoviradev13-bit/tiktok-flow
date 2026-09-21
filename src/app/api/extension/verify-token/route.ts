import { NextResponse } from "next/server";
import {
  checkRateLimit,
  findUserByPersonalToken,
  getClientIp,
} from "@/lib/extension-auth";

// FIX: cap the incoming token length before regex and hashing.
const MAX_TOKEN_LEN = 200;

async function handleVerify(req: Request, token: string) {
  const ip = getClientIp(req) || "unknown";
  const ipLimit = checkRateLimit(`verify-token:ip:${ip}`, 60);
  if (!ipLimit.ok) {
    return NextResponse.json(
      { success: false, valid: false, error: "Quá nhiều yêu cầu. Thử lại sau." },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } }
    );
  }

  // FIX: length cap. Prevents absurd payloads from hitting regex / hash / DB.
  const trimmed = token.trim();
  if (trimmed.length > MAX_TOKEN_LEN) {
    return NextResponse.json(
      {
        success: false,
        valid: false,
        error: "Định dạng Token không hợp lệ. Mã hợp lệ phải bắt đầu bằng 'ttf_sec_'.",
      },
      { status: 400 }
    );
  }

  if (!trimmed) {
    return NextResponse.json(
      {
        success: false,
        valid: false,
        error: "Vui lòng cung cấp mã Personal Token cần kiểm tra.",
      },
      { status: 400 }
    );
  }

  // Format validation (must match ttf_sec_ format).
  if (!/^ttf_sec_[a-f0-9]{16,64}$/i.test(trimmed)) {
    return NextResponse.json(
      {
        success: false,
        valid: false,
        error: "Định dạng Token không hợp lệ. Mã hợp lệ phải bắt đầu bằng 'ttf_sec_'.",
      },
      { status: 400 }
    );
  }

  const tokenLimit = checkRateLimit(`verify-token:tok:${trimmed.slice(0, 20)}`, 30);
  if (!tokenLimit.ok) {
    return NextResponse.json(
      { success: false, valid: false, error: "Quá nhiều yêu cầu. Thử lại sau." },
      { status: 429, headers: { "Retry-After": String(tokenLimit.retryAfterSec) } }
    );
  }

  // DB lookup (supports sealed-at-rest tokens).
  const user = await findUserByPersonalToken(trimmed);

  if (!user) {
    return NextResponse.json(
      {
        success: false,
        valid: false,
        error: "Mã Token không tồn tại hoặc đã hết hạn sau khi cấp mới.",
      },
      { status: 401 }
    );
  }

  if (!user.isActive) {
    return NextResponse.json(
      {
        success: false,
        valid: false,
        error: "Tài khoản liên kết với Token này đã bị tạm khóa.",
      },
      { status: 403 }
    );
  }

  if (user.extensionAccessEnabled === false) {
    return NextResponse.json(
      {
        success: false,
        valid: false,
        error:
          "Quyền sử dụng Extension của tài khoản này đã bị Quản trị viên vô hiệu hóa.",
      },
      { status: 403 }
    );
  }

  const displayName = user.name || user.username || user.email || "Nhân sự hệ thống";

  return NextResponse.json({
    success: true,
    valid: true,
    user: {
      id: user.id,
      name: displayName,
      email: user.email,
      role: user.role,
    },
    message: `Xác thực thành công cho nhân sự: ${displayName}`,
  });
}

export async function POST(req: Request) {
  try {
    let token = "";

    // 1. Check body first.
    try {
      const body = await req.json();
      token = typeof body?.token === "string" ? body.token : "";
    } catch {
      // Body might be empty or invalid JSON.
    }

    // 2. Fallback to headers.
    if (!token) {
      const authHeader = req.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        token = authHeader.slice(7);
      } else {
        token = req.headers.get("x-extension-token") || "";
      }
    }

    return await handleVerify(req, token);
  } catch (error: any) {
    console.error("[VerifyToken] Error:", error);
    return NextResponse.json(
      {
        success: false,
        valid: false,
        error: "Lỗi kiểm tra máy chủ. Vui lòng thử lại sau.",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  // Do not accept tokens in query strings (leak via logs, Referer, history).
  const token = req.headers.get("x-extension-token") || "";

  if (!token) {
    return NextResponse.json(
      {
        success: false,
        valid: false,
        error: "Gửi token qua header x-extension-token hoặc POST JSON { token }.",
      },
      { status: 400 }
    );
  }

  // FIX: forward ALL original headers (X-Forwarded-For, User-Agent, etc.)
  // so the IP rate limit and user-agent logging in handleVerify reflect the
  // actual caller. Previously the reconstructed Request carried only
  // Content-Type, so getClientIp() returned "unknown" for every GET and
  // all GET callers shared a single rate-limit bucket.
  const forwardedHeaders = new Headers(req.headers);
  forwardedHeaders.set("Content-Type", "application/json");

  const syntheticReq = new Request(req.url, {
    method: "POST",
    headers: forwardedHeaders,
    body: JSON.stringify({ token }),
  });

  return POST(syntheticReq);
}