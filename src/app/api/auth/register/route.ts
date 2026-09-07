import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import emailService from "@/utils/email/emailService";
import {
  createSuccessResponse,
  createErrorResponse,
  AUTH_ERROR_CODES,
  ERROR_CODE_TO_STATUS
} from "@/features/auth/types/apiResponse";

const JWT_SECRET = process.env.AUTH_SECRET!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function POST(req: Request) {
  try {
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      const response = createErrorResponse(
        AUTH_ERROR_CODES.VALIDATION_ERROR,
        "Dữ liệu yêu cầu không hợp lệ hoặc bị thiếu"
      );
      return NextResponse.json(response, {
        status: ERROR_CODE_TO_STATUS[AUTH_ERROR_CODES.VALIDATION_ERROR]
      });
    }
    const { email, password, name, callbackUrl } = body;

    // Validate required fields
    if (!email || !password) {
      const response = createErrorResponse(
        AUTH_ERROR_CODES.MISSING_REQUIRED_FIELDS,
        "Vui lòng nhập đầy đủ email và mật khẩu"
      );
      return NextResponse.json(response, {
        status: ERROR_CODE_TO_STATUS[AUTH_ERROR_CODES.MISSING_REQUIRED_FIELDS]
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      const response = createErrorResponse(
        AUTH_ERROR_CODES.VALIDATION_ERROR,
        "Vui lòng cung cấp địa chỉ email hợp lệ"
      );
      return NextResponse.json(response, {
        status: ERROR_CODE_TO_STATUS[AUTH_ERROR_CODES.VALIDATION_ERROR]
      });
    }

    // Validate password strength
    if (password.length < 8) {
      const response = createErrorResponse(
        AUTH_ERROR_CODES.WEAK_PASSWORD,
        "Mật khẩu phải có ít nhất 8 ký tự"
      );
      return NextResponse.json(response, {
        status: ERROR_CODE_TO_STATUS[AUTH_ERROR_CODES.WEAK_PASSWORD]
      });
    }

    // Check if user already exists
    const { prisma } = await import("@/lib/prisma");
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      const response = createErrorResponse(
        AUTH_ERROR_CODES.USER_EXISTS,
        "Tài khoản với email này đã tồn tại. Vui lòng đăng nhập."
      );
      return NextResponse.json(response, {
        status: ERROR_CODE_TO_STATUS[AUTH_ERROR_CODES.USER_EXISTS]
      });
    }

    // Check if the user has a valid pending invitation
    const pendingInvite = await prisma.invitation.findFirst({
      where: {
        email: { equals: email.toLowerCase().trim(), mode: "insensitive" },
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });

    if (!pendingInvite) {
      const response = createErrorResponse(
        AUTH_ERROR_CODES.UNAUTHORIZED,
        "Hệ thống chỉ mở cho thành viên được mời. Vui lòng liên hệ Admin để nhận thư mời."
      );
      return NextResponse.json(response, { status: 403 });
    }

    // Hash password
    const hash = await bcrypt.hash(password, 10);

    // Create verification token (preserving name and callbackUrl)
    const token = jwt.sign(
      {
        email,
        password: hash,
        name: name?.trim() || undefined,
        callbackUrl: callbackUrl || undefined
      },
      JWT_SECRET,
      { expiresIn: "30m" }
    );
    const verifyUrl = `${APP_URL}/api/auth/verify?token=${token}`;

    // Send verification email
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; background-color: #ffffff; border-radius: 16px; padding: 40px; border: 1px solid #e2e8f0;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; background: linear-gradient(135deg, #ec4899, #f43f5e); padding: 12px 24px; border-radius: 12px; color: #ffffff; font-weight: 900; font-size: 20px; letter-spacing: -0.5px;">
            TIKTOKFLOW
          </div>
        </div>
        <h2 style="text-align: center; margin-bottom: 12px; font-size: 22px; color: #0f172a; font-weight: 800;">Xác nhận địa chỉ email</h2>
        <p style="text-align: center; color: #64748b; margin-bottom: 28px; font-size: 15px; line-height: 1.6;">
          Chào mừng bạn đến với <strong>TIKTOKFLOW</strong>. Vui lòng nhấn vào nút bên dưới để xác thực tài khoản và hoàn tất đăng ký.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${verifyUrl}" style="
            background: linear-gradient(135deg, #ec4899, #f43f5e);
            color: #ffffff;
            padding: 14px 32px;
            text-decoration: none;
            border-radius: 10px;
            display: inline-block;
            font-weight: 700;
            font-size: 15px;
            box-shadow: 0 4px 12px rgba(236, 72, 153, 0.3);
          ">Xác Nhận Email</a>
        </div>
        <p style="text-align: center; color: #94a3b8; font-size: 13px; line-height: 1.5; margin-top: 32px; border-top: 1px solid #f1f5f9; pt: 20px;">
          Liên kết này sẽ hết hạn trong vòng <strong>30 phút</strong>.<br>
          Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.
        </p>
      </div>
    `;

    await emailService.sendNodemailerEmail(email, "Xác nhận địa chỉ email - TIKTOKFLOW", html);

    const response = createSuccessResponse(
      { email },
      "Đã gửi email xác thực. Vui lòng kiểm tra hộp thư của bạn."
    );
    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error("Error in registration:", error);

    const response = createErrorResponse(
      AUTH_ERROR_CODES.INTERNAL_ERROR,
      "Đã xảy ra lỗi trong quá trình đăng ký. Vui lòng thử lại."
    );
    return NextResponse.json(response, {
      status: ERROR_CODE_TO_STATUS[AUTH_ERROR_CODES.INTERNAL_ERROR]
    });
  }
}