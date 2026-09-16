import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateWorkdayScore, DEFAULT_SCORING_CONFIG, ScoringRuleConfig } from "@/lib/scoring-engine";
import { auth } from "@/lib/auth";
import { getOrSyncExchangeRates } from "@/lib/currency";
import { purgeExpiredExtensionAuthData } from "@/lib/extension-auth";

function getTodayDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export async function GET(req: Request) {
  try {
    const session = await auth();
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const isCronAuthorized = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
    const isAdmin = session?.user?.role === "ADMIN";

    if (!isCronAuthorized && !isAdmin) {
      return NextResponse.json({ error: "Unauthorized: Yêu cầu quyền Quản trị viên hoặc CRON_SECRET hợp lệ." }, { status: 401 });
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
      // Check synced status from database for each item
      for (const item of checklist.items) {
        const isSyncedToday = Boolean(
          item.account.lastSyncedAt &&
          new Date(item.account.lastSyncedAt).getTime() >= today.getTime()
        );
        const isSynced = item.isSynced || isSyncedToday;
        const isPosted = item.isPosted;
        const isCompleted = item.isCompleted || (isPosted && isSynced);

        if (isSynced !== item.isSynced || isCompleted !== item.isCompleted) {
          await prisma.dailyChecklistItem.update({
            where: { id: item.id },
            data: { isSynced, isCompleted },
          });
          if (isCompleted && !item.isCompleted) {
            totalItemsAutoChecked++;
          }
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

    // 4. Daily Maintenance: Auto-sync exchange rates & purge expired auth data
    let ratesSynced = false;
    try {
      await getOrSyncExchangeRates(prisma, { forceLive: true });
      ratesSynced = true;
    } catch (e) {
      console.warn("[/api/cron/cutoff] Daily currency sync skipped:", e);
    }

    let authPurged = false;
    try {
      await purgeExpiredExtensionAuthData();
      authPurged = true;
    } catch (e) {
      console.warn("[/api/cron/cutoff] Daily auth purge skipped:", e);
    }

    return NextResponse.json({
      success: true,
      message: `Đã tự động chốt công lúc 10:00 AM cho ${totalChecklistsProcessed} nhân sự (${totalItemsAutoChecked} accounts auto-checked).`,
      checklistsProcessed: totalChecklistsProcessed,
      itemsAutoChecked: totalItemsAutoChecked,
      ratesSynced,
      authPurged,
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
