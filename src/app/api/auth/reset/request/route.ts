import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
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
    const { email } = body;

    // Validate email
    if (!email) {
      const response = createErrorResponse(
        AUTH_ERROR_CODES.MISSING_REQUIRED_FIELDS,
        "Vui lòng nhập địa chỉ email"
      );
      return NextResponse.json(response, {
        status: ERROR_CODE_TO_STATUS[AUTH_ERROR_CODES.MISSING_REQUIRED_FIELDS]
      });
    }

    // Check if user exists (but always return success for security)
    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      // Only send email if user exists. Include password fingerprint for single-use invalidation.
      const pwdStamp = user.password ? user.password.slice(-12) : user.updatedAt.getTime().toString();
      const token = jwt.sign(
        { email, pwdStamp, typ: "pwd_reset" },
        JWT_SECRET,
        { expiresIn: "30m" }
      );
      const resetUrl = `${APP_URL}/auth/reset-password?token=${token}`;

      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; background-color: #ffffff; border-radius: 16px; padding: 40px; border: 1px solid #e2e8f0;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; background: linear-gradient(135deg, #ec4899, #f43f5e); padding: 12px 24px; border-radius: 12px; color: #ffffff; font-weight: 900; font-size: 20px; letter-spacing: -0.5px;">
              TIKTOKFLOW
            </div>
          </div>
          <h2 style="text-align: center; margin-bottom: 12px; font-size: 22px; color: #0f172a; font-weight: 800;">Khôi phục mật khẩu</h2>
          <p style="text-align: center; color: #64748b; margin-bottom: 28px; font-size: 15px; line-height: 1.6;">
            Chúng tôi đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Nhấn vào nút bên dưới để tiến hành tạo mật khẩu mới.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${resetUrl}" style="
              background: linear-gradient(135deg, #ec4899, #f43f5e);
              color: #ffffff;
              padding: 14px 32px;
              text-decoration: none;
              border-radius: 10px;
              display: inline-block;
              font-weight: 700;
              font-size: 15px;
              box-shadow: 0 4px 12px rgba(236, 72, 153, 0.3);
            ">Đặt Lại Mật Khẩu</a>
          </div>
          <p style="text-align: center; color: #94a3b8; font-size: 13px; line-height: 1.5; margin-top: 32px; border-top: 1px solid #f1f5f9; pt: 20px;">
            Liên kết này sẽ hết hạn trong <strong>30 phút</strong>.<br>
            Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng an tâm bỏ qua email này.
          </p>
        </div>
      `;

      try {
        await emailService.sendNodemailerEmail(email, "Khôi phục mật khẩu - TIKTOKFLOW", html);
      } catch (emailError) {
        console.error("Failed to send reset email:", emailError);
        // Don't expose email sending failures to prevent user enumeration
      }
    }

    // Always return success for security (don't reveal if email exists)
    const response = createSuccessResponse(
      undefined,
      "Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi đến bạn."
    );
    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error("Password reset request error:", error);

    // Still return success for security
    const response = createSuccessResponse(
      undefined,
      "Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi đến bạn."
    );
    return NextResponse.json(response, { status: 200 });
  }
}