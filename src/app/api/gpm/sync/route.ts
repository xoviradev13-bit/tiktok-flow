import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gpmClient } from "@/lib/gpm-api";
import { findTikTokHandleInProfile, detectTikTokAccountFromGpm } from "@/lib/tiktok-extractor";
import { auth } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const session = await auth();
    const actorName = session?.user?.name || session?.user?.email || "Hệ Thống";

    // Check GPMLogin connection first
    const health = await gpmClient.checkConnection();
    if (!health.isOnline) {
      return NextResponse.json(
        {
          success: false,
          error: "Không thể kết nối với phần mềm GPMLogin tại http://localhost:9495. Vui lòng đảm bảo GPMLogin đang mở.",
        },
        { status: 200 }
      );
    }

    const gpmResult = await gpmClient.listProfiles(1, 200);
    const profiles = gpmResult?.data || [];

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Không tìm thấy profile nào trong phần mềm GPMLogin.",
        totalScanned: 0,
        newImportedCount: 0,
        updatedCount: 0,
      });
    }

    let newCount = 0;
    let updatedCount = 0;

    for (const p of profiles) {
      const realHandle = findTikTokHandleInProfile(p.id);

      const existing = await prisma.tiktokAccount.findFirst({
        where: {
          OR: [
            { gpmProfileId: p.id },
            ...(realHandle ? [{ username: realHandle }] : []),
          ],
        },
        include: {
          assignedUser: {
            select: { id: true, role: true, name: true, username: true },
          },
        },
      });

      // Strictly ignore profiles that have never opened / logged into TikTok
      if (!realHandle && !existing) {
        continue;
      }

      const extractedUsername = realHandle || existing?.username || `profile_${p.id.slice(0, 8)}`;
      const currentUserId = session?.user?.id;
      const currentUserRole = session?.user?.role;

      if (!existing) {
        let country = "US";
        const lowerName = p.name.toLowerCase();
        const lowerGroup = (p.group_id || "").toLowerCase();
        if (lowerName.includes("uk") || lowerGroup.includes("uk")) country = "UK";
        else if (lowerName.includes("vn") || lowerGroup.includes("vn")) country = "VN";
        else if (lowerName.includes("de")) country = "DE";
        else if (lowerName.includes("fr")) country = "FR";

        // STAFF auto-assigns to themselves; ADMIN/LEAD imports as unassigned (null)
        const assignedUserId = currentUserRole === "STAFF" && currentUserId ? currentUserId : null;

        const newAccount = await prisma.tiktokAccount.create({
          data: {
            username: extractedUsername,
            country,
            groupName: p.group_id || "GPM Fleet",
            gpmProfileId: p.id,
            status: "ACTIVE",
            assignedUserId,
            totalViews: BigInt(0),
            totalFollowers: 0,
            totalVideos: 0,
            totalRevenue: 0,
            lastSyncedAt: new Date(),
          },
        });

        await prisma.accountLog.create({
          data: {
            accountId: newAccount.id,
            newStatus: "ACTIVE",
            logType: "STATUS_CHANGE",
            message: assignedUserId
              ? `Tự động đồng bộ & gán cho nhân sự ${actorName} từ GPMLogin Profile "${p.name}" (ID: ${p.id})`
              : `Tự động đồng bộ từ GPMLogin Profile "${p.name}" (ID: ${p.id})`,
            actorName,
          },
        });

        newCount++;
      } else {
        const updateData: any = {
          gpmProfileId: p.id,
          groupName: p.group_id || existing.groupName,
          lastSyncedAt: new Date(),
        };
        if (realHandle && existing.username !== realHandle) {
          updateData.username = realHandle;
        }

        let reassignedLogMsg: string | null = null;

        // Smart Auto-Claim Logic:
        // If a STAFF member syncs an unassigned account or one previously assigned to Admin/Lead, claim it.
        // If assigned to another STAFF member, protected — do not steal.
        if (currentUserRole === "STAFF" && currentUserId) {
          if (!existing.assignedUserId) {
            updateData.assignedUserId = currentUserId;
            reassignedLogMsg = `Nhân sự ${actorName} tự động nhận tài khoản từ GPMLogin`;
          } else if (
            existing.assignedUserId !== currentUserId &&
            (existing.assignedUser?.role === "ADMIN" || existing.assignedUser?.role === "LEAD")
          ) {
            updateData.assignedUserId = currentUserId;
            reassignedLogMsg = `Tự động chuyển giao quyền quản trị từ ${existing.assignedUser?.name || existing.assignedUser?.username || "Admin"} sang ${actorName}`;
          }
        }

        await prisma.tiktokAccount.update({
          where: { id: existing.id },
          data: updateData,
        });

        if (reassignedLogMsg) {
          await prisma.accountLog.create({
            data: {
              accountId: existing.id,
              newStatus: existing.status,
              logType: "STATUS_CHANGE",
              message: reassignedLogMsg,
              actorName,
            },
          });
        }

        updatedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Đã đồng bộ ${profiles.length} profile từ GPMLogin (Mới: ${newCount}, Cập nhật: ${updatedCount})`,
      totalScanned: profiles.length,
      newImportedCount: newCount,
      updatedCount,
    });
  } catch (err: any) {
    console.error("[/api/gpm/sync] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Lỗi xử lý đồng bộ GPMLogin" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return POST(req);
}
