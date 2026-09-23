import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { parseSyncSummary } from "@/lib/insights-ui";

const LOG_DIR = path.join(process.cwd(), "tmp");
const LOG_FILE = path.join(LOG_DIR, "sync-flow-debug.jsonl");

export type SyncFlowEvent =
  | "enqueue"
  | "job_claimed"
  | "job_complete_agent"
  | "job_fail_agent"
  | "report_begin"
  | "report_gate"
  | "report_account_updated"
  | "report_analytics_begin"
  | "report_analytics_ok"
  | "report_analytics_fail"
  | "report_end"
  | "db_verify"
  | "job_auto_completed";

export function syncFlowLog(
  event: SyncFlowEvent,
  fields: Record<string, unknown> = {}
): void {
  const row = {
    t: new Date().toISOString(),
    event,
    ...fields,
  };
  const line = JSON.stringify(row);
  // Always mirror to server console for live `npm run dev` tails.
  console.log(`[SYNC-FLOW] ${line}`);
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `${line}\n`, "utf8");
  } catch (err: any) {
    console.warn("[SYNC-FLOW] write failed:", err?.message || err);
  }
}

export function syncFlowLogPath(): string {
  return LOG_FILE;
}

type AccountVerifyRow = {
  username: string;
  accountId: string | null;
  lastSyncedAt: string | null;
  hasAnalytics: boolean;
  analyticsUpdatedAt: string | null;
  analyticsFresh: boolean;
  hasSumViews: boolean;
  hasSumRevenue: boolean;
  postRewardsLen: number | null;
  dailyViewsLen: number | null;
  insightsStatus: string | null;
  rewardsStatus: string | null;
  issue: string | null;
};

/**
 * After Client Agent completes a SyncQueue job, verify AccountAnalytics rows
 * were actually written for accounts in scope (and any handles named in the
 * agent summary). Returns an object merged into resultSummary for the Header.
 */
