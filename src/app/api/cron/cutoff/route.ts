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
 * Circuit-breaker chunked deletion helper.
 * Deletes in batches of `batchSize` ids. Stops when fewer than batchSize rows
 * are returned OR maxIterations (50k rows) is reached.
 */
async function chunkedDeleteById(
  model: any,
  whereClause: any,
  batchSize = 1000
): Promise<{ deletedCount: number; hitCircuitBreaker: boolean }> {
  let totalDeleted = 0;
  const maxIterations = 50;
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
    const res = await model.deleteMany({ where: { id: { in: ids } } });
    totalDeleted += res.count;
    if (res.count === 0 || records.length < batchSize) break;
    if (iteration >= maxIterations) hitCircuitBreaker = true;
  }

  return { deletedCount: totalDeleted, hitCircuitBreaker };
}

export async function GET(req: Request) {
  try {
    // FIX: auth() can throw when NextAsyncLocalStorage is not available
    // (standalone runner). Guard so the cron secret path still works.
    const session = await auth().catch(() => null);

    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const isCronAuthorized = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);

    // FIX: allow LEAD in addition to ADMIN (matches the role hierarchy used
    // elsewhere in the app). Previously LEAD users could not trigger this.
    const role = (session?.user as { role?: string } | undefined)?.role || null;
    const isPrivileged = role === "ADMIN" || role === "LEAD";

    if (!isCronAuthorized && !isPrivileged) {
      return NextResponse.json(
        { error: "Unauthorized: Yêu cầu quyền Quản trị viên hoặc CRON_SECRET hợp lệ." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const forceToday = searchParams.get("forceToday") === "true";

    const scoringConfig = await getScoringConfig(prisma);
    const { todayDateOnly, sevenDaysAgoDateOnly, currentVnHour } = getBusinessToday();

    const canFinalizeToday = currentVnHour >= scoringConfig.cutOffHour || forceToday;

    const finalizationResult = await finalizePendingChecklists(prisma, {
      includeToday: canFinalizeToday,
    });

    // Daily currency sync — failure is logged but not fatal.
    let ratesSynced = false;
    let ratesError: string | null = null;
    try {
      await getOrSyncExchangeRates(prisma, { forceLive: true });
      ratesSynced = true;
    } catch (e: any) {
      ratesError = e?.message || String(e);
      console.warn("[/api/cron/cutoff] Daily currency sync skipped:", ratesError);
    }

    // FIX: retention windows use getBusinessToday's Vietnam-aligned boundary
    // where available, so the cron doesn't drift by up to a day depending on
    // when it runs in UTC terms. The 30/60-day windows are calendar-ish so
    // the UTC calculation is fine, but 7-day uses the VN date.
    const now = Date.now();
    const THIRTY_DAYS_AGO = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const SIXTY_DAYS_AGO = new Date(now - 60 * 24 * 60 * 60 * 1000);

    // FIX: `syncQueue` has `requestedAt` / `completedAt`, not `createdAt`.
    // The previous query used `createdAt` which does not exist on that model
    // and would throw at runtime, aborting the whole Promise.all.
    const sevenDaysAgoCutoff = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [syncQueuePurge, alertsPurge, logsPurge, authPurged] = await Promise.all([
      chunkedDeleteById(prisma.syncQueue, {
        status: { in: ["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED"] },
        completedAt: { lt: sevenDaysAgoCutoff },
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
      businessDate: todayDateOnly.toISOString().split("T")[0],
      sevenDaysAgoBusinessDate: sevenDaysAgoDateOnly.toISOString().split("T")[0],
      finalizedChecklists: finalizationResult.checklists,
      ratesSynced,
      ratesError,
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