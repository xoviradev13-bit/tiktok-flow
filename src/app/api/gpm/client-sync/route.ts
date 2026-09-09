import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchTikTokPublicProfileHttp } from "@/lib/tiktok-extractor";
import { pMap } from "@/lib/concurrency";

export interface ClientProfilePayload {
  id: string;
  name: string;
  raw_name?: string;
  group_id?: string;
  tiktokHandle?: string | null;
}

/**
 * GET /api/gpm/client-sync
 * Allows zero-dependency client daemons to poll their active sync schedule
 */
export async function GET() {
  try {
    const configRecord = await prisma.systemConfig.findUnique({
      where: { key: "sync_schedule" },
    });

    if (!configRecord) {
      return NextResponse.json({
        autoEnabled: true,
        intervalMinutes: 30,
        nextFixedTimestamp: null,
        scheduleSummary: "Mỗi 30 phút",
        mode: "AUTO",
      });
    }

    let parsed: any = {};
    try {
      parsed = JSON.parse(configRecord.value);
    } catch { }

    const isAutoOn = parsed?.autoEnabled ?? (parsed?.mode === "AUTO");
    let intervalMinutes: number | null = null;
    let nextFixedTimestamp: number | null = null;
    let scheduleSummary = "Chưa thiết lập";

    const now = new Date();

    if (Array.isArray(parsed?.schedules) && parsed.schedules.length > 0) {
      const activeSchedules = parsed.schedules.filter((s: any) => s.enabled);
      if (activeSchedules.length > 0) {
        const summaries: string[] = [];

        for (const s of activeSchedules) {
          if (s.repeat === "EVERY_15_MIN") {
            intervalMinutes = intervalMinutes ? Math.min(intervalMinutes, 15) : 15;
            summaries.push("Mỗi 15 phút");
          } else if (s.repeat === "EVERY_30_MIN") {
            intervalMinutes = intervalMinutes ? Math.min(intervalMinutes, 30) : 30;
            summaries.push("Mỗi 30 phút");
          } else if (s.repeat === "HOURLY") {
            const h = s.everyCount || 1;
            intervalMinutes = intervalMinutes ? Math.min(intervalMinutes, 60 * h) : 60 * h;
            summaries.push(`Mỗi ${h} giờ`);
          } else if (s.repeat === "CUSTOM" && s.intervalMinutes) {
            const m = Number(s.intervalMinutes);
            intervalMinutes = intervalMinutes ? Math.min(intervalMinutes, m) : m;
            summaries.push(`Mỗi ${m} phút`);
          } else if (s.repeat === "DAILY" || s.repeat === "WEEKLY" || s.repeat === "ONCE") {
            const timeStr = s.timeOfDay || "17:00";
            const [targetH, targetM] = timeStr.split(":").map(Number);
            const targetDate = new Date(now);
            targetDate.setHours(targetH || 0, targetM || 0, 0, 0);

            const lastRun = s.lastRunAt ? new Date(s.lastRunAt) : null;
            const alreadyRanToday = lastRun && lastRun.toDateString() === now.toDateString();
            const currentTotalMin = now.getHours() * 60 + now.getMinutes();
            const targetTotalMin = (targetH || 0) * 60 + (targetM || 0);

            if (s.repeat === "ONCE" && s.startDate) {
              const [y, m, d] = s.startDate.split("-").map(Number);
              targetDate.setFullYear(y, m - 1, d);
              if (targetDate.getTime() > now.getTime()) {
                nextFixedTimestamp = targetDate.getTime();
              }
            } else if (!alreadyRanToday && currentTotalMin >= targetTotalMin) {
              // MISSED TODAY (e.g. computer was off at 17:00, turned on at 18:30)
              // Trigger immediate Catch-Up sync in 10 seconds!
              nextFixedTimestamp = now.getTime() + 10 * 1000;
            } else if (targetDate.getTime() <= now.getTime()) {
              targetDate.setDate(targetDate.getDate() + 1);
              nextFixedTimestamp = targetDate.getTime();
            } else {
              nextFixedTimestamp = targetDate.getTime();
            }

            summaries.push(
              s.repeat === "ONCE"
                ? `Lúc ${timeStr} ngày ${s.startDate || ""}`
                : `Hàng ngày lúc ${timeStr}`
            );
          }
        }

        if (summaries.length > 0) {
          scheduleSummary = summaries.join(", ");
        }
      }
    } else if (parsed?.repeat) {
      if (parsed.repeat === "EVERY_15_MIN") {
        intervalMinutes = 15;
        scheduleSummary = "Mỗi 15 phút";
      } else if (parsed.repeat === "EVERY_30_MIN") {
        intervalMinutes = 30;
        scheduleSummary = "Mỗi 30 phút";
      } else if (parsed.repeat === "HOURLY") {
        intervalMinutes = 60 * (parsed.everyCount || 1);
        scheduleSummary = `Mỗi ${parsed.everyCount || 1} giờ`;
      } else if (parsed.repeat === "CUSTOM" && parsed.intervalMinutes) {
        intervalMinutes = Number(parsed.intervalMinutes);
        scheduleSummary = `Mỗi ${intervalMinutes} phút`;
      } else if (parsed.repeat === "DAILY") {
        const timeStr = parsed.timeOfDay || "17:00";
        const [targetH, targetM] = timeStr.split(":").map(Number);
        const targetDate = new Date(now);
        targetDate.setHours(targetH || 0, targetM || 0, 0, 0);
        if (targetDate.getTime() <= now.getTime()) {
          targetDate.setDate(targetDate.getDate() + 1);
        }
        nextFixedTimestamp = targetDate.getTime();
        scheduleSummary = `Hàng ngày lúc ${timeStr}`;
      }
    }

    if (!intervalMinutes && !nextFixedTimestamp) {
      intervalMinutes = 30;
      scheduleSummary = "Mỗi 30 phút";
    }

    // Read Sweeper Schedule configured in /settings
    const sweeperRecord = await prisma.systemConfig.findUnique({
      where: { key: "tiktok_sweeper_schedule" },
    });
    let sweeperSchedule: any = {
      autoEnabled: true,
      schedules: [
        { id: "def_1", enabled: true, repeat: "DAILY", timeOfDay: "18:00" },
      ],
    };
    if (sweeperRecord) {
      try {
        sweeperSchedule = JSON.parse(sweeperRecord.value);
      } catch { }
    }

    return NextResponse.json({
      autoEnabled: isAutoOn,
      intervalMinutes,
      nextFixedTimestamp,
      scheduleSummary,
      mode: isAutoOn ? "AUTO" : "MANUAL",
      rawSchedule: parsed,
      sweeperSchedule,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/gpm/client-sync
 * Secure endpoint called by lightweight client daemons on member machines
 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

    const body = await req.json();
    const { userEmail, personalToken: bodyToken, profiles } = body as {
      userEmail?: string;
      personalToken?: string;
      profiles?: ClientProfilePayload[];
    };

    const token = (bearerToken || bodyToken)?.trim();

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Yêu cầu cung cấp personalToken hợp lệ để đồng bộ." },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { extensionToken: token },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Mã xác thực personalToken không hợp lệ hoặc đã bị thu hồi." },
        { status: 401 }
      );
    }

    if (userEmail && typeof userEmail === "string") {
      const trimmedEmail = userEmail.trim().toLowerCase();
      const userMailLower = user.email?.toLowerCase();
      const userNameLower = user.username?.toLowerCase();
      if (userMailLower !== trimmedEmail && userNameLower !== trimmedEmail) {
        return NextResponse.json(
          { success: false, error: "Thông tin email/username không khớp với chủ sở hữu personalToken." },
          { status: 403 }
        );
      }
    }

    if (!user.isActive || user.extensionAccessEnabled === false) {
      return NextResponse.json(
        {
          success: false,
          error: "Quyền truy cập của tài khoản đã bị vô hiệu hóa hoặc bị khóa bởi Quản trị viên.",
        },
        { status: 403 }
      );
    }

    if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No profiles sent by client.",
        totalScanned: 0,
        newImportedCount: 0,
        updatedCount: 0,
      });
    }

    const actorName = user.name || user.email || user.username || "Client Worker";
    const currentUserId = user.id;
    const currentUserRole = user.role;

    let newCount = 0;
    let updatedCount = 0;

    await pMap(
      profiles,
      async (p) => {
        const realHandle = p.tiktokHandle || null;

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

        // Skip profiles with no TikTok account linked
        if (!realHandle && !existing) {
          return;
        }

        const extractedUsername = realHandle || existing?.username || `profile_${p.id.slice(0, 8)}`;

        let country = "US";
        const lowerName = (p.name || "").toLowerCase();
        const lowerGroup = (p.group_id || "").toLowerCase();
        if (lowerName.includes("uk") || lowerGroup.includes("uk")) country = "UK";
        else if (lowerName.includes("vn") || lowerGroup.includes("vn")) country = "VN";
        else if (lowerName.includes("de")) country = "DE";
        else if (lowerName.includes("fr")) country = "FR";

        // Query live public TikTok metrics (followers, videos)
        const publicMetrics = await fetchTikTokPublicProfileHttp(extractedUsername).catch(() => null);

        // 1. INSERT IF NEW
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
                totalFollowers: publicMetrics?.followersCount || 0,
                totalVideos: publicMetrics?.videoCount || 0,
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

        if (publicMetrics) {
          updateData.totalFollowers = publicMetrics.followersCount;
          updateData.totalVideos = publicMetrics.videoCount;
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
          updatedCount++;
        } else {
          // Fallback: update stats only without stealing ownership
          await prisma.tiktokAccount.update({
            where: { id: existing.id },
            data: {
              gpmProfileId: p.id,
              groupName: p.group_id || existing.groupName,
              lastSyncedAt: new Date(),
            },
          });
          updatedCount++;
        }
      },
      6
    );

    // Update lastRunAt in central sync_schedule to prevent duplicate run
    try {
      const configRecord = await prisma.systemConfig.findUnique({
        where: { key: "sync_schedule" },
      });
      if (configRecord && configRecord.value) {
        const parsed = JSON.parse(configRecord.value);
        const nowIso = new Date().toISOString();
        if (Array.isArray(parsed.schedules)) {
          parsed.schedules = parsed.schedules.map((s: any) => ({
            ...s,
            lastRunAt: nowIso,
          }));
        }
        parsed.lastRunAt = nowIso;
        await prisma.systemConfig.update({
          where: { key: "sync_schedule" },
          data: { value: JSON.stringify(parsed) },
        });
      }
    } catch (e) { }

    return NextResponse.json({
      success: true,
      message: `Đồng bộ hoàn tất cho ${actorName}: ${newCount} tạo mới, ${updatedCount} cập nhật.`,
      totalScanned: profiles.length,
      newImportedCount: newCount,
      updatedCount,
    });
  } catch (error: any) {
    console.error("[ClientSync API Error]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
