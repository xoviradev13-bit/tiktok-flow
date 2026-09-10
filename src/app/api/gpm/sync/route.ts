import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gpmClient } from "@/lib/gpm-api";
import { findTikTokHandleInProfile, detectTikTokAccountFromGpm } from "@/lib/tiktok-extractor";
import { auth } from "@/lib/auth";
import { pMap } from "@/lib/concurrency";

export async function POST(req: Request) {
  try {
    const session = await auth();
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const isCronAuthorized = cronSecret && authHeader === `Bearer ${cronSecret}`;

    if (!session?.user?.id && !isCronAuthorized) {
      return NextResponse.json(
        { success: false, error: "Yêu cầu đăng nhập để đồng bộ profile GPMLogin." },
        { status: 401 }
      );
    }

    const actorName = session?.user?.name || session?.user?.email || "Hệ Thống";

    // Check GPMLogin connection first
    const health = await gpmClient.checkConnection();
    if (!health.isOnline) {
      return NextResponse.json(
        {
          success: false,
          error: "Không thể kết nối với phần mềm GPMLogin (đã dò cổng 9495/19995/19996…). Vui lòng đảm bảo GPMLogin đang mở và bật API Setting.",
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

    await pMap(
      profiles,
      async (p) => {
        const realHandle = findTikTokHandleInProfile(p.id);

        let existing = await prisma.tiktokAccount.findFirst({
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
          return;
        }

        const extractedUsername = realHandle || existing?.username || `profile_${p.id.slice(0, 8)}`;
        const currentUserId = session?.user?.id;
        const currentUserRole = session?.user?.role;

        let country = "US";
        const lowerName = p.name.toLowerCase();
        const lowerGroup = (p.group_id || "").toLowerCase();
        if (lowerName.includes("uk") || lowerGroup.includes("uk")) country = "UK";
        else if (lowerName.includes("vn") || lowerGroup.includes("vn")) country = "VN";
        else if (lowerName.includes("de")) country = "DE";
        else if (lowerName.includes("fr")) country = "FR";

        // 1. ATTEMPT INSERT IF NEW
        if (!existing) {
          try {
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
            return;
          } catch (err: any) {
            if (err?.code === "P2002") {
              existing = await prisma.tiktokAccount.findUnique({
                where: { username: extractedUsername },
                include: {
                  assignedUser: {
                    select: { id: true, role: true, name: true, username: true },
                  },
                },
              });
              if (!existing) throw err;
            } else {
              throw err;
            }
          }
        }

        // 2. ATOMIC CLAIM OR STATS UPDATE
        const claimWhereCondition: any = {
          id: existing.id,
          ...(currentUserRole === "STAFF"
            ? { assignedUserId: null }
            : {}
          ),
        };

        const updateData: any = {
          gpmProfileId: p.id,
          groupName: p.group_id || existing.groupName,
          lastSyncedAt: new Date(),
        };

        if (realHandle && existing.username !== realHandle) {
          updateData.username = realHandle;
        }

        if (currentUserRole === "STAFF" && !existing.assignedUserId && currentUserId) {
          updateData.assignedUserId = currentUserId;
        } else if ((currentUserRole === "ADMIN" || currentUserRole === "LEAD") && currentUserId) {
          updateData.assignedUserId = currentUserId;
        }

        const claimResult = await prisma.tiktokAccount.updateMany({
          where: claimWhereCondition,
          data: updateData,
        });

        if (claimResult.count > 0) {
          updatedCount++;
          const newlyAssigned = !existing.assignedUserId && updateData.assignedUserId;
          const overridden = existing.assignedUserId && existing.assignedUserId !== updateData.assignedUserId;

          if (newlyAssigned || overridden) {
            await prisma.accountLog.create({
              data: {
                accountId: existing.id,
                newStatus: existing.status,
                logType: "STATUS_CHANGE",
                message: overridden
                  ? `[ADMIN OVERRIDE] Quản trị viên ${actorName} đã ghi đè quyền sở hữu tài khoản từ ${existing.assignedUser?.name || "thành viên khác"}.`
                  : `Tự động gán quyền sở hữu cho nhân sự ${actorName} khi phát hiện profile cục bộ.`,
                actorName,
              },
            });
          }
        } else {
          // Claim blocked: Account is owned by another staff member.
          // Run explicit STATS-ONLY update without touching assignedUserId or GPM profile mapping:
          const statsUpdate: any = { lastSyncedAt: new Date() };
          if (realHandle && existing.username !== realHandle) {
            statsUpdate.username = realHandle;
          }
          await prisma.tiktokAccount.update({
            where: { id: existing.id },
            data: statsUpdate,
          });
          updatedCount++;
        }
      },
      6
    );

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
