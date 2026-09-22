import { NextResponse } from "next/server";
import { prisma, prismaRaw } from "@/lib/prisma";
import { pMap } from "@/lib/concurrency";
import { auth } from "@/lib/auth";
import {
  checkRateLimit,
  getClientIp,
  resolveExtensionBearerAuth,
} from "@/lib/extension-auth";
import { detectCountryFromText, toStandardCountryCode } from "@/lib/country-name";
import { normalizeTikTokHandle } from "@/lib/tiktok-handle";
import { looksLikeGpmProfileName } from "@/lib/gpm-profile-fields";

export interface ClientProfilePayload {
  id: string;
  name: string;
  raw_name?: string;
  group_id?: string;
  group_name?: string;
  tiktokHandle?: string | null;
}

// FIX: reject oversized POST bodies before req.json() can pin memory.
const MAX_SYNC_BODY_BYTES = 8 * 1024 * 1024; // 8 MB (large profile fleets)

// FIX: process-local cache so the two auto-expire UPDATE sweeps don't run on every
// 10-second poll from every agent. Once per minute is plenty.
let lastJobExpirySweepAt = 0;
const JOB_EXPIRY_SWEEP_INTERVAL_MS = 60_000;

type SyncAuthUser = {
  id: string;
  role: string;
  name: string | null;
  email: string | null;
  username: string | null;
  isActive: boolean;
  extensionAccessEnabled: boolean | null;
};

type SyncAuthOk = { ok: true; user: SyncAuthUser; mode: "bearer" | "session" };
type SyncAuthFail = { ok: false; status: number; error: string };

/**
 * Dual auth for /api/gpm/sync:
 * - Client Agent: Authorization Bearer (personalToken / extension JWT)
 * - Dashboard UI: NextAuth session cookie (Header / Navbar / Settings)
 */
async function resolveSyncAuth(
  req: Request,
  route: string,
  explicitToken?: string | null
): Promise<SyncAuthOk | SyncAuthFail> {
  const authHeader = req.headers.get("authorization");
  const headerBearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const bearer = (explicitToken || headerBearer || "").trim();

  if (bearer) {
    const authResult = await resolveExtensionBearerAuth(bearer, route);
    if (!authResult.ok) {
      return { ok: false, status: authResult.status, error: authResult.error };
    }
    return {
      ok: true,
      mode: "bearer",
      user: {
        id: authResult.user.id,
        role: authResult.user.role,
        name: authResult.user.name ?? null,
        email: authResult.user.email ?? null,
        username: authResult.user.username ?? null,
        isActive: authResult.user.isActive,
        extensionAccessEnabled: authResult.user.extensionAccessEnabled ?? null,
      },
    };
  }

  const session = await auth().catch(() => null);
  const sessionUserId = session?.user?.id;
  if (!sessionUserId) {
    return {
      ok: false,
      status: 401,
      error: "Yêu cầu đăng nhập hoặc Authorization Bearer token.",
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: {
      id: true,
      role: true,
      name: true,
      email: true,
      username: true,
      isActive: true,
      extensionAccessEnabled: true,
      deletedAt: true,
    },
  });

  if (!user || user.deletedAt) {
    return { ok: false, status: 401, error: "Phiên đăng nhập không hợp lệ." };
  }
  if (!user.isActive) {
    return { ok: false, status: 403, error: "Tài khoản đã bị khóa." };
  }

  return {
    ok: true,
    mode: "session",
    user: {
      id: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
      username: user.username,
      isActive: user.isActive,
      extensionAccessEnabled: user.extensionAccessEnabled,
    },
  };
}

function userJobFilter(userId: string) {
  return {
    OR: [
      { requestedById: userId },
      { targetScope: `USER:${userId}` },
      { targetScope: userId },
      { targetScope: { startsWith: `USER:${userId}|` } },
    ],
  };
}

/** How recently the Client Agent must have heartbeated to count as online. */
const AGENT_FRESH_MS = 3 * 60 * 1000;

/**
 * Diagnose whether this user's Client Agent can actually pick up sync jobs.
 * Surfaces machine-binding conflicts that otherwise leave the Header spinning
 * on "Đang chờ Client Agent..." until the 5‑minute PENDING timeout.
 */
