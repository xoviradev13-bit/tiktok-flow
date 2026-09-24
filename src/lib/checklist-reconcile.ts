import { calculateWorkdayScore, getScoringConfig, getBusinessToday } from "@/lib/scoring-engine";
import { backfillChecklistVideos } from "@/lib/checklist-video-backfill";
import { getUserAccountIdsAt } from "@/lib/account-assignment-history";

// Minimal structural type satisfied by both the extended and raw clients.
// Using a structural type avoids the extended-client / PrismaClient
// assignability problem.
export type ReconciliationClient = {
  dailyChecklist: {
    findFirst: (args: any) => Promise<any>;
    findUnique?: (args: any) => Promise<any>;
    findMany?: (args: any) => Promise<any[]>;
    create: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
  };
  dailyChecklistItem: {
    create: (args: any) => Promise<any>;
    createMany: (args: any) => Promise<any>;
    deleteMany: (args: any) => Promise<any>;
    findFirst?: (args: any) => Promise<any>;
    findMany: (args: any) => Promise<any[]>;
    update?: (args: any) => Promise<any>;
  };
  tiktokAccount: {
    findMany: (args: any) => Promise<Array<any>>;
    findUnique?: (args: any) => Promise<any>;
  };
  $transaction: <T>(fn: (tx: any) => Promise<T>) => Promise<T>;
};

/**
 * Reconciles a single date's checklist for a target user:
 * - If checklist is missing and date is not locked: creates the DailyChecklist with all active assigned accounts.
 * - If checklist exists and is unlocked: reconciles items (adds missing accounts, deletes unassigned).
 * - Recalculates totalAssigned, completedCount, completionRate, and workdayScore.
 */
