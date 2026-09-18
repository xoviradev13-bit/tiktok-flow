import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  calculateWorkdayScore,
  DEFAULT_SCORING_CONFIG,
  ScoringRuleConfig,
  getScoringConfig,
  getBusinessToday,
  finalizePendingChecklists,
} from "@/lib/scoring-engine";
import { auth } from "@/lib/auth";
import { getOrSyncExchangeRates } from "@/lib/currency";
import { purgeExpiredExtensionAuthData } from "@/lib/extension-auth";

/**
 * Circuit-breaker chunked deletion helper to delete in batches of 1,000 without locking tables
 * Stops when fewer than batchSize items are found OR maxIterations (50k rows) is reached.
 */
async function chunkedDeleteById(
  model: any,
  whereClause: any,
  batchSize = 1000
): Promise<{ deletedCount: number; hitCircuitBreaker: boolean }> {
  let totalDeleted = 0;
  const maxIterations = 50; // Safety cap: max 50,000 rows per run
  let iteration = 0;
  let hitCircuitBreaker = false;

  while (iteration < maxIterations) {
    iteration++;
    const records = await model.findMany({
      where: whereClause,
      select: { id: true },
      take: batchSize,
    });
    if (!records || records.length === 0) break;
    const ids = records.map((r: any) => r.id);
    const res = await model.deleteMany({
      where: { id: { in: ids } },
    });
    totalDeleted += res.count;
    if (res.count === 0 || records.length < batchSize) break;
    if (iteration >= maxIterations) {
      hitCircuitBreaker = true;
    }
  }

  return { deletedCount: totalDeleted, hitCircuitBreaker };
}

export async function GET(req: Request) {
  try {
    const session = await auth();
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const isCronAuthorized = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
    const isAdmin = session?.user?.role === "ADMIN";

    if (!isCronAuthorized && !isAdmin) {
      return NextResponse.json(
        { error: "Unauthorized: Yêu cầu quyền Quản trị viên hoặc CRON_SECRET hợp lệ." },
        { status: 401 }
      );
    }

    // Parse URL query params
    const { searchParams } = new URL(req.url);
    const forceToday = searchParams.get("forceToday") === "true";

    // 1. Fetch system scoring rules & business date boundaries
    const scoringConfig = await getScoringConfig(prisma);
    const { todayDateOnly, sevenDaysAgoDateOnly, currentVnHour } = getBusinessToday();

    // SINGLE SOURCE OF TRUTH: Today is only eligible if cutoff hour has passed OR admin explicit override
    const canFinalizeToday = currentVnHour >= scoringConfig.cutOffHour || forceToday;

    // 2. Execute Bounded Self-Healing Finalization
    const finalizationResult = await finalizePendingChecklists(prisma, {
      includeToday: canFinalizeToday,
    });

    // 3. Daily Maintenance: Auto-sync exchange rates
    let ratesSynced = false;
    try {
      await getOrSyncExchangeRates(prisma, { forceLive: true });
      ratesSynced = true;
    } catch (e) {
      console.warn("[/api/cron/cutoff] Daily currency sync skipped:", e);
    }

    // 4. Daily Maintenance: Circuit-breaker chunked system data purge
    const now = Date.now();
    const SEVEN_DAYS_AGO = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const THIRTY_DAYS_AGO = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const SIXTY_DAYS_AGO = new Date(now - 60 * 24 * 60 * 60 * 1000);

    const [syncQueuePurge, alertsPurge, logsPurge, authPurged] = await Promise.all([
      chunkedDeleteById(prisma.syncQueue, {
        status: { in: ["COMPLETED", "FAILED", "TIMED_OUT"] },
        createdAt: { lt: SEVEN_DAYS_AGO },
      }),
      chunkedDeleteById(prisma.accountAlert, {
        status: "RESOLVED",
        resolvedAt: { lt: THIRTY_DAYS_AGO },
      }),
      chunkedDeleteById(prisma.accountLog, {
        createdAt: { lt: SIXTY_DAYS_AGO },
      }),
      purgeExpiredExtensionAuthData().catch((e) => {
        console.warn("[/api/cron/cutoff] Daily auth purge skipped:", e);
        return null;
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: `Đã xử lý chốt công (${finalizationResult.processedCount} checklists, ${finalizationResult.autoCheckedItemsCount} items auto-checked).`,
      canFinalizeToday,
      cutoffTime: new Date().toISOString(),
      finalizedChecklists: finalizationResult.checklists,
      ratesSynced,
      purgeMetrics: {
        syncQueueDeleted: syncQueuePurge.deletedCount,
        syncQueueHitCap: syncQueuePurge.hitCircuitBreaker,
        alertsDeleted: alertsPurge.deletedCount,
        alertsHitCap: alertsPurge.hitCircuitBreaker,
        logsDeleted: logsPurge.deletedCount,
        logsHitCap: logsPurge.hitCircuitBreaker,
        authPurged: Boolean(authPurged),
      },
    });
  } catch (err: any) {
    console.error("[/api/cron/cutoff] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Lỗi tự động chốt công" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
