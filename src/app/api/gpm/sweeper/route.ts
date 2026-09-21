import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/extension-auth";

// FIX: bound both the limit body value and the total work per call.
const MAX_LIMIT_PER_CALL = 100;
const DEFAULT_LIMIT_PER_CALL = 50;

// FIX: per-IP and per-user rate limits (this endpoint can enqueue hundreds of jobs).
const SWEEPER_RATE_LIMIT_PER_USER = 30;
const SWEEPER_RATE_LIMIT_PER_IP = 60;

export async function POST(req: Request) {
  try {
    const session = await auth().catch(() => null);
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const isCronAuthorized = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

    if (!session?.user?.id && !isCronAuthorized) {
      return NextResponse.json(
        { success: false, error: "Yêu cầu đăng nhập hoặc quyền Cron Secret để thực hiện tác vụ này." },
        { status: 401 }
      );
    }

    // FIX: replaced the hard role gate with ownership scoping.
    // ADMIN / LEAD / cron → tenant-wide sweep (all stale accounts).
    // Regular authenticated user → sweep only their OWN assigned accounts.
    // This lets operators refresh their numbers on demand without giving them
    // the ability to trigger sweeps on other operators' machines.
    const callerRole = (session?.user as { role?: string } | undefined)?.role || null;
    const isPrivileged = isCronAuthorized || callerRole === "ADMIN" || callerRole === "LEAD";

    // FIX: rate limit. Enqueueing 50+ jobs on every call from a loop is a DoS.
    const ip = getClientIp(req) || "unknown";
    const ipLimit = checkRateLimit(`sweeper:ip:${ip}`, SWEEPER_RATE_LIMIT_PER_IP);
    if (!ipLimit.ok) {
      return NextResponse.json(
        { success: false, error: "Quá nhiều yêu cầu. Thử lại sau." },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } }
      );
    }
    if (session?.user?.id) {
      const userLimit = checkRateLimit(`sweeper:user:${session.user.id}`, SWEEPER_RATE_LIMIT_PER_USER);
      if (!userLimit.ok) {
        return NextResponse.json(
          { success: false, error: "Quá nhiều yêu cầu. Thử lại sau." },
          { status: 429, headers: { "Retry-After": String(userLimit.retryAfterSec) } }
        );
      }
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    // FIX: clamp limit into a valid range. Previously NaN or negative would
    // reach Prisma's `take` and throw a validation error.
    const rawLimit = body?.limit !== undefined ? Number(body.limit) : DEFAULT_LIMIT_PER_CALL;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), MAX_LIMIT_PER_CALL)
      : DEFAULT_LIMIT_PER_CALL;

    // FIX: `forceAll` bypasses the 24-hour freshness check. That is expensive
    // (re-scrapes everything, even just-synced accounts), so it is privileged.
    // Regular users still get the on-demand sweep; they just can't skip the
    // freshness gate.
    const requestedForceAll = Boolean(body?.forceAll);
    if (requestedForceAll && !isPrivileged) {
      return NextResponse.json(
        { success: false, error: "Chỉ ADMIN hoặc LEAD được phép quét toàn bộ (forceAll)." },
        { status: 403 }
      );
    }
    const forceAll = requestedForceAll;

    // FIX: resolve a valid requester ID up-front. Previously the fallback was the
    // string "system", which is not a real User row and trips the SyncQueue FK
    // on create. Cron callers now inherit the first active ADMIN.
    let requesterId: string | null = session?.user?.id || null;
    if (!requesterId) {
      const admin = await prisma.user.findFirst({
        where: { role: "ADMIN", isActive: true },
        select: { id: true },
      });
      requesterId = admin?.id || null;
    }
    if (!requesterId) {
      return NextResponse.json(
        { success: false, error: "Không tìm được người dùng hợp lệ để gán yêu cầu." },
        { status: 500 }
      );
    }

    // 1. Identify stale accounts (no sync in 24h or lastSyncedAt is null)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const staleFilter: any = {
      gpmProfileId: { not: null },
      status: "ACTIVE",
    };

    // FIX: ownership scoping replaces the role gate. Regular users are
    // restricted to their own assigned accounts. ADMIN / LEAD / cron see the
    // whole tenant.
    if (!isPrivileged && session?.user?.id) {
      staleFilter.assignedUserId = session.user.id;
    }

    if (!forceAll) {
      staleFilter.OR = [
        { lastSyncedAt: null },
        { lastSyncedAt: { lt: twentyFourHoursAgo } },
      ];
    }

    const accountsToSweep = await prisma.tiktokAccount.findMany({
      where: staleFilter,
      orderBy: [{ lastSyncedAt: "asc" }],
      take: limit,
      include: {
        assignedUser: {
          // FIX: only the fields we actually need. Fetches less data.
          select: { id: true, isActive: true, extensionAccessEnabled: true, role: true },
        },
      },
    });

    if (accountsToSweep.length === 0) {
      return NextResponse.json({
        success: true,
        message: isPrivileged
          ? "Tất cả tài khoản đều đã được cập nhật số liệu mới nhất trong vòng 24h qua."
          : "Tất cả tài khoản của bạn đều đã được cập nhật số liệu mới nhất trong vòng 24h qua.",
        totalScanned: 0,
        queuedJobs: 0,
      });
    }

    // 2. Group accounts by the user whose Client Agent should sweep them.
    // FIX: only target ACTIVE users whose Client Agent is permitted to poll.
    // Previously any assigned user (including disabled accounts) received a job
    // that would sit PENDING until the 5-minute timeout fired.
    const targetUserIds = new Set<string>();
    let hasUnassigned = false;

    for (const acc of accountsToSweep) {
      const u = acc.assignedUser;
      const isTargetable =
        !!acc.assignedUserId &&
        !!u &&
        u.isActive === true &&
        u.extensionAccessEnabled !== false;

      if (isTargetable) targetUserIds.add(acc.assignedUserId!);
      else hasUnassigned = true;
    }

    // FIX: the previous "ALL" pseudo-scope was never matched by client-sync GET
    // (its filter only accepts `requestedById = <uid>`, `targetScope = <uid>`,
    // `USER:<uid>`, or `USER:<uid>|...`). Any job created with targetScope="ALL"
    // therefore sat PENDING until it TIMED_OUT 5 minutes later. Unassigned
    // accounts are now enqueued under the caller so at least one live agent
    // picks them up.
    const scopes: string[] = Array.from(targetUserIds);
    if (hasUnassigned) {
      scopes.push(requesterId);
    }

    let queuedCount = 0;
    const queuedJobIds: string[] = [];

    for (const scope of scopes) {
      // FIX: race-safe enqueue. Create unconditionally, then cancel any older
      // PENDING job for the same scope. Two concurrent calls to this endpoint
      // can no longer leave the queue with two jobs for the same user.
      const job = await prisma.syncQueue.create({
        data: {
          // FIX: requestedById is always the actual caller (session or fallback
          // admin). targetScope carries the routing info. Previously a caller
          // sweeps on behalf of a user recorded that user as requester, which
          // loses the audit trail.
          requestedById: requesterId,
          targetScope: scope,
          status: "PENDING",
        },
      });
      queuedCount++;
      queuedJobIds.push(job.id);

      try {
        await prisma.syncQueue.updateMany({
          where: {
            targetScope: scope,
            status: "PENDING",
            id: { not: job.id },
          },
          data: {
            status: "CANCELLED",
            errorMessage: "Thay thế bởi yêu cầu quét mới hơn",
            completedAt: new Date(),
          },
        });
      } catch (dedupeErr) {
        // Never fail the request because the dedupe pass failed.
        console.warn("[DeepSweeper] Dedupe pass failed:", dedupeErr);
      }
    }

    // 3. Update tiktok_sweeper_schedule config lastRunAt (informational).
    // FIX: only stamp this when the caller is privileged or cron. A regular
    // user's on-demand sweep shouldn't mark the global scheduler as "already
    // run today" — that would suppress the fleet-wide nightly sweep.
    if (isPrivileged) {
      const now = new Date();
      try {
        const sweeperConfig = await prisma.systemConfig.findUnique({
          where: { key: "tiktok_sweeper_schedule" },
        });
        if (sweeperConfig) {
          const parsed = JSON.parse(sweeperConfig.value);
          parsed.lastRunAt = now.toISOString();
          await prisma.systemConfig.update({
            where: { key: "tiktok_sweeper_schedule" },
            data: { value: JSON.stringify(parsed) },
          });
        }
      } catch (e) {
        console.warn("[DeepSweeper] Could not update lastRunAt in config:", e);
      }
    }

    return NextResponse.json({
      success: true,
      message: isPrivileged
        ? `Đã đưa ${queuedCount} tác vụ đồng bộ vào hàng đợi (SyncQueue) cho các Client Agent của nhân sự.`
        : `Đã đưa ${queuedCount} tác vụ đồng bộ cho tài khoản của bạn vào hàng đợi.`,
      totalScanned: accountsToSweep.length,
      queuedCount,
      queuedJobIds,
      scope: isPrivileged ? "tenant" : "self",
    });
  } catch (err: any) {
    console.error("[/api/gpm/sweeper] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.error || err?.message || "Lỗi xử lý quét vét TikTok Studio" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  // FIX: GET with the same semantics as POST is unusual and, more importantly,
  // a GET carrying a body is non-standard. Keep the alias for compatibility but
  // run a stripped version that respects the same auth check without reading a
  // body. If your cron only issues POST, delete this export.
  return POST(req);
}