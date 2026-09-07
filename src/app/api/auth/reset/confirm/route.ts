import { NextResponse } from "next/server";
import jwt, { TokenExpiredError } from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  createSuccessResponse,
  createErrorResponse,
  AUTH_ERROR_CODES,
  ERROR_CODE_TO_STATUS
} from "@/features/auth/types/apiResponse";

const JWT_SECRET = process.env.AUTH_SECRET!;

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
    const { token, newPassword } = body;

    // Validate required fields
    if (!token || !newPassword) {
      const response = createErrorResponse(
        AUTH_ERROR_CODES.MISSING_REQUIRED_FIELDS,
        "Vui lòng cung cấp mã token và mật khẩu mới"
      );
      return NextResponse.json(response, {
        status: ERROR_CODE_TO_STATUS[AUTH_ERROR_CODES.MISSING_REQUIRED_FIELDS]
      });
    }

    // Validate password strength
    if (newPassword.length < 8) {
      const response = createErrorResponse(
        AUTH_ERROR_CODES.WEAK_PASSWORD,
        "Mật khẩu phải có ít nhất 8 ký tự"
      );
      return NextResponse.json(response, {
        status: ERROR_CODE_TO_STATUS[AUTH_ERROR_CODES.WEAK_PASSWORD]
      });
    }

    // Verify token
    let decoded: { email: string };
    try {
      decoded = jwt.verify(token, JWT_SECRET) as { email: string };
    } catch (jwtError) {
      if (jwtError instanceof TokenExpiredError) {
        const response = createErrorResponse(
          AUTH_ERROR_CODES.TOKEN_EXPIRED,
          "Liên kết đặt lại mật khẩu đã hết hạn. Vui lòng yêu cầu liên kết mới."
        );
        return NextResponse.json(response, {
          status: ERROR_CODE_TO_STATUS[AUTH_ERROR_CODES.TOKEN_EXPIRED]
        });
      }

      const response = createErrorResponse(
        AUTH_ERROR_CODES.TOKEN_INVALID,
        "Liên kết đặt lại mật khẩu không hợp lệ. Vui lòng yêu cầu liên kết mới."
      );
      return NextResponse.json(response, {
        status: ERROR_CODE_TO_STATUS[AUTH_ERROR_CODES.TOKEN_INVALID]
      });
    }

    const { email } = decoded;

    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const response = createErrorResponse(
        AUTH_ERROR_CODES.USER_NOT_FOUND,
        "Không thể đặt lại mật khẩu. Vui lòng thử lại."
      );
      return NextResponse.json(response, {
        status: ERROR_CODE_TO_STATUS[AUTH_ERROR_CODES.USER_NOT_FOUND]
      });
    }

    // Hash new password and update
    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { email },
      data: { password: hash },
    });

    const response = createSuccessResponse(
      undefined,
      "Cập nhật mật khẩu thành công. Bây giờ bạn có thể đăng nhập bằng mật khẩu mới."
    );
    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error("Password reset confirm error:", error);

    const response = createErrorResponse(
      AUTH_ERROR_CODES.INTERNAL_ERROR,
      "Đã xảy ra lỗi khi đặt lại mật khẩu. Vui lòng thử lại."
    );
    return NextResponse.json(response, {
      status: ERROR_CODE_TO_STATUS[AUTH_ERROR_CODES.INTERNAL_ERROR]
    });
  }
}