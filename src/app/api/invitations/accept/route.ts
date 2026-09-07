import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json(
        { message: "Vui lòng đăng nhập để chấp nhận lời mời." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { token } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { message: "Mã lời mời không hợp lệ hoặc bị thiếu." },
        { status: 400 }
      );
    }

    const invitation = await prisma.invitation.findUnique({
      where: { token: token.trim() },
      include: {
        group: true,
        invitedBy: true,
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { message: "Không tìm thấy lời mời hoặc liên kết không tồn tại." },
        { status: 404 }
      );
    }

    if (invitation.status !== "PENDING") {
      return NextResponse.json(
        {
          message:
            invitation.status === "ACCEPTED"
              ? "Lời mời này đã được chấp nhận trước đó."
              : "Lời mời này đã bị hủy bỏ.",
        },
        { status: 400 }
      );
    }

    if (new Date(invitation.expiresAt) < new Date()) {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json(
        { message: "Lời mời này đã hết hạn. Vui lòng yêu cầu Admin gửi lại lời mời." },
        { status: 400 }
      );
    }

    const currentEmail = session.user.email.toLowerCase().trim();
    const targetEmail = invitation.email.toLowerCase().trim();

    if (currentEmail !== targetEmail) {
      return NextResponse.json(
        {
          message: `This invitation was sent for ${targetEmail}, but you are currently logged in with ${currentEmail}.`,
        },
        { status: 403 }
      );
    }

    // Assign role, group, and activate user
    const updatedUser = await prisma.user.update({
      where: { email: currentEmail },
      data: {
        role: invitation.role,
        groupId: invitation.groupId || undefined,
        isActive: true,
        isVerified: true,
      },
    });

    // Mark invitation as ACCEPTED
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Chấp nhận lời mời thành công!",
        role: invitation.role,
        groupName: invitation.group?.name || null,
        workspaceId: invitation.groupId,
        targetType: "workspace",
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[AcceptInvitation Error]:", error);
    return NextResponse.json(
      { message: error?.message || "Đã xảy ra lỗi khi chấp nhận lời mời." },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { message: "Thiếu mã xác thực lời mời." },
        { status: 400 }
      );
    }

    const invitation = await prisma.invitation.findUnique({
      where: { token: token.trim() },
      include: {
        group: true,
        invitedBy: {
          select: { name: true, username: true, email: true },
        },
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { message: "Không tìm thấy lời mời hoặc liên kết không tồn tại." },
        { status: 404 }
      );
    }

    const isExpired = new Date(invitation.expiresAt) < new Date();

    return NextResponse.json({
      email: invitation.email,
      role: invitation.role,
      groupName: invitation.group?.name || null,
      inviterName: invitation.invitedBy.name || invitation.invitedBy.username || "Quản trị viên",
      status: isExpired ? "EXPIRED" : invitation.status,
      expiresAt: invitation.expiresAt,
    });
  } catch (error: any) {
    console.error("[GetInvitationDetails Error]:", error);
    return NextResponse.json(
      { message: error?.message || "Lỗi khi lấy thông tin lời mời." },
      { status: 500 }
    );
  }
}