async function getAgentSyncHint(userId: string): Promise<{
  ready: boolean;
  code: "ok" | "machine_occupied" | "machine_mismatch" | "agent_offline";
  message: string | null;
  boundMachineName: string | null;
  gpmLastSeenAt: string | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      boundMachineId: true,
      boundMachineName: true,
      gpmIsOnline: true,
      gpmLastSeenAt: true,
    },
  });

  const recentReject = await prisma.machineBindingLog.findFirst({
    where: {
      userId,
      action: "BIND_REJECTED",
      reason: { in: ["occupied", "race_occupied", "mismatch"] },
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    select: { reason: true, createdAt: true },
  });

  const lastSeenMs = user?.gpmLastSeenAt?.getTime() ?? 0;
  // Agent is "fresh" if it has heartbeated recently — gpmIsOnline is NOT required
  // because the agent polls regardless of whether GPM Login is running.
  const agentFresh = Date.now() - lastSeenMs < AGENT_FRESH_MS;
  const boundMachineName = user?.boundMachineName || user?.boundMachineId || null;
  const gpmLastSeenAt = user?.gpmLastSeenAt?.toISOString() ?? null;

  if (
    recentReject &&
    (recentReject.reason === "occupied" || recentReject.reason === "race_occupied")
  ) {
    // If a successful BIND was recorded *after* the rejection, the conflict is
    // resolved — don't surface a stale "machine occupied" warning.
    const newerBind = await prisma.machineBindingLog.findFirst({
      where: { userId, action: "BIND", createdAt: { gt: recentReject.createdAt } },
      select: { id: true },
    });
    if (!newerBind) {
      return {
        ready: false,
        code: "machine_occupied",
        message:
          "Máy tính này đã được gắn với nhân sự khác. Client Agent không thể xác thực dưới tài khoản hiện tại — liên hệ Admin để hủy liên kết máy.",
        boundMachineName,
        gpmLastSeenAt,
      };
    }
  }

  if (recentReject?.reason === "mismatch") {
    // Same: if re-bound successfully after the mismatch, the warning is stale.
    const newerBind = await prisma.machineBindingLog.findFirst({
      where: { userId, action: "BIND", createdAt: { gt: recentReject.createdAt } },
      select: { id: true },
    });
    if (!newerBind) {
      return {
        ready: false,
        code: "machine_mismatch",
        message: `Tài khoản đã gắn máy "${boundMachineName || "khác"}". Không thể đồng bộ từ máy này — gửi yêu cầu đổi máy hoặc liên hệ Admin.`,
        boundMachineName,
        gpmLastSeenAt,
      };
    }
  }

  if (!agentFresh) {
    return {
      ready: false,
      code: "agent_offline",
      message:
        "Client Agent chưa online dưới tài khoản này. Kiểm tra Agent đang chạy, đã pair đúng user, và máy chưa bị gắn cho nhân sự khác.",
      boundMachineName,
      gpmLastSeenAt,
    };
  }

  return {
    ready: true,
    code: "ok",
    message: null,
    boundMachineName,
    gpmLastSeenAt,
  };
}

/** Enqueue SyncQueue job(s) for dashboard "Đồng bộ" / syncAll. */
async function enqueueDashboardSync(requester: SyncAuthUser, syncAll: boolean) {
  const isPrivileged = requester.role === "ADMIN" || requester.role === "LEAD";
  const scopes: string[] = [];

  if (syncAll && isPrivileged) {
    const activeUsers = await prisma.user.findMany({
      where: { isActive: true, extensionAccessEnabled: { not: false } },
      select: { id: true },
    });
    for (const u of activeUsers) scopes.push(u.id);
    if (scopes.length === 0) scopes.push(requester.id);
  } else {
    scopes.push(requester.id);
  }

  const queuedJobIds: string[] = [];
  for (const scope of scopes) {
    const job = await prisma.syncQueue.create({
      data: {
        requestedById: requester.id,
        targetScope: scope,
        status: "PENDING",
      },
    });
    queuedJobIds.push(job.id);
    const { syncFlowLog } = await import("@/lib/sync-flow-debug");
    syncFlowLog("enqueue", {
      jobId: job.id,
      targetScope: scope,
      requestedById: requester.id,
      requesterRole: requester.role,
      syncAll,
    });
    await prisma.syncQueue
      .updateMany({
        where: {
          targetScope: scope,
          status: "PENDING",
          id: { not: job.id },
        },
        data: {
          status: "CANCELLED",
          errorMessage: "Thay thế bởi yêu cầu đồng bộ mới hơn",
          completedAt: new Date(),
        },
      })
      .catch(() => { });
  }

  return {
    success: true as const,
    jobId: queuedJobIds[0] || null,
    queuedJobIds,
    queuedCount: queuedJobIds.length,
    message:
      syncAll && isPrivileged
        ? `Đã đưa ${queuedJobIds.length} tác vụ đồng bộ vào hàng đợi cho Client Agent.`
        : "Đã đưa lệnh đồng bộ vào hàng đợi. Đang chờ Client Agent nhận lệnh...",
  };
}