export async function verifySyncJobAnalytics(opts: {
  jobId: string;
  targetScope: string | null;
  startedAt: Date | null;
  agentSummaryRaw: unknown;
  successCount: number | null;
  failCount: number | null;
  profilesCount: number | null;
}): Promise<{
  verifyVersion: 1;
  jobId: string;
  checkedAt: string;
  agentOk: number | null;
  agentFailed: number | null;
  agentProfiles: number | null;
  accountsInScope: number;
  withAnalytics: number;
  missingAnalytics: number;
  staleAnalytics: number;
  missingUsernames: string[];
  staleUsernames: string[];
  rows: AccountVerifyRow[];
  logFile: string;
}> {
  const startedAt = opts.startedAt;
  // Allow a small clock skew; analytics must be at/after job start.
  const freshAfter = startedAt
    ? new Date(startedAt.getTime() - 5_000)
    : new Date(Date.now() - 60 * 60_000);

  const parsed = parseSyncSummary(
    typeof opts.agentSummaryRaw === "string"
      ? opts.agentSummaryRaw
      : opts.agentSummaryRaw != null
        ? JSON.stringify(opts.agentSummaryRaw)
        : null
  );

  const handlesFromSummary = new Set<string>();
  if (parsed) {
    for (const key of [
      "incompleteInsights",
      "reloginNeeded",
      "failedAccounts",
      "notRetried",
    ] as const) {
      const arr = parsed[key];
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        const u = String(item?.username || "")
          .replace(/^@/, "")
          .trim()
          .toLowerCase();
        if (u) handlesFromSummary.add(u);
      }
    }
  }

  // targetScope is usually the User.id of the staff whose profiles to sync.
  const scopeUserId =
    opts.targetScope &&
    opts.targetScope !== "ALL" &&
    !opts.targetScope.includes("|")
      ? opts.targetScope
      : opts.targetScope?.startsWith("USER:")
        ? opts.targetScope.slice(5).split("|")[0]
        : null;

  const accounts = await prisma.tiktokAccount.findMany({
    where: {
      OR: [
        ...(scopeUserId ? [{ assignedUserId: scopeUserId }] : []),
        ...(handlesFromSummary.size
          ? [{ username: { in: [...handlesFromSummary] } }]
          : []),
        // Fallback: anything synced during this job window
        ...(startedAt
          ? [{ lastSyncedAt: { gte: freshAfter } }]
          : []),
      ],
    },
    select: {
      id: true,
      username: true,
      lastSyncedAt: true,
      assignedUserId: true,
      analytics: {
        select: {
          updatedAt: true,
          sumViews: true,
          sumRevenue: true,
          postRewards: true,
          dailyViewsBreakdown: true,
          rawSnapshot: true,
        },
      },
    },
    take: 200,
  });

  // Prefer scope-assigned accounts; if none, use recently synced.
  let scoped = scopeUserId
    ? accounts.filter((a) => a.assignedUserId === scopeUserId)
    : accounts;
  if (scoped.length === 0) scoped = accounts;

  const rows: AccountVerifyRow[] = scoped.map((a) => {
    const snap = (a.analytics?.rawSnapshot as Record<string, any>) || {};
    const hasAnalytics = !!a.analytics;
    const analyticsUpdatedAt = a.analytics?.updatedAt
      ? a.analytics.updatedAt.toISOString()
      : null;
    const analyticsFresh =
      !!a.analytics?.updatedAt && a.analytics.updatedAt >= freshAfter;
    let issue: string | null = null;
    if (!hasAnalytics) issue = "missing_analytics_row";
    else if (!analyticsFresh) issue = "stale_analytics";

    return {
      username: a.username,
      accountId: a.id,
      lastSyncedAt: a.lastSyncedAt ? a.lastSyncedAt.toISOString() : null,
      hasAnalytics,
      analyticsUpdatedAt,
      analyticsFresh,
      hasSumViews: a.analytics?.sumViews != null,
      hasSumRevenue: a.analytics?.sumRevenue != null,
      postRewardsLen: Array.isArray(a.analytics?.postRewards)
        ? a.analytics!.postRewards.length
        : null,
      dailyViewsLen: Array.isArray(a.analytics?.dailyViewsBreakdown)
        ? (a.analytics!.dailyViewsBreakdown as any[]).length
        : null,
      insightsStatus: snap.insightsStatus ?? null,
      rewardsStatus: snap.rewardsStatus ?? null,
      issue,
    };
  });

  const missingUsernames = rows
    .filter((r) => r.issue === "missing_analytics_row")
    .map((r) => r.username);
  const staleUsernames = rows
    .filter((r) => r.issue === "stale_analytics")
    .map((r) => r.username);

  const result = {
    verifyVersion: 1 as const,
    jobId: opts.jobId,
    checkedAt: new Date().toISOString(),
    agentOk: opts.successCount,
    agentFailed: opts.failCount,
    agentProfiles: opts.profilesCount,
    accountsInScope: rows.length,
    withAnalytics: rows.filter((r) => r.hasAnalytics).length,
    missingAnalytics: missingUsernames.length,
    staleAnalytics: staleUsernames.length,
    missingUsernames,
    staleUsernames,
    rows,
    logFile: LOG_FILE,
  };

  syncFlowLog("db_verify", {
    jobId: opts.jobId,
    accountsInScope: result.accountsInScope,
    withAnalytics: result.withAnalytics,
    missingAnalytics: result.missingAnalytics,
    staleAnalytics: result.staleAnalytics,
    missingUsernames: result.missingUsernames,
    staleUsernames: result.staleUsernames,
    agentOk: result.agentOk,
    agentFailed: result.agentFailed,
  });

  return result;
}

/** Merge agent summary + dbVerify into the SyncQueue.resultSummary JSON string. */
export function mergeSummaryWithDbVerify(
  agentSummaryRaw: unknown,
  dbVerify: Awaited<ReturnType<typeof verifySyncJobAnalytics>>
): string {
  let base: Record<string, any> = {};
  if (typeof agentSummaryRaw === "string") {
    try {
      base = JSON.parse(agentSummaryRaw);
    } catch {
      base = { legacyText: agentSummaryRaw, summaryVersion: 1 };
    }
  } else if (agentSummaryRaw && typeof agentSummaryRaw === "object") {
    base = { ...(agentSummaryRaw as object) };
  } else {
    base = { summaryVersion: 1 };
  }
  if (!base.summaryVersion) base.summaryVersion = 1;
  base.dbVerify = {
    verifyVersion: dbVerify.verifyVersion,
    checkedAt: dbVerify.checkedAt,
    accountsInScope: dbVerify.accountsInScope,
    withAnalytics: dbVerify.withAnalytics,
    missingAnalytics: dbVerify.missingAnalytics,
    staleAnalytics: dbVerify.staleAnalytics,
    missingUsernames: dbVerify.missingUsernames,
    staleUsernames: dbVerify.staleUsernames,
    agentOk: dbVerify.agentOk,
    agentFailed: dbVerify.agentFailed,
    agentProfiles: dbVerify.agentProfiles,
    // Keep full rows in the jsonl log; trim Header payload.
    sampleMissing: dbVerify.missingUsernames.slice(0, 10),
    sampleStale: dbVerify.staleUsernames.slice(0, 10),
  };
  return JSON.stringify(base);
}
