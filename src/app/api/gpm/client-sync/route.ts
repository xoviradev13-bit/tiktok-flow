import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pMap } from "@/lib/concurrency";
import {
  checkRateLimit,
  getClientIp,
  resolveExtensionBearerAuth,
} from "@/lib/extension-auth";
import { detectCountryFromText, toStandardCountryCode } from "@/lib/country-name";

export interface ClientProfilePayload {
  id: string;
  name: string;
  raw_name?: string;
  group_id?: string;
  group_name?: string;
  tiktokHandle?: string | null;
}

/**
 * GET /api/gpm/client-sync
 * Allows authenticated Client Agents to poll their active sync schedule.
 * Requires Bearer personalToken / session JWT (schedule is tenant ops data).
 */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Yêu cầu Authorization Bearer token." },
        { status: 401 }
      );
    }

    const authResult = await resolveExtensionBearerAuth(token, "/api/gpm/client-sync:GET");
    if (!authResult.ok) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      );
    }

    const schedLimit = checkRateLimit(`client-sync-get:user:${authResult.user.id}`, 120);
    if (!schedLimit.ok) {
      return NextResponse.json(
        { success: false, error: "Quá nhiều yêu cầu. Thử lại sau." },
        { status: 429, headers: { "Retry-After": String(schedLimit.retryAfterSec) } }
      );
    }

    // Capture GPM Port & Status reported by Client Agent via headers or query params
    try {
      const url = new URL(req.url);
      const rawPort = url.searchParams.get("gpmPort") || req.headers.get("x-gpm-port");
      const rawOnline = url.searchParams.get("gpmOnline") || req.headers.get("x-gpm-online");
      const parsedPort = rawPort ? parseInt(rawPort, 10) : null;
      if (parsedPort && Number.isFinite(parsedPort) && parsedPort > 0) {
        const isOnline = rawOnline !== "false" && rawOnline !== "0";
        await prisma.user.update({
          where: { id: authResult.user.id },
          data: {
            gpmPort: parsedPort,
            gpmIsOnline: isOnline,
            gpmLastSeenAt: new Date(),
          },
        });
      }
    } catch {
      // Ignore background telemetry errors
    }

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

    // Auto-expire stale jobs:
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const twentyFiveMinutesAgo = new Date(Date.now() - 25 * 60 * 1000);

    // 1. PENDING jobs > 5 minutes (no agent online to pick it up)
    await prisma.syncQueue.updateMany({
      where: {
        status: "PENDING",
        requestedAt: { lt: fiveMinutesAgo },
      },
      data: {
        status: "TIMED_OUT",
        errorMessage: "Không có Client Agent nào tiếp nhận sau 5 phút - Đã tự động hủy bỏ",
        completedAt: new Date(),
      },
    });

    // 2. PROCESSING jobs > 25 minutes (agent crashed)
    await prisma.syncQueue.updateMany({
      where: {
        status: "PROCESSING",
        startedAt: { lt: twentyFiveMinutesAgo },
      },
      data: {
        status: "TIMED_OUT",
        errorMessage: "Tiến trình quét bị gián đoạn (quá 25 phút) - Đã tự động hủy bỏ",
        completedAt: new Date(),
      },
    });

    // Query active job from SyncQueue specifically for this authenticated user (or ALL)
    const activeSyncJob = await prisma.syncQueue.findFirst({
      where: {
        status: { in: ["PENDING", "PROCESSING"] },
        OR: [
          { requestedById: authResult.user.id },
          { targetScope: authResult.user.id },
          { targetScope: { contains: authResult.user.id } },
          { targetScope: "ALL" },
        ],
      },
      orderBy: { requestedAt: "desc" },
    });

    // Check if the most recent job was cancelled within the last 5 minutes
    const cancelledJob = await prisma.syncQueue.findFirst({
      where: {
        status: "CANCELLED",
        updatedAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
        OR: [
          { requestedById: authResult.user.id },
          { targetScope: authResult.user.id },
          { targetScope: { contains: authResult.user.id } },
          { targetScope: "ALL" },
        ],
      },
      orderBy: { updatedAt: "desc" },
    });

    let targetProfileId: string | null = null;
    let targetHandle: string | null = null;
    if (activeSyncJob?.targetScope) {
      const pMatch = activeSyncJob.targetScope.match(/PROFILE:([^|]+)/);
      if (pMatch && pMatch[1]) targetProfileId = pMatch[1].trim();
      const hMatch = activeSyncJob.targetScope.match(/HANDLE:([^|]+)/);
      if (hMatch && hMatch[1]) targetHandle = hMatch[1].trim();
    }

    const syncJob = activeSyncJob
      ? {
          id: activeSyncJob.id,
          status: activeSyncJob.status,
          requestedAt: activeSyncJob.requestedAt.getTime(),
          targetScope: activeSyncJob.targetScope,
          targetProfileId: targetProfileId || undefined,
          targetHandle: targetHandle || undefined,
        }
      : null;

    const syncSignal = activeSyncJob
      ? {
          jobId: activeSyncJob.id,
          requestedAt: activeSyncJob.requestedAt.getTime(),
          requestedBy: activeSyncJob.requestedById,
          targetProfileId: targetProfileId || undefined,
          targetHandle: targetHandle || undefined,
        }
      : null;

    return NextResponse.json({
      autoEnabled: isAutoOn,
      intervalMinutes,
      nextFixedTimestamp,
      scheduleSummary,
      mode: isAutoOn ? "AUTO" : "MANUAL",
      rawSchedule: parsed,
      sweeperSchedule,
      syncJob,
      syncSignal,
      cancelledJobId: cancelledJob?.id || null,
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

    // Prefer Authorization Bearer (JWT or legacy personalToken); body personalToken kept as legacy fallback only
    const token = (bearerToken || bodyToken)?.trim();

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Yêu cầu Authorization: Bearer <accessToken|personalToken> hợp lệ để đồng bộ." },
        { status: 401 }
      );
    }

    const ip = getClientIp(req) || "unknown";
    const ipLimit = checkRateLimit(`client-sync:ip:${ip}`, 60);
    if (!ipLimit.ok) {
      return NextResponse.json(
        { success: false, error: "Quá nhiều yêu cầu. Thử lại sau." },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } }
      );
    }

    const authResult = await resolveExtensionBearerAuth(token, "/api/gpm/client-sync");
    if (!authResult.ok) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: authResult.user.id },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Mã xác thực không hợp lệ hoặc đã bị thu hồi." },
        { status: 401 }
      );
    }

    // Bearer (JWT / personalToken) already identifies the user. Optional userEmail in
    // the body is informational only — do not 403 on mismatch (stale zip config /
    // pasted token vs old email was marking clients as "revoked" incorrectly).
    if (userEmail && typeof userEmail === "string") {
      const trimmedEmail = userEmail.trim().toLowerCase();
      const userMailLower = user.email?.toLowerCase();
      const userNameLower = user.username?.toLowerCase();
      if (
        trimmedEmail &&
        userMailLower !== trimmedEmail &&
        userNameLower !== trimmedEmail
      ) {
        console.warn(
          JSON.stringify({
            event: "client_sync_userEmail_mismatch_ignored",
            userId: user.id,
            bodyEmail: trimmedEmail,
          })
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

    // Capture GPM Port & Status reported by Client Agent
    const incomingPort =
      typeof (body as any).gpmPort === "number"
        ? (body as any).gpmPort
        : parseInt(req.headers.get("x-gpm-port") || "", 10) || null;
    const incomingOnline =
      typeof (body as any).gpmOnline === "boolean"
        ? (body as any).gpmOnline
        : req.headers.get("x-gpm-online") === "true";

    if (incomingPort && Number.isFinite(incomingPort) && incomingPort > 0) {
      await prisma.user
        .update({
          where: { id: user.id },
          data: {
            gpmPort: incomingPort,
            gpmIsOnline: incomingOnline !== false,
            gpmLastSeenAt: new Date(),
          },
        })
        .catch(() => {});

      if (user.role === "ADMIN" || user.role === "LEAD") {
        await prisma.systemConfig
          .upsert({
            where: { key: "gpm_config" },
            create: {
              key: "gpm_config",
              value: JSON.stringify({
                baseUrl: `http://127.0.0.1:${incomingPort}/api/v1`,
                port: incomingPort,
                isOnline: incomingOnline !== false,
                lastSeenAt: new Date().toISOString(),
              }),
              description: "Cấu hình GPMLogin Local API (Auto-synced from Client Agent)",
            },
            update: {
              value: JSON.stringify({
                baseUrl: `http://127.0.0.1:${incomingPort}/api/v1`,
                port: incomingPort,
                isOnline: incomingOnline !== false,
                lastSeenAt: new Date().toISOString(),
              }),
            },
          })
          .catch(() => {});
      }
    }

    // Handle queue status reporting actions from Client Agent
    const rawAction = (body as any).action;
    const incomingJobId = (body as any).jobId;

    if (rawAction === "start_job" && incomingJobId) {
      await prisma.syncQueue.update({
        where: { id: incomingJobId },
        data: {
          status: "PROCESSING",
          startedAt: new Date(),
          machineId: (body as any).machineId || null,
          machineName: (body as any).machineName || null,
        },
      });
      return NextResponse.json({ success: true, message: "Đã cập nhật trạng thái: Đang xử lý (PROCESSING)" });
    }

    if (rawAction === "complete_job" && incomingJobId) {
      await prisma.syncQueue.update({
        where: { id: incomingJobId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          errorMessage: null,
          profilesCount: (body as any).profilesCount ?? null,
          successCount: (body as any).successCount ?? null,
          failCount: (body as any).failCount ?? 0,
          resultSummary: (body as any).resultSummary ?? null,
        },
      });
      return NextResponse.json({ success: true, message: "Đã cập nhật trạng thái: Hoàn tất (COMPLETED)" });
    }

    if (rawAction === "fail_job" && incomingJobId) {
      await prisma.syncQueue.update({
        where: { id: incomingJobId },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorMessage: (body as any).errorMessage || "Lỗi không xác định từ Client Agent",
        },
      });
      return NextResponse.json({ success: true, message: "Đã cập nhật trạng thái: Thất bại (FAILED)" });
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

    let newCount = 0;
    let updatedCount = 0;

    await pMap(
      profiles,
      async (p) => {
        const realHandle = p.tiktokHandle
          ? String(p.tiktokHandle).replace(/^@/, "").trim().toLowerCase()
          : null;

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

        const resolvedGroupName = p.group_name || p.group_id;
        const detectedFromText = detectCountryFromText(p.name) || detectCountryFromText(resolvedGroupName);
        const country = detectedFromText || null;

        // 1. INSERT IF NEW
        if (!existing) {
          try {
            // Same as Extension: assign to the operator who discovered the account
            const assignedUserId = currentUserId || null;
            const newAccount = await prisma.tiktokAccount.create({
              data: {
                username: extractedUsername,
                country: country || undefined,
                groupName: resolvedGroupName || "GPM Fleet",
                gpmProfileId: p.id,
                gpmPort: incomingPort || undefined,
                status: "ACTIVE",
                assignedUserId,
                isAssignmentLocked: false,
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

        // 2. Link GPM + fluid handover only (metrics owned by Client Agent / Studio reports)
        const updateData: {
          gpmProfileId: string;
          gpmPort?: number;
          groupName: string;
          country?: string;
          lastSyncedAt: Date;
          assignedUserId?: string;
        } = {
          gpmProfileId: p.id,
          ...(incomingPort ? { gpmPort: incomingPort } : {}),
          groupName: resolvedGroupName || existing.groupName || "GPM Fleet",
          lastSyncedAt: new Date(),
        };

        // Upgrade country if we detect a specific country (UK, VN, etc.) and account is currently default/unset
        if (detectedFromText && (!existing.country || existing.country === "US" || existing.country === "Unknown")) {
          updateData.country = detectedFromText;
        }

        let didHandover = false;
        if (currentUserId && currentUserId !== existing.assignedUserId) {
          if (existing.isAssignmentLocked) {
            console.log(
              `[ClientSync] Account @${extractedUsername} is locked by Admin. Ownership remains with ${existing.assignedUser?.name || "current owner"}.`
            );
          } else {
            updateData.assignedUserId = currentUserId;
            didHandover = true;
          }
        }

        await prisma.tiktokAccount.update({
          where: { id: existing.id },
          data: updateData,
        });

        if (didHandover) {
          const oldOwner =
            existing.assignedUser?.name ||
            existing.assignedUser?.username ||
            "Chưa gán";
          await prisma.accountLog.create({
            data: {
              accountId: existing.id,
              oldStatus: existing.status,
              newStatus: existing.status,
              logType: "HANDOVER",
              message: `[BÀN GIAO CA] Quyền quản lý tài khoản @${extractedUsername} đã được chuyển giao từ ${oldOwner} sang ${actorName} khi đồng bộ Client Agent (profile "${p.name}").`,
              actorName,
            },
          });
        }
        updatedCount++;
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
