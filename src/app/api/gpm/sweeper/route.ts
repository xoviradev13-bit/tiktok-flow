import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const session = await auth();
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const isCronAuthorized = cronSecret && authHeader === `Bearer ${cronSecret}`;

    if (!session?.user?.id && !isCronAuthorized) {
      return NextResponse.json(
        { success: false, error: "Yêu cầu đăng nhập hoặc quyền Cron Secret để thực hiện tác vụ này." },
        { status: 401 }
      );
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const limit = body.limit ? Math.min(Number(body.limit), 100) : 50;
    const forceAll = Boolean(body.forceAll);

    // 1. Identify stale accounts (no sync in 24h or lastSyncedAt is null)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const staleFilter: any = {
      gpmProfileId: { not: null },
      status: "ACTIVE",
    };

    if (!forceAll) {
      staleFilter.OR = [
        { lastSyncedAt: null },
        { lastSyncedAt: { lt: twentyFourHoursAgo } },
      ];
    }

    const accountsToSweep = await prisma.tiktokAccount.findMany({
      where: staleFilter,
      orderBy: [
        { lastSyncedAt: "asc" },
      ],
      take: limit,
      include: {
        assignedUser: true,
      },
    });

    if (accountsToSweep.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Tất cả tài khoản đều đã được cập nhật số liệu mới nhất trong vòng 24h qua.",
        totalScanned: 0,
        queuedJobs: 0,
      });
    }

    // 2. Delegate to SyncQueue: Enqueue sync jobs for Client Agents
    const targetUserIds = new Set<string>();
    let hasUnassigned = false;

    for (const acc of accountsToSweep) {
      if (acc.assignedUserId) {
        targetUserIds.add(acc.assignedUserId);
      } else {
        hasUnassigned = true;
      }
    }

    const scopes = Array.from(targetUserIds);
    if (hasUnassigned || scopes.length === 0) {
      scopes.push("ALL");
    }

    let queuedCount = 0;
    const queuedJobIds: string[] = [];

    for (const scope of scopes) {
      const existingJob = await prisma.syncQueue.findFirst({
        where: {
          targetScope: scope,
          status: { in: ["PENDING", "PROCESSING"] },
        },
      });

      if (!existingJob) {
        const job = await prisma.syncQueue.create({
          data: {
            requestedById: scope === "ALL" ? (session?.user?.id || "system") : scope,
            targetScope: scope,
            status: "PENDING",
          },
        });
        queuedCount++;
        queuedJobIds.push(job.id);
      }
    }

    // 3. Update tiktok_sweeper_schedule config lastRunAt
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

    return NextResponse.json({
      success: true,
      message: `Đã đưa ${queuedCount} tác vụ đồng bộ vào hàng đợi (SyncQueue) cho các Client Agent của nhân sự.`,
      totalScanned: accountsToSweep.length,
      queuedCount,
      queuedJobIds,
    });
  } catch (err: any) {
    console.error("[/api/gpm/sweeper] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Lỗi xử lý quét vét TikTok Studio" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return POST(req);
}