export async function reconcileChecklistForUserAndDate(
  prismaClient: any,
  targetUserId: string,
  targetDate: Date
): Promise<any> {
  const scoringConfig = await getScoringConfig(prismaClient);
  const shouldExcludeBanned = scoringConfig.excludeBannedAccounts !== false;
  const allowedStatuses = shouldExcludeBanned
    ? ["ACTIVE", "WARMING", "RESTRICTED"]
    : ["ACTIVE", "WARMING", "RESTRICTED", "BANNED"];

  const activeAccounts = await prismaClient.tiktokAccount.findMany({
    where: {
      assignedUserId: targetUserId,
      deletedAt: null,
      status: { in: allowedStatuses as any },
    },
    select: {
      id: true,
      lastSyncedAt: true,
      analytics: {
        select: { rawSnapshot: true },
      },
    },
  });

  const { todayDateOnly } = getBusinessToday();
  const isPastDate = targetDate.getTime() < todayDateOnly.getTime();

  let accountsForChecklist = [...activeAccounts];
  if (isPastDate) {
    // For past dates, include any accounts the user was assigned via assignment history or had items for in the 7-day window
    const assignmentAccountIds = await getUserAccountIdsAt(prismaClient, targetUserId, targetDate);
    const sevenDaysAgoDateOnly = new Date(todayDateOnly.getTime() - 7 * 24 * 60 * 60 * 1000);
    const historicalItems = await prismaClient.dailyChecklistItem.findMany({
      where: {
        checklist: {
          userId: targetUserId,
          date: { gte: sevenDaysAgoDateOnly, lte: todayDateOnly },
        },
      },
      select: { accountId: true },
    });
    const historicalAccountIds = Array.from(new Set([
      ...historicalItems.map((h: any) => h.accountId),
      ...assignmentAccountIds,
    ]));
    const activeIds = new Set(activeAccounts.map((a: any) => a.id));
    const extraIds = historicalAccountIds.filter((id: string) => !activeIds.has(id));
    if (extraIds.length > 0) {
      const extraAccounts = await prismaClient.tiktokAccount.findMany({
        where: { id: { in: extraIds }, deletedAt: null },
        select: {
          id: true,
          lastSyncedAt: true,
          analytics: {
            select: { rawSnapshot: true },
          },
        },
      });
      accountsForChecklist = [...accountsForChecklist, ...extraAccounts];
    }
  }

  if (accountsForChecklist.length === 0) return null;

  let checklist = await prismaClient.dailyChecklist.findFirst({
    where: { userId: targetUserId, date: targetDate },
    include: { items: true },
  });

  if (checklist?.isLocked) {
    return checklist; // Never mutate locked checklists
  }

  if (!checklist) {
    try {
      checklist = await prismaClient.dailyChecklist.create({
        data: {
          userId: targetUserId,
          date: targetDate,
          totalAssigned: accountsForChecklist.length,
          completedCount: 0,
          completionRate: 0,
          workdayScore: 0,
          items: {
            create: accountsForChecklist.map((a: any) => ({
              accountId: a.id,
              isPosted: false,
              isSynced: !!a.lastSyncedAt,
              isCompleted: false,
            })),
          },
        },
        include: { items: true },
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        checklist = await prismaClient.dailyChecklist.findFirst({
          where: { userId: targetUserId, date: targetDate },
          include: { items: true },
        });
      } else {
        throw err;
      }
    }
  } else {
    const existingIds = new Set<string>(checklist.items.map((i: any) => i.accountId));
    const toAdd = accountsForChecklist.filter((a: any) => !existingIds.has(a.id));
    const activeIds = new Set(activeAccounts.map((a: any) => a.id));
    // CRITICAL: For past dates, NEVER delete accounts from the checklist.
    // If the user had 10 accounts 7 days ago and only 8 today, the past checklist retains all 10.
    // toRemove is ONLY for today's checklist (or future dates) to prune accounts unassigned today.
    const toRemove = isPastDate
      ? []
      : checklist.items.filter(
          (i: any) => !activeIds.has(i.accountId) && !i.isCompleted && !i.isPosted
        );

    if (toAdd.length > 0 || toRemove.length > 0) {
      await prismaClient.$transaction(async (tx: any) => {
        if (toAdd.length) {
          await tx.dailyChecklistItem.createMany({
            data: toAdd.map((a: any) => ({
              checklistId: checklist.id,
              accountId: a.id,
              isSynced: !!a.lastSyncedAt,
            })),
            skipDuplicates: true,
          });
        }
        if (toRemove.length) {
          await tx.dailyChecklistItem.deleteMany({
            where: { id: { in: toRemove.map((i: any) => i.id) } },
          });
        }
      });
    }
  }

  if (!checklist) return null;

  // Recalculate score
  const remaining = await prismaClient.dailyChecklistItem.findMany({
    where: { checklistId: checklist.id },
  });
  const totalAssigned = remaining.length;
  const completedCount = remaining.filter((i: any) => i.isCompleted || i.isPosted).length;
  const { completionRate, workdayScore } = calculateWorkdayScore(
    totalAssigned,
    completedCount,
    scoringConfig
  );

  return await prismaClient.dailyChecklist.update({
    where: { id: checklist.id },
    data: { totalAssigned, completedCount, completionRate, workdayScore },
  });
}

/**
 * Reconciles checklists for the last `windowDays` (default 7 days: today + 6 past days).
 * If a checklist or item is missing for any of those days (and not locked),
 * it is created, and videos from rawSnapshot are backfilled.
 */
export async function reconcileRecentChecklistsForUser(
  prismaClient: any,
  targetUserId: string,
  windowDays = 7
): Promise<void> {
  const { todayDateOnly, todayStr } = getBusinessToday();

  // 1. Ensure checklists and items exist for all days in the 7-day window
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(todayDateOnly.getTime() - i * 24 * 60 * 60 * 1000);
    try {
      await reconcileChecklistForUserAndDate(prismaClient, targetUserId, d);
    } catch (err) {
      console.warn(`[reconcileRecentChecklistsForUser] Error on date ${d.toISOString().split("T")[0]}:`, err);
    }
  }

  // 2. Backfill videos from rawSnapshot for all assigned accounts across the window
  try {
    const accounts = await prismaClient.tiktokAccount.findMany({
      where: {
        assignedUserId: targetUserId,
        deletedAt: null,
      },
      select: {
        id: true,
        analytics: {
          select: { rawSnapshot: true },
        },
      },
    });

    for (const acc of accounts) {
      const rawSnap = (acc.analytics as any)?.rawSnapshot;
      const videosList = Array.isArray(rawSnap?.videosList) ? rawSnap.videosList : [];
      if (videosList.length > 0) {
        await backfillChecklistVideos(prismaClient, acc.id, videosList, todayStr, windowDays);
      }
    }
  } catch (backfillErr) {
    console.warn(`[reconcileRecentChecklistsForUser] Error backfilling videos for user ${targetUserId}:`, backfillErr);
  }
}

export async function reconcileTodayChecklistForUser(
  prismaClient: any,
  targetUserId: string
): Promise<void> {
  await reconcileRecentChecklistsForUser(prismaClient, targetUserId, 7);
}

/**
 * Post-commit reconciliation wrapper. Failures are logged, not thrown,
 * because the primary state change has already committed and the client
 * should not receive a false 500.
 */
export async function reconcileAfterCommit(
  prismaClient: any,
  targetUserId: string,
  context: string
): Promise<void> {
  try {
    await reconcileRecentChecklistsForUser(prismaClient, targetUserId, 7);
  } catch (err) {
    console.error(`[${context}] checklist reconciliation failed for user ${targetUserId}:`, err);
  }
}
