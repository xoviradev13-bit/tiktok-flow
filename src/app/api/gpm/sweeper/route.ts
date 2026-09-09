import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gpmClient } from "@/lib/gpm-api";
import { detectTikTokAccountFromGpm } from "@/lib/tiktok-extractor";
import { pMap } from "@/lib/concurrency";
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

    const actorName = session?.user?.name || session?.user?.email || "Deep Sweeper Engine";

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const limit = body.limit ? Math.min(Number(body.limit), 50) : 10;
    const forceAll = Boolean(body.forceAll);

    // 1. Optional check for GPMLogin connection (non-blocking: sweeper reads profile data directly from disk)
    try {
      const health = await gpmClient.checkConnection();
      if (!health.isOnline) {
        console.log("ℹ️ [DeepSweeper] GPMLogin API offline, proceeding with direct disk profile extraction.");
      }
    } catch {
      // Continue with direct disk extraction
    }

    // 2. Identify stale accounts (no sync in 24h or lastSyncedAt is null)
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
    });

    if (accountsToSweep.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Tất cả tài khoản đều đã được cập nhật số liệu mới nhất trong vòng 24h qua.",
        totalScanned: 0,
        sweptCount: 0,
      });
    }

    let sweptCount = 0;
    let failedCount = 0;
    const details: any[] = [];

    // 3. Run parallel extraction with safe concurrency limit (2 concurrent headless profiles)
    await pMap(
      accountsToSweep,
      async (account) => {
        try {
          if (!account.gpmProfileId) return;

          console.log(`🧹 [DeepSweeper] Sweeping account @${account.username} (GPM: ${account.gpmProfileId})...`);
          const detected = await detectTikTokAccountFromGpm(account.gpmProfileId);

          if (detected) {
            const updatePayload: any = {
              lastSyncedAt: new Date(),
            };

            if (detected.totalViews !== undefined && detected.totalViews !== null) {
              updatePayload.totalViews = BigInt(detected.totalViews);
            }
            if (detected.followersCount !== undefined && detected.followersCount !== null) {
              updatePayload.totalFollowers = detected.followersCount;
            }
            if (detected.videoCount !== undefined && detected.videoCount !== null) {
              updatePayload.totalVideos = detected.videoCount;
            }
            if (detected.totalRewardsUsd !== undefined && detected.totalRewardsUsd !== null) {
              updatePayload.totalRevenue = detected.totalRewardsUsd;
            }
            if (detected.country && detected.country !== "US" && account.country === "US") {
              updatePayload.country = detected.country;
            }

            await prisma.tiktokAccount.update({
              where: { id: account.id },
              data: updatePayload,
            });

            await prisma.accountLog.create({
              data: {
                accountId: account.id,
                newStatus: account.status,
                logType: "STATUS_CHANGE",
                message: `[DEEP SWEEPER] Tự động quét vét và cập nhật số liệu TikTok Studio ngầm (${detected.followersCount} followers, ${detected.totalViews} views).`,
                actorName,
              },
            });

            sweptCount++;
            details.push({
              username: account.username,
              gpmProfileId: account.gpmProfileId,
              status: "SUCCESS",
              followers: detected.followersCount,
              views: detected.totalViews,
            });
          } else {
            // Still update lastSyncedAt to avoid tight looping on invalid profiles
            await prisma.tiktokAccount.update({
              where: { id: account.id },
              data: { lastSyncedAt: new Date() },
            });
            failedCount++;
            details.push({
              username: account.username,
              gpmProfileId: account.gpmProfileId,
              status: "FAILED_OR_NOT_LOGGED_IN",
            });
          }
        } catch (sweepErr: any) {
          console.warn(`[DeepSweeper] Error sweeping account ${account.username}:`, sweepErr.message);
          failedCount++;
          details.push({
            username: account.username,
            gpmProfileId: account.gpmProfileId,
            status: "ERROR",
            error: sweepErr.message,
          });
        }
      },
      2
    );

    // 4. Update tiktok_sweeper_schedule config lastRunAt
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
      message: `Đã hoàn thành quét vét ${sweptCount}/${accountsToSweep.length} tài khoản TikTok Studio ngầm.`,
      totalScanned: accountsToSweep.length,
      sweptCount,
      failedCount,
      details,
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
