import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gpmClient } from "@/lib/gpm-api";
import { isWeakCountryName, detectCountryFromText } from "@/lib/country-name";
import { auth } from "@/lib/auth";
import { pMap } from "@/lib/concurrency";
import os from "os";

async function resolveAuthUser(req: Request) {
  let session: any = null;
  try {
    session = await auth();
  } catch {
    session = null;
  }
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  let user = session?.user;
  if (!user?.id && authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (cronSecret && token === cronSecret) {
      user = { id: "cron", name: "Hệ Thống", role: "ADMIN" } as any;
    } else {
      const { resolveExtensionBearerAuth } = await import("@/lib/extension-auth");
      const bearerAuth = await resolveExtensionBearerAuth(token, "/api/gpm/sync");
      if (bearerAuth.ok) {
        user = bearerAuth.user as any;
      }
    }
  }
  return user;
}

async function getActiveSyncJobForUser(userId: string) {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const twentyFiveMinutesAgo = new Date(Date.now() - 25 * 60 * 1000);

  // 1. Auto-expire stale PENDING jobs older than 5 minutes (no agent online to pick it up)
  await prisma.syncQueue.updateMany({
    where: {
      requestedById: userId,
      status: "PENDING",
      requestedAt: { lt: fiveMinutesAgo },
    },
    data: {
      status: "TIMED_OUT",
      errorMessage: "Không có Client Agent nào tiếp nhận sau 5 phút - Đã tự động hủy bỏ",
      completedAt: new Date(),
    },
  });

  // 2. Auto-expire hung PROCESSING jobs older than 25 minutes (agent crashed)
  await prisma.syncQueue.updateMany({
    where: {
      requestedById: userId,
      status: "PROCESSING",
      startedAt: { lt: twentyFiveMinutesAgo },
    },
    data: {
      status: "TIMED_OUT",
      errorMessage: "Tiến trình quét bị gián đoạn (quá 25 phút) - Đã tự động hủy bỏ",
      completedAt: new Date(),
    },
  });

  const activeJob = await prisma.syncQueue.findFirst({
    where: {
      status: { in: ["PENDING", "PROCESSING"] },
      OR: [
        { requestedById: userId },
        { targetScope: userId },
        { targetScope: { contains: userId } },
        { targetScope: "ALL" },
      ],
    },
    orderBy: { requestedAt: "desc" },
    include: {
      requestedBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  return activeJob;
}

export async function POST(req: Request) {
  let createdJobId: string | null = null;
  try {
    const user = await resolveAuthUser(req);

    if (!user?.id) {
      return NextResponse.json(
        { success: false, error: "Yêu cầu đăng nhập để đồng bộ profile GPMLogin." },
        { status: 401 }
      );
    }

    let dbUser = null;
    if (user?.id && user.id !== "cron" && user.id !== "system") {
      dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, role: true, name: true, username: true },
      });
    }
    const currentUserId = dbUser?.id || user.id;
    const currentUserRole = dbUser?.role || user.role;
    const actorName = user?.name || user?.email || "Hệ Thống";

    const body = await req.json().catch(() => ({}));

    // Action: STOP SYNC
    if (body.action === "stop" || body.cancel === true) {
      const isLeadOrAdmin = currentUserRole === "ADMIN" || currentUserRole === "LEAD";
      const whereClause: any = {
        status: { in: ["PENDING", "PROCESSING"] },
      };
      if (!isLeadOrAdmin) {
        whereClause.OR = [
          { requestedById: currentUserId },
          { targetScope: currentUserId },
          { targetScope: { contains: currentUserId } },
        ];
      }
      const updated = await prisma.syncQueue.updateMany({
        where: whereClause,
        data: {
          status: "CANCELLED",
          completedAt: new Date(),
          errorMessage: `Tiến trình đã được dừng bởi ${actorName}`,
        },
      });
      return NextResponse.json({
        success: true,
        message: `Đã gửi lệnh dừng đồng bộ (${updated.count} tác vụ bị hủy).`,
      });
    }

    const isLeadOrAdmin = currentUserRole === "ADMIN" || currentUserRole === "LEAD";

    if (isLeadOrAdmin) {
      // Broadcast mode for Admin / Lead: Enqueue for all active staff users with Client-Agent
      const activeUsers = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      });

      let queuedCount = 0;
      let primaryJobId = "";

      for (const u of activeUsers) {
        const existing = await prisma.syncQueue.findFirst({
          where: {
            status: { in: ["PENDING", "PROCESSING"] },
            OR: [
              { targetScope: u.id },
              { targetScope: { contains: u.id } },
            ],
          },
        });
        if (!existing) {
          const job = await prisma.syncQueue.create({
            data: {
              requestedById: currentUserId,
              status: "PENDING",
              targetScope: `USER:${u.id}`,
              requestedAt: new Date(),
            },
          });
          queuedCount++;
          if (u.id === currentUserId || !primaryJobId) primaryJobId = job.id;
        } else if (!primaryJobId) {
          primaryJobId = existing.id;
        }
      }

      return NextResponse.json({
        success: true,
        isRemoteSignal: true,
        jobId: primaryJobId || undefined,
        message: `Đã đưa lệnh đồng bộ vào hàng đợi cho ${queuedCount || activeUsers.length} nhân sự/máy trạm. Client Agent sẽ tự động quét!`,
      });
    }

    // Staff mode: Check anti-spam and enqueue only for current user
    const existingActiveJob = await getActiveSyncJobForUser(currentUserId);
    if (existingActiveJob) {
      return NextResponse.json({
        success: false,
        inProgress: true,
        activeJob: {
          id: existingActiveJob.id,
          status: existingActiveJob.status,
          requestedAt: existingActiveJob.requestedAt,
          machineName: existingActiveJob.machineName,
        },
        message: `Tiến trình đồng bộ của bạn đang được xử lý (${existingActiveJob.status === "PROCESSING" ? "Agent đang quét" : "Đang chờ Agent nhận"}). Vui lòng chờ hoàn tất!`,
      });
    }

    // Enqueue New Sync Job in SyncQueue scoped to current user
    const syncJob = await prisma.syncQueue.create({
      data: {
        requestedById: currentUserId,
        status: "PENDING",
        targetScope: `USER:${currentUserId}`,
        requestedAt: new Date(),
      },
    });
    createdJobId = syncJob.id;

    return NextResponse.json({
      success: true,
      isRemoteSignal: true,
      jobId: syncJob.id,
      message: "Đã đưa lệnh vào hàng đợi đồng bộ. Client Agent trên máy tính sẽ tự động nhận và bắt đầu quét ngay!",
    });

    // Direct Local Mode (only if explicitly requested via ?direct=1):
    const health = await gpmClient.checkConnection();
    if (!health.isOnline) {
      return NextResponse.json({
        success: true,
        isRemoteSignal: true,
        jobId: syncJob.id,
        message: "Đã đưa lệnh vào hàng đợi đồng bộ. Client Agent trên máy tính cá nhân sẽ tự động nhận và bắt đầu quét ngay!",
      });
    }

    // Local Mode: GPM is running on this same machine
    await prisma.syncQueue.update({
      where: { id: syncJob.id },
      data: {
        status: "PROCESSING",
        startedAt: new Date(),
        machineName: os.hostname(),
      },
    });

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
        const handleMatch = (p.name || "").match(/@([a-zA-Z0-9_.]+)/);
        const realHandle = handleMatch ? handleMatch[1] : null;

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

        // Filter profiles that relate to TikTok
        const lowerName = (p.name || "").toLowerCase();
        const lowerGroup = (p.group_id || "").toLowerCase();
        const isTikTok = Boolean(realHandle || existing || lowerName.includes("tiktok") || lowerGroup.includes("tiktok"));
        if (!isTikTok) {
          return;
        }

        const extractedUsername = realHandle || existing?.username || `profile_${p.id.slice(0, 8)}`;

        const detectedCountry = detectCountryFromText(p.name) || detectCountryFromText(p.group_id);
        const resolvedCountry = detectedCountry || "US";

        const isOnline = existing?.isOnline || false;

        // 1. ATTEMPT INSERT IF NEW
        if (!existing) {
          try {
            const assignedUserId = currentUserRole === "STAFF" && currentUserId ? currentUserId : null;
            const { gpmClient } = await import("@/lib/gpm-api");
            const gpmGroupName = await gpmClient.resolveGroupName(p.group_id);
            const newAccount = await prisma.tiktokAccount.create({
              data: {
                username: extractedUsername,
                country: resolvedCountry || "Unknown",
                isOnline,
                gpmProfileName: p.name || null,
                groupName: gpmGroupName,
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
          ...(currentUserRole === "STAFF" && currentUserId
            ? { assignedUserId: null }
            : {}
          ),
        };

        const { gpmClient } = await import("@/lib/gpm-api");
        const gpmGroupName = await gpmClient.resolveGroupName(p.group_id);
        const updateData: any = {
          gpmProfileId: p.id,
          gpmProfileName: p.name || existing.gpmProfileName || null,
          groupName:
            gpmGroupName ??
            (existing.groupName && !/^Profile\s+/i.test(existing.groupName)
              ? existing.groupName
              : null),
          lastSyncedAt: new Date(),
        };

        if (resolvedCountry && (!existing.country || isWeakCountryName(existing.country))) {
          updateData.country = resolvedCountry;
        }

        if (isOnline && !existing.isOnline) {
          updateData.isOnline = true;
        }

        if (realHandle && existing.username !== realHandle) {
          updateData.username = realHandle;
        }

        if (currentUserRole === "STAFF" && !existing.assignedUserId && currentUserId) {
          updateData.assignedUserId = currentUserId;
        } else if ((currentUserRole === "ADMIN" || currentUserRole === "LEAD") && currentUserId && !existing.assignedUserId) {
          updateData.assignedUserId = currentUserId;
        }

        const claimResult = await prisma.tiktokAccount.updateMany({
          where: claimWhereCondition,
          data: updateData,
        });

        if (claimResult.count > 0) {
          updatedCount++;
          const newlyAssigned = !existing.assignedUserId && updateData.assignedUserId;
          const overridden = existing.assignedUserId && updateData.assignedUserId && existing.assignedUserId !== updateData.assignedUserId;

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
          if (resolvedCountry && (!existing.country || isWeakCountryName(existing.country))) {
            statsUpdate.country = resolvedCountry;
          }
          if (isOnline && !existing.isOnline) {
            statsUpdate.isOnline = true;
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

    // Update lastRunAt in central sync_schedule
    try {
      const nowIso = new Date().toISOString();
      const configRecord = await prisma.systemConfig.findUnique({
        where: { key: "sync_schedule" },
      });
      const rawStr = configRecord?.value;
      if (rawStr) {
        const parsed = JSON.parse(rawStr as string);
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
      } else {
        await prisma.systemConfig.upsert({
          where: { key: "sync_schedule" },
          create: {
            key: "sync_schedule",
            value: JSON.stringify({
              autoEnabled: true,
              mode: "AUTO",
              lastRunAt: nowIso,
              schedules: [{ repeat: "DAILY", timeOfDay: "18:00", enabled: true, lastRunAt: nowIso }],
            }),
          },
          update: {
            value: JSON.stringify({
              autoEnabled: true,
              mode: "AUTO",
              lastRunAt: nowIso,
              schedules: [{ repeat: "DAILY", timeOfDay: "18:00", enabled: true, lastRunAt: nowIso }],
            }),
          },
        });
      }
    } catch (e) {
      console.warn("[/api/gpm/sync] Failed to update lastRunAt in sync_schedule:", e);
    }

    // Mark Local Sync Job as COMPLETED in SyncQueue
    if (createdJobId) {
      await prisma.syncQueue.update({
        where: { id: createdJobId! },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          profilesCount: profiles.length,
          successCount: updatedCount + newCount,
          failCount: 0,
          resultSummary: `Mới: ${newCount}, Cập nhật: ${updatedCount}`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      jobId: createdJobId,
      message: `Đã đồng bộ ${profiles.length} profile từ GPMLogin (Mới: ${newCount}, Cập nhật: ${updatedCount})`,
      totalScanned: profiles.length,
      newImportedCount: newCount,
      updatedCount,
    });
  } catch (err: any) {
    console.error("[/api/gpm/sync] Error:", err);
    if (createdJobId) {
      try {
        await prisma.syncQueue.update({
          where: { id: createdJobId },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            errorMessage: err?.message || "Lỗi xử lý đồng bộ GPMLogin",
          },
        });
      } catch { }
    }
    return NextResponse.json(
      { success: false, error: err?.message || "Lỗi xử lý đồng bộ GPMLogin" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/gpm/sync
 * Returns the current queue status: isSyncing, activeJob, lastCompletedJob
 * Allows UI buttons to know if sync is in progress and stay disabled.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("run") === "1") {
    return POST(req);
  }

  try {
    const user = await resolveAuthUser(req);
    if (!user?.id) {
      return NextResponse.json({ isSyncing: false, activeJob: null, lastCompletedJob: null });
    }

    const userScopeFilter = {
      OR: [
        { requestedById: user.id },
        { targetScope: user.id },
        { targetScope: { contains: user.id } },
      ],
    };

    const activeJob = await prisma.syncQueue.findFirst({
      where: {
        ...userScopeFilter,
        status: { in: ["PENDING", "PROCESSING"] },
      },
      include: {
        requestedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { requestedAt: "desc" },
    });

    const lastCompleted = await prisma.syncQueue.findFirst({
      where: {
        ...userScopeFilter,
        status: "COMPLETED",
      },
      orderBy: { completedAt: "desc" },
      take: 1,
    });

    const lastFinished = await prisma.syncQueue.findFirst({
      where: {
        ...userScopeFilter,
        status: { in: ["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED"] },
      },
      orderBy: { completedAt: "desc" },
      take: 1,
    });

    return NextResponse.json({
      isSyncing: Boolean(activeJob),
      activeJob: activeJob
        ? {
          id: activeJob.id,
          status: activeJob.status,
          requestedAt: activeJob.requestedAt,
          startedAt: activeJob.startedAt,
          machineName: activeJob.machineName,
          requestedBy: activeJob.requestedBy?.name || "Bạn",
        }
        : null,
      lastCompletedJob: lastCompleted
        ? {
          id: lastCompleted.id,
          completedAt: lastCompleted.completedAt,
          profilesCount: lastCompleted.profilesCount,
          successCount: lastCompleted.successCount,
          resultSummary: lastCompleted.resultSummary,
        }
        : null,
      lastFinishedJob: lastFinished
        ? {
          id: lastFinished.id,
          status: lastFinished.status,
          completedAt: lastFinished.completedAt,
          profilesCount: lastFinished.profilesCount,
          successCount: lastFinished.successCount,
          failCount: lastFinished.failCount,
          resultSummary: lastFinished.resultSummary,
          errorMessage: lastFinished.errorMessage,
        }
        : null,
    });
  } catch (err: any) {
    return NextResponse.json(
      { isSyncing: false, error: err?.message },
      { status: 500 }
    );
  }
}