/**
 * GET /api/gpm/sync
 * - Dashboard (session cookie): poll job status / schedule
 * - Client Agent (Bearer): poll schedule + claimable syncSignal
 */
export async function GET(req: Request) {
  try {
    const resolved = await resolveSyncAuth(req, "/api/gpm/sync:GET");
    if (!resolved.ok) {
      return NextResponse.json(
        { success: false, error: resolved.error },
        { status: resolved.status }
      );
    }
    const { user } = resolved;

    const schedLimit = checkRateLimit(`client-sync-get:user:${user.id}`, 120);
    if (!schedLimit.ok) {
      return NextResponse.json(
        { success: false, error: "Quá nhiều yêu cầu. Thử lại sau." },
        { status: 429, headers: { "Retry-After": String(schedLimit.retryAfterSec) } }
      );
    }

    // Dashboard session polls need agent readiness; Bearer agents skip the hint.
    const agentHint =
      resolved.mode === "session"
        ? await getAgentSyncHint(user.id).catch(() => null)
        : null;

    // Capture GPM Port & Status reported by Client Agent via headers or query params.
    // Always update gpmLastSeenAt on every authenticated poll so the UI can detect
    // that the agent is alive even when GPM Login is not running.
    try {
      const url = new URL(req.url);
      const rawPort = url.searchParams.get("gpmPort") || req.headers.get("x-gpm-port");
      const rawOnline = url.searchParams.get("gpmOnline") || req.headers.get("x-gpm-online");
      const parsedPort = rawPort ? parseInt(rawPort, 10) : null;
      const isOnline = rawOnline !== "false" && rawOnline !== "0" && !!parsedPort;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(parsedPort && Number.isFinite(parsedPort) && parsedPort > 0
            ? { gpmPort: parsedPort }
            : {}),
          gpmIsOnline: isOnline,
          gpmLastSeenAt: new Date(),
        },
      });
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
        agentHint,
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

    // FIX: throttle the auto-expire sweeps so every 10s poll from every agent
    // does not issue 2 UPDATE statements. Once per minute is sufficient.
    if (Date.now() - lastJobExpirySweepAt > JOB_EXPIRY_SWEEP_INTERVAL_MS) {
      lastJobExpirySweepAt = Date.now();
      try {
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
      } catch (expErr) {
        // Never fail the poll because the sweeper failed.
        console.warn("[client-sync GET] Job expiry sweep failed:", expErr);
      }
    }

    // Query active job from SyncQueue specifically for this authenticated user
    const jobFilter = userJobFilter(user.id);

    const activeSyncJob = await prisma.syncQueue.findFirst({
      where: {
        status: { in: ["PENDING", "PROCESSING"] },
        ...jobFilter,
      },
      orderBy: { requestedAt: "desc" },
    });

    // Check if any job belonging to this user was cancelled within the last 5 minutes
    const cancelledJobs = await prisma.syncQueue.findMany({
      where: {
        status: "CANCELLED",
        updatedAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
        ...jobFilter,
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    const cancelledJob = cancelledJobs[0] || null;

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
        machineName: activeSyncJob.machineName || undefined,
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

    // Dashboard Header polls these fields (session cookie callers).
    const lastFinishedJob = await prisma.syncQueue.findFirst({
      where: {
        status: { in: ["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED"] },
        ...jobFilter,
      },
      orderBy: { completedAt: "desc" },
    });

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
      cancelledJobIds: cancelledJobs.map((j) => j.id),
      // UI contract (Header.tsx)
      isSyncing: Boolean(activeSyncJob),
      activeJob: syncJob,
      agentHint,
      lastFinishedJob: lastFinishedJob
        ? {
          id: lastFinishedJob.id,
          status: lastFinishedJob.status,
          errorMessage: lastFinishedJob.errorMessage,
          resultSummary: lastFinishedJob.resultSummary,
          completedAt: lastFinishedJob.completedAt,
        }
        : null,
      lastCompletedJob:
        lastFinishedJob?.status === "COMPLETED"
          ? {
            id: lastFinishedJob.id,
            resultSummary: lastFinishedJob.resultSummary,
          }
          : null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/gpm/sync
 * - Dashboard (session): enqueue syncAll / stop job
 * - Client Agent (Bearer): claim jobs + push profile inventory
 */
export async function POST(req: Request) {
  try {
    // FIX: reject oversized payloads before req.json() runs.
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_SYNC_BODY_BYTES) {
      return NextResponse.json(
        { success: false, error: "Payload quá lớn." },
        { status: 413 }
      );
    }

    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

    // Empty body is valid for dashboard "Đồng bộ" (Settings / Header).
    let body: any = {};
    const rawText = await req.text();
    if (rawText && rawText.trim()) {
      try {
        body = JSON.parse(rawText);
      } catch {
        return NextResponse.json(
          { success: false, error: "Body JSON không hợp lệ." },
          { status: 400 }
        );
      }
    }

    const { userEmail, personalToken: bodyToken, profiles } = body as {
      userEmail?: string;
      personalToken?: string;
      profiles?: ClientProfilePayload[];
    };

    const token = (bearerToken || bodyToken)?.trim() || "";
    const uiAction = String(body?.action || "");
    const wantsUiEnqueue =
      body?.syncAll === true ||
      uiAction === "stop" ||
      (!token && !profiles); // session cookie + empty/minimal body

    const resolved = await resolveSyncAuth(req, "/api/gpm/sync:POST", token || null);
    if (!resolved.ok) {
      return NextResponse.json(
        { success: false, error: resolved.error },
        { status: resolved.status }
      );
    }

    // ---------- Dashboard UI path (session cookie) ----------
    if (resolved.mode === "session" && wantsUiEnqueue && !Array.isArray(profiles)) {
      const uiLimit = checkRateLimit(`gpm-sync-ui:user:${resolved.user.id}`, 30);
      if (!uiLimit.ok) {
        return NextResponse.json(
          { success: false, error: "Quá nhiều yêu cầu. Thử lại sau." },
          { status: 429, headers: { "Retry-After": String(uiLimit.retryAfterSec) } }
        );
      }

      if (uiAction === "stop") {
        const jobId = typeof body.jobId === "string" ? body.jobId : null;
        const filter = jobId
          ? { id: jobId, ...userJobFilter(resolved.user.id) }
          : {
            status: { in: ["PENDING", "PROCESSING"] as const },
            ...userJobFilter(resolved.user.id),
          };
        const stopped = await prisma.syncQueue.updateMany({
          where: {
            ...filter,
            status: { in: ["PENDING", "PROCESSING"] },
          },
          data: {
            status: "CANCELLED",
            errorMessage: "Người dùng dừng đồng bộ từ Dashboard",
            completedAt: new Date(),
          },
        });
        return NextResponse.json({
          success: true,
          message:
            stopped.count > 0
              ? "Đã gửi lệnh dừng đồng bộ."
              : "Không có tác vụ đang chạy để dừng.",
          stoppedCount: stopped.count,
        });
      }

      // syncAll / empty POST → enqueue
      const existing = await prisma.syncQueue.findFirst({
        where: {
          status: { in: ["PENDING", "PROCESSING"] },
          ...userJobFilter(resolved.user.id),
        },
        orderBy: { requestedAt: "desc" },
      });
      if (existing && body?.syncAll !== true) {
        const agentHint = await getAgentSyncHint(resolved.user.id).catch(() => null);
        return NextResponse.json({
          success: false,
          inProgress: true,
          jobId: existing.id,
          message: "Đồng bộ đang chạy. Vui lòng chờ hoàn tất.",
          agentHint,
        });
      }

      const agentHint = await getAgentSyncHint(resolved.user.id).catch(() => null);
      const enqueued = await enqueueDashboardSync(
        resolved.user,
        body?.syncAll === true || resolved.user.role === "ADMIN" || resolved.user.role === "LEAD"
      );

      const blocked =
        agentHint &&
        !agentHint.ready &&
        (agentHint.code === "machine_occupied" ||
          agentHint.code === "machine_mismatch");

      return NextResponse.json({
        ...enqueued,
        agentHint,
        agentBlocked: Boolean(blocked),
        warning: agentHint?.message || undefined,
      });
    }

    // ---------- Client Agent path (Bearer / body personalToken) ----------
    if (resolved.mode !== "bearer") {
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

    const user = await prisma.user.findUnique({
      where: { id: resolved.user.id },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Mã xác thực không hợp lệ hoặc đã bị thu hồi." },
        { status: 401 }
      );
    }

    // Bearer (JWT / personalToken) already identifies the user. Optional userEmail in
    // the body is informational only — do not 403 on mismatch.
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
        .catch(() => { });

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
          .catch(() => { });
      }
    }

    // Handle queue status reporting actions from Client Agent
    const rawAction = (body as any).action;
    const incomingJobId = (body as any).jobId;

    // user is guaranteed non-null here (guarded at line 395–400 above).
    // Capture as a narrowed const so TypeScript doesn't complain inside closures.
    const verifiedUser = user;

    // FIX: reject an action targeting a job the caller does not own — otherwise
    // any authenticated user could mark another user's job as PROCESSING/COMPLETED/FAILED.
    // Returns { owned: boolean }. Only meaningful when incomingJobId is provided.
    async function assertOwnsJob(jobId: string, forUpdate = false) {
      const job = await prisma.syncQueue.findUnique({
        where: { id: jobId },
        select: { id: true, requestedById: true, targetScope: true, status: true },
      });
      if (!job) return { ok: false as const, status: 404 as const, error: "Job không tồn tại." };
      const uid = verifiedUser.id;
      const owns =
        job.requestedById === uid ||
        job.targetScope === `USER:${uid}` ||
        job.targetScope === uid ||
        (typeof job.targetScope === "string" && job.targetScope.startsWith(`USER:${uid}|`));
      if (!owns) {
        return { ok: false as const, status: 403 as const, error: "Job không thuộc quyền quản lý của bạn." };
      }
      if (forUpdate) return { ok: true as const, job };
      return { ok: true as const, job };
    }

    if (rawAction === "start_job" && incomingJobId) {
      // FIX: race-safe claim. Only a PENDING job owned by this user can transition
      // to PROCESSING. updateMany with a status filter makes this atomic on any SQL DB.
      const owns = await assertOwnsJob(incomingJobId, true);
      if (!owns.ok) {
        return NextResponse.json(
          { success: false, error: owns.error },
          { status: owns.status }
        );
      }

      const claim = await prisma.syncQueue.updateMany({
        where: {
          id: incomingJobId,
          status: "PENDING",
        },
        data: {
          status: "PROCESSING",
          startedAt: new Date(),
          machineId: (body as any).machineId || null,
          machineName: (body as any).machineName || null,
        },
      });

      if (claim.count === 0) {
        // Another agent (or a prior run) already claimed it. Do not sweep.
        return NextResponse.json(
          {
            success: false,
            error: "Job đã được tiếp nhận bởi một Client Agent khác.",
            reason: "already_claimed",
          },
          { status: 409 }
        );
      }

      return NextResponse.json({ success: true, message: "Đã cập nhật trạng thái: Đang xử lý (PROCESSING)" });
    }

    if (rawAction === "complete_job" && incomingJobId) {
      const owns = await assertOwnsJob(incomingJobId, true);
      if (!owns.ok) {
        return NextResponse.json(
          { success: false, error: owns.error },
          { status: owns.status }
        );
      }

      // FIX: only a PROCESSING job can complete; do not resurrect a TIMED_OUT/CANCELLED job.
      const done = await prisma.syncQueue.updateMany({
        where: {
          id: incomingJobId,
          status: { in: ["PROCESSING", "PENDING"] },
        },
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

      if (done.count === 0) {
        return NextResponse.json(
          { success: false, error: "Job không ở trạng thái có thể hoàn tất.", reason: "invalid_state" },
          { status: 409 }
        );
      }

      return NextResponse.json({ success: true, message: "Đã cập nhật trạng thái: Hoàn tất (COMPLETED)" });
    }

    if (rawAction === "fail_job" && incomingJobId) {
      const owns = await assertOwnsJob(incomingJobId, true);
      if (!owns.ok) {
        return NextResponse.json(
          { success: false, error: owns.error },
          { status: owns.status }
        );
      }

      const failed = await prisma.syncQueue.updateMany({
        where: {
          id: incomingJobId,
          status: { in: ["PROCESSING", "PENDING"] },
        },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorMessage: (body as any).errorMessage || "Lỗi không xác định từ Client Agent",
        },
      });

      if (failed.count === 0) {
        return NextResponse.json(
          { success: false, error: "Job không ở trạng thái có thể báo lỗi.", reason: "invalid_state" },
          { status: 409 }
        );
      }

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

    // FIX: wrap the per-profile mapper in try/catch so a single bad row cannot
    // abort the entire fleet sync. Increments a per-run failure counter instead.
    let failedCount = 0;

    await pMap(
      profiles,
      async (p) => {
        try {
          // Reject base64-ish disk-scrape false positives (e.g. c2ODQ2NTkxMjExMjA).
          const realHandle = normalizeTikTokHandle(p.tiktokHandle);
          const profileName = String(p.name || "").trim() || null;

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

          // Fallback: extension created @handle with Profile name but no UUID yet.
          if (!existing && profileName && looksLikeGpmProfileName(profileName)) {
            existing = await prisma.tiktokAccount.findFirst({
              where: {
                gpmProfileId: null,
                gpmProfileName: profileName,
              },
              include: {
                assignedUser: {
                  select: { id: true, role: true, name: true, username: true },
                },
              },
            });
          }

          // Skip profiles with no TikTok account linked
          if (!realHandle && !existing) {
            return;
          }

          const extractedUsername = realHandle || existing?.username || `profile_${p.id.slice(0, 8)}`;

          // Never create a brand-new row from an implausible / missing disk handle.
          if (!existing && !realHandle) {
            return;
          }

          const resolvedGroupName = p.group_name || p.group_id;
          const detectedFromText = detectCountryFromText(p.name) || detectCountryFromText(resolvedGroupName);
          const country = detectedFromText || null;

          // 1. INSERT IF NEW
          if (!existing) {
            // Username may already exist in Trash (unique constraint) — never revive via sync.
            const inTrash = await prismaRaw.tiktokAccount.findUnique({
              where: { username: extractedUsername },
              select: { id: true, deletedAt: true },
            });
            if (inTrash?.deletedAt) {
              return;
            }

            try {
              const assignedUserId = currentUserId || null;
              const newAccount = await prisma.tiktokAccount.create({
                data: {
                  username: extractedUsername,
                  country: country || undefined,
                  groupName: resolvedGroupName || "GPM Fleet",
                  gpmProfileId: p.id,
                  gpmProfileName: profileName || undefined,
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
                existing = await prismaRaw.tiktokAccount.findUnique({
                  where: { username: extractedUsername },
                  include: {
                    assignedUser: {
                      select: { id: true, role: true, name: true, username: true },
                    },
                  },
                });
                if (!existing) throw err;
                // Soft-deleted row hit the unique constraint — leave Trash alone.
                if (existing.deletedAt) {
                  return;
                }
              } else {
                throw err;
              }
            }
          }

          // Soft-deleted accounts must not be updated by agent sync.
          if (existing.deletedAt) {
            return;
          }

          // 2. Link GPM + fluid handover only
          const updateData: {
            gpmProfileId: string;
            gpmPort?: number;
            gpmProfileName?: string;
            groupName: string;
            country?: string;
            lastSyncedAt: Date;
            assignedUserId?: string;
          } = {
            gpmProfileId: p.id,
            ...(incomingPort ? { gpmPort: incomingPort } : {}),
            ...(profileName ? { gpmProfileName: profileName } : {}),
            groupName: resolvedGroupName || existing.groupName || "GPM Fleet",
            lastSyncedAt: new Date(),
          };

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

          const updateRes = await prisma.tiktokAccount.updateMany({
            where: { id: existing.id, deletedAt: null },
            data: updateData,
          });
          if (updateRes.count === 0) {
            return;
          }

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
        } catch (profileErr: any) {
          failedCount++;
          console.warn(
            `[ClientSync] Profile ${p?.id} (@${p?.tiktokHandle || "?"}) failed:`,
            profileErr?.message || profileErr
          );
        }
      },
      3
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
      message: `Đồng bộ hoàn tất cho ${actorName}: ${newCount} tạo mới, ${updatedCount} cập nhật${failedCount > 0 ? `, ${failedCount} lỗi` : ""}.`,
      totalScanned: profiles.length,
      newImportedCount: newCount,
      updatedCount,
      // FIX: surface partial-failure count so the agent can log/alert on it.
      failedCount,
    });
  } catch (error: any) {
    console.error("[ClientSync API Error]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}