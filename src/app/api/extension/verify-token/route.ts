import { NextResponse } from "next/server";
import {
  checkRateLimit,
  findUserByPersonalToken,
  getClientIp,
} from "@/lib/extension-auth";

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req) || "unknown";
    const ipLimit = checkRateLimit(`verify-token:ip:${ip}`, 60);
    if (!ipLimit.ok) {
      return NextResponse.json(
        { success: false, valid: false, error: "Quá nhiều yêu cầu. Thử lại sau." },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } }
      );
    }

    let token = "";

    // 1. Check body first
    try {
      const body = await req.json();
      token = body?.token?.trim() || "";
    } catch {
      // Body might be empty or invalid json
    }

    // 2. Fallback to headers
    if (!token) {
      const authHeader = req.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        token = authHeader.slice(7).trim();
      } else {
        token = req.headers.get("x-extension-token")?.trim() || "";
      }
    }

    // 3. Format Validation (Must match ttf_sec_ format)
    if (!token) {
      return NextResponse.json(
        {
          success: false,
          valid: false,
          error: "Vui lòng cung cấp mã Personal Token cần kiểm tra.",
        },
        { status: 400 }
      );
    }

    if (!/^ttf_sec_[a-f0-9]{16,64}$/i.test(token)) {
      return NextResponse.json(
        {
          success: false,
          valid: false,
          error: "Định dạng Token không hợp lệ. Mã hợp lệ phải bắt đầu bằng 'ttf_sec_'.",
        },
        { status: 400 }
      );
    }

    const tokenLimit = checkRateLimit(`verify-token:tok:${token.slice(0, 20)}`, 30);
    if (!tokenLimit.ok) {
      return NextResponse.json(
        { success: false, valid: false, error: "Quá nhiều yêu cầu. Thử lại sau." },
        { status: 429, headers: { "Retry-After": String(tokenLimit.retryAfterSec) } }
      );
    }

    // 4. Database Lookup (supports sealed-at-rest tokens)
    const user = await findUserByPersonalToken(token);

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
          error: "Quyền sử dụng Extension của tài khoản này đã bị Quản trị viên vô hiệu hóa.",
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
  const token = req.headers.get("x-extension-token")?.trim() || "";

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

  return POST(
    new Request(req.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
  );
}
