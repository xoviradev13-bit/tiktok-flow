import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateWorkdayScore, DEFAULT_SCORING_CONFIG, ScoringRuleConfig } from "@/lib/scoring-engine";
import { detectTikTokAccountFromGpm } from "@/lib/tiktok-extractor";

function getTodayDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // Optional bearer token verification if CRON_SECRET is configured
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Fetch system scoring rules
    let scoringConfig: ScoringRuleConfig = DEFAULT_SCORING_CONFIG;
    const configRecord = await prisma.systemConfig.findUnique({
      where: { key: "scoring_rules" },
    });
    if (configRecord) {
      try {
        scoringConfig = { ...DEFAULT_SCORING_CONFIG, ...JSON.parse(configRecord.value) };
      } catch (e) {}
    }

    const today = getTodayDateOnly();

    // 2. Fetch all daily checklists for today
    const checklists = await prisma.dailyChecklist.findMany({
      where: { date: today },
      include: {
        user: true,
        items: {
          include: { account: true },
        },
      },
    });

    let totalChecklistsProcessed = 0;
    let totalItemsAutoChecked = 0;
    const results: any[] = [];

    for (const checklist of checklists) {
      // Auto-scan uncompleted items
      for (const item of checklist.items) {
        if (!item.isCompleted && item.account.gpmProfileId) {
          try {
            const detected = await detectTikTokAccountFromGpm(item.account.gpmProfileId);
            if (detected) {
              const hasRecentVideo =
                (detected.videosToday !== undefined && detected.videosToday > 0) ||
                (detected.videos7d !== undefined && detected.videos7d > 0) ||
                (detected.totalVideos !== undefined && detected.totalVideos > 0);

              const isPosted = hasRecentVideo || item.isPosted;
              const isSynced = true;
              const isCompleted = isPosted && isSynced;

              await prisma.dailyChecklistItem.update({
                where: { id: item.id },
                data: { isPosted, isSynced, isCompleted },
              });

              if (isCompleted) totalItemsAutoChecked++;

              // Update account stats
              const updateData: any = { lastSyncedAt: new Date() };
              if (detected.totalViews > 0) updateData.totalViews = BigInt(detected.totalViews);
              if (detected.followersCount > 0) updateData.totalFollowers = detected.followersCount;
              if ((detected.totalVideos || detected.videoCount) > 0) {
                updateData.totalVideos = detected.totalVideos || detected.videoCount;
              }
              if (detected.totalRewardsUsd !== null && detected.totalRewardsUsd !== undefined) {
                updateData.totalRevenue = detected.totalRewardsUsd;
              }

              await prisma.tiktokAccount.update({
                where: { id: item.account.id },
                data: updateData,
              });

              // Upsert DailyRevenue for today
              if (detected.totalViews > 0 || (detected.totalRewardsUsd !== null && detected.totalRewardsUsd !== undefined)) {
                const revNum = detected.totalRewardsUsd || 0;
                const viewsNum = detected.viewsToday || detected.totalViews || 0;
                const rpmNum = detected.rpm || (viewsNum > 0 && revNum > 0 ? (revNum * 1000) / viewsNum : 0);

                await prisma.dailyRevenue.upsert({
                  where: {
                    accountId_date_sourceType: {
                      accountId: item.account.id,
                      date: today,
                      sourceType: "CREATOR_REWARDS",
                    },
                  },
                  create: {
                    accountId: item.account.id,
                    date: today,
                    views: BigInt(viewsNum),
                    revenue: revNum,
                    rpm: rpmNum,
                    sourceType: "CREATOR_REWARDS",
                  },
                  update: {
                    views: BigInt(viewsNum),
                    revenue: revNum,
                    rpm: rpmNum,
                  },
                });
              }
            }
          } catch (e) {}
        }
      }

      // Recalculate final score for this checklist
      const allItems = await prisma.dailyChecklistItem.findMany({
        where: { checklistId: checklist.id },
      });

      const totalAssigned = allItems.length;
      const completedCount = allItems.filter((i) => i.isCompleted || (i.isPosted && i.isSynced)).length;
      const { completionRate, workdayScore } = calculateWorkdayScore(totalAssigned, completedCount, scoringConfig);

      // Lock checklist at 10:00 AM cutoff
      const updated = await prisma.dailyChecklist.update({
        where: { id: checklist.id },
        data: {
          totalAssigned,
          completedCount,
          completionRate,
          workdayScore,
          isLocked: true,
          lockedAt: new Date(),
        },
      });

      totalChecklistsProcessed++;
      results.push({
        userId: checklist.userId,
        userName: checklist.user.fullName || checklist.user.username,
        totalAssigned,
        completedCount,
        completionRate,
        workdayScore,
        isLocked: true,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Đã tự động chốt công lúc 10:00 AM cho ${totalChecklistsProcessed} nhân sự (${totalItemsAutoChecked} accounts auto-checked).`,
      checklistsProcessed: totalChecklistsProcessed,
      itemsAutoChecked: totalItemsAutoChecked,
      cutoffTime: new Date().toISOString(),
      results,
    });
  } catch (err: any) {
    console.error("[/api/cron/cutoff] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Lỗi tự động chốt công 10:00 AM" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
