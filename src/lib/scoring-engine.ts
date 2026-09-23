/**
 * Workday KPI Scoring Engine
 * completedCount = accounts where video was posted (isPosted = true)
 * Rules:
 * >= 85% completion -> 1.0 Workday (1 công)
 * >= 50% & < 85% completion -> 0.5 Workday (0.5 công)
 * < 50% completion -> 0.0 Workday (0 công)
 *
 * Configurable via SystemConfig table in Admin
 */

export interface ScoringRuleConfig {
  cutOffHour: number; // e.g., 22 (10:00 PM)
  cutOffMinute: number; // e.g., 0
  timezone: string; // e.g., "Asia/Ho_Chi_Minh"
  fullDayThreshold: number; // e.g., 85 (85%)
  halfDayThreshold: number; // e.g., 50 (50%)
  requireDataSync: boolean; // require last_synced_at before cutoff
  requirePostCheck: boolean; // require video post checklist checked
  excludeBannedAccounts?: boolean; // If true (default): exclude banned accounts from totalAssigned; if false: still count banned accounts in totalAssigned
}

export const DEFAULT_SCORING_CONFIG: ScoringRuleConfig = {
  cutOffHour: 22,
  cutOffMinute: 0,
  timezone: "Asia/Ho_Chi_Minh",
  fullDayThreshold: 85,
  halfDayThreshold: 50,
  requireDataSync: true,
  requirePostCheck: true,
  excludeBannedAccounts: true,
};

/**
 * How far back the cutoff cron will finalize/lock checklists.
 * This is also used as the BACKFILL_WINDOW_DAYS ceiling — backfilling past
 * this window is useless because those checklists are already locked.
 */
export const CHECKLIST_FINALIZATION_WINDOW_DAYS = 7;

export async function getScoringConfig(prisma: any): Promise<ScoringRuleConfig> {
  try {
    const record = await prisma.systemConfig.findUnique({
      where: { key: "scoring_rules" },
    });
    if (record && record.value) {
      const parsed = JSON.parse(record.value);
      return {
        ...DEFAULT_SCORING_CONFIG,
        ...parsed,
      };
    }
  } catch (e) {
    console.warn("Failed to load scoring_rules config:", e);
  }
  return DEFAULT_SCORING_CONFIG;
}

export function calculateWorkdayScore(
  totalAssigned: number,
  completedCount: number,
  config: ScoringRuleConfig = DEFAULT_SCORING_CONFIG
): {
  completionRate: number;
  workdayScore: number;
  statusLabel: string;
  badgeColor: string;
} {
  if (totalAssigned <= 0) {
    return {
      completionRate: 0,
      workdayScore: 0,
      statusLabel: "Chưa giao việc",
      badgeColor: "gray",
    };
  }

  const completionRate = Math.round((completedCount / totalAssigned) * 1000) / 10; // 1 decimal place

  if (completionRate >= config.fullDayThreshold) {
    return {
      completionRate,
      workdayScore: 1.0,
      statusLabel: "1.0 Ngày công (Đạt 100%)",
      badgeColor: "emerald",
    };
  } else if (completionRate >= config.halfDayThreshold) {
    return {
      completionRate,
      workdayScore: 0.5,
      statusLabel: "0.5 Ngày công (Đạt một phần)",
      badgeColor: "amber",
    };
  } else {
    return {
      completionRate,
      workdayScore: 0.0,
      statusLabel: "0 Ngày công (Không đạt)",
      badgeColor: "rose",
    };
  }
}

/**
 * Returns Vietnam Time info and countdown to 10:00 AM cutoff
 */
export function getCutoffTimeInfo(config: ScoringRuleConfig = DEFAULT_SCORING_CONFIG) {
  const now = new Date();
  // Get time in target timezone
  const vnTimeString = now.toLocaleString("en-US", { timeZone: config.timezone });
  const vnDate = new Date(vnTimeString);

  const cutoffToday = new Date(vnDate);
  cutoffToday.setHours(config.cutOffHour, config.cutOffMinute, 0, 0);

  const isPastCutoff = vnDate.getTime() >= cutoffToday.getTime();
  const diffMs = cutoffToday.getTime() - vnDate.getTime();

  let remainingHours = 0;
  let remainingMinutes = 0;
  let remainingSeconds = 0;

  if (!isPastCutoff && diffMs > 0) {
    remainingHours = Math.floor(diffMs / (1000 * 60 * 60));
    remainingMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    remainingSeconds = Math.floor((diffMs % (1000 * 60)) / 1000);
  }

  return {
    currentTimeString: vnDate.toLocaleTimeString("vi-VN", { hour12: false }),
    currentDateString: vnDate.toISOString().split("T")[0],
    isPastCutoff,
    remainingFormatted: `${String(remainingHours).padStart(2, "0")}:${String(remainingMinutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`,
    cutoffTimeString: `${String(config.cutOffHour).padStart(2, "0")}:${String(config.cutOffMinute).padStart(2, "0")} (Giờ VN)`,
  };
}

/**
 * Centralized business date calculation.
 * Ensures all components share the exact same UTC midnight representation of the Vietnam business day.
 */
export function getBusinessToday(timezone = "Asia/Ho_Chi_Minh"): {
  todayDateOnly: Date;
  sevenDaysAgoDateOnly: Date;
  todayStr: string;
  currentVnHour: number;
  currentVnMinute: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;

  const y = Number(m.year);
  const mo = Number(m.month);
  const d = Number(m.day);
  const hour = Number(m.hour || 0);
  const minute = Number(m.minute || 0);

  const todayDateOnly = new Date(Date.UTC(y, mo - 1, d));
  const sevenDaysAgoDateOnly = new Date(todayDateOnly.getTime() - 7 * 24 * 60 * 60 * 1000);
  const todayStr = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  return {
    todayDateOnly,
    sevenDaysAgoDateOnly,
    todayStr,
    currentVnHour: hour,
    currentVnMinute: minute,
  };
}

/**
 * Ensures all active staff/leads/admins with assigned TikTok accounts have a DailyChecklist
 * and corresponding DailyChecklistItems for the specified date.
 * - If a user has no checklist for this date -> creates the checklist + items.
 * - If a user already has an unlocked checklist -> creates any missing items for newly assigned accounts.
 */
export async function ensureDailyChecklistsForDate(
  prisma: any,
  date: Date
): Promise<{ createdCount: number; userIds: string[] }> {
  const scoringConfig = await getScoringConfig(prisma);
  const shouldExcludeBanned = scoringConfig.excludeBannedAccounts !== false;
  const allowedStatuses = shouldExcludeBanned
    ? ["ACTIVE", "WARMING", "RESTRICTED"]
    : ["ACTIVE", "WARMING", "RESTRICTED", "BANNED"];

  const activeUsers = await prisma.user.findMany({
    where: { isActive: true, role: { in: ["STAFF", "LEAD", "ADMIN"] }, deletedAt: null },
    include: {
      tiktokAccounts: {
        where: { status: { in: allowedStatuses as any }, deletedAt: null },
        select: { id: true, lastSyncedAt: true },
      },
    },
  });

  const usersWithAccounts = activeUsers.filter((u: any) => u.tiktokAccounts.length > 0);
  if (usersWithAccounts.length === 0) {
    return { createdCount: 0, userIds: [] };
  }

  const candidateUserIds = usersWithAccounts.map((u: any) => u.id);
  const existingChecklists = await prisma.dailyChecklist.findMany({
    where: {
      date,
      userId: { in: candidateUserIds },
    },
    include: {
      items: { select: { accountId: true } },
    },
  });

  const existingMap = new Map<string, (typeof existingChecklists)[0]>();
  for (const c of existingChecklists) {
    existingMap.set(c.userId, c);
  }

  const createdUserIds: string[] = [];

  for (const u of usersWithAccounts) {
    const existing = existingMap.get(u.id);
    if (!existing) {
      try {
        await prisma.dailyChecklist.create({
          data: {
            userId: u.id,
            date,
            totalAssigned: u.tiktokAccounts.length,
            completedCount: 0,
            completionRate: 0,
            workdayScore: 0,
            items: {
              create: u.tiktokAccounts.map((acc: any) => ({
                accountId: acc.id,
                isPosted: false,
                isSynced: !!acc.lastSyncedAt,
                isCompleted: false,
              })),
            },
          },
        });
        createdUserIds.push(u.id);
      } catch (err: any) {
        if (err?.code !== "P2002") {
          console.warn(`[ensureDailyChecklistsForDate] Error creating checklist for user ${u.id}:`, err);
        }
      }
    } else if (!existing.isLocked) {
      const existingAccountIds = new Set(existing.items.map((it: any) => it.accountId));
      const missingAccounts = u.tiktokAccounts.filter((acc: any) => !existingAccountIds.has(acc.id));
      if (missingAccounts.length > 0) {
        try {
          await prisma.dailyChecklistItem.createMany({
            data: missingAccounts.map((acc: any) => ({
              checklistId: existing.id,
              accountId: acc.id,
              isPosted: false,
              isSynced: !!acc.lastSyncedAt,
              isCompleted: false,
            })),
            skipDuplicates: true,
          });
          await prisma.dailyChecklist.update({
            where: { id: existing.id },
            data: {
              totalAssigned: existing.items.length + missingAccounts.length,
            },
          });
        } catch (err) {
          console.warn(`[ensureDailyChecklistsForDate] Error adding missing items for user ${u.id}:`, err);
        }
      }
    }
  }

  return { createdCount: createdUserIds.length, userIds: createdUserIds };
}

/**
 * Evaluates and locks pending daily checklists.
 * In catch-up mode (options.includeToday !== true), strictly locks past days:
 * isLocked = false && date >= sevenDaysAgo && date < todayDateOnly.
 * In cron/cutoff mode (options.includeToday === true), ensures today's checklists
 * exist for all active users with assigned accounts, then locks today's checklist.
 */
export async function finalizePendingChecklists(
  prisma: any,
  options: { includeToday?: boolean } = {}
): Promise<{
  processedCount: number;
  autoCheckedItemsCount: number;
  createdChecklistsCount: number;
  checklists: Array<{ id: string; date: string; score: number }>;
}> {
  const { todayDateOnly, sevenDaysAgoDateOnly } = getBusinessToday();
  const scoringConfig = await getScoringConfig(prisma);

  let createdChecklistsCount = 0;
  if (options.includeToday) {
    const ensureResult = await ensureDailyChecklistsForDate(prisma, todayDateOnly);
    createdChecklistsCount = ensureResult.createdCount;
  }

  const dateFilter: any = {
    gte: sevenDaysAgoDateOnly, // CHECKLIST_FINALIZATION_WINDOW_DAYS back
  };
  if (options.includeToday) {
    dateFilter.lte = todayDateOnly;
  } else {
    dateFilter.lt = todayDateOnly;
  }

  // Find candidate unfinalized checklists
  const candidates = await prisma.dailyChecklist.findMany({
    where: {
      isLocked: false,
      date: dateFilter,
    },
    include: {
      items: {
        include: { account: true },
      },
      user: {
        select: { id: true, name: true, fullName: true, username: true },
      },
    },
    orderBy: { date: "asc" },
  });

  if (!candidates || candidates.length === 0) {
    return { processedCount: 0, autoCheckedItemsCount: 0, createdChecklistsCount, checklists: [] };
  }

  let processedCount = 0;
  let autoCheckedItemsCount = 0;
  const checklistsSummary: Array<{ id: string; date: string; score: number }> = [];

  for (const checklist of candidates) {
    // 1. Optimistic Atomic Locking: Only process if we successfully acquire the lock
    const lockAcquired = await prisma.dailyChecklist.updateMany({
      where: {
        id: checklist.id,
        isLocked: false,
      },
      data: {
        isLocked: true,
        lockedAt: new Date(),
      },
    });

    if (lockAcquired.count === 0) {
      // Concurrently finalized by another worker/process
      continue;
    }

    // 2. Auto-check items with videosSnapshot or (isPosted && isSynced)
    // NOTE: videosSnapshot may include backfill-sourced entries (videoSource = "backfill").
    // Scoring treats presence of any video on that date as satisfying the auto-check
    // condition, regardless of isSynced or videoSource. isSynced is NOT read here —
    // confirmed during backfill implementation (§0.2). If this ever changes, backfilled
    // days will stop scoring correctly with no error, only silently-wrong completion state.
    for (const item of checklist.items) {
      const hasVideos = Array.isArray(item.videosSnapshot) && item.videosSnapshot.length > 0;
      const isCompleted = item.isCompleted || (item.isPosted && item.isSynced) || hasVideos;

      if (isCompleted !== item.isCompleted || (hasVideos && !item.isPosted)) {
        await prisma.dailyChecklistItem.update({
          where: { id: item.id },
          data: {
            isCompleted,
            isPosted: item.isPosted || hasVideos,
          },
        });
        if (isCompleted && !item.isCompleted) {
          autoCheckedItemsCount++;
        }
      }
    }

    // 3. Recalculate workday score
    const allItems = await prisma.dailyChecklistItem.findMany({
      where: { checklistId: checklist.id },
      include: { account: true },
    });

    const shouldExcludeBanned = scoringConfig.excludeBannedAccounts !== false;
    const eligibleItems = allItems.filter((i: any) => {
      if (!i.account || i.account.deletedAt) return false;
      if (shouldExcludeBanned && i.account.status === "BANNED") return false;
      return true;
    });

    const totalAssigned = eligibleItems.length;
    const completedCount = eligibleItems.filter((i: any) => i.isCompleted || (i.isPosted && i.isSynced)).length;
    const { completionRate, workdayScore } = calculateWorkdayScore(totalAssigned, completedCount, scoringConfig);

    await prisma.dailyChecklist.update({
      where: { id: checklist.id },
      data: {
        totalAssigned,
        completedCount,
        completionRate,
        workdayScore,
      },
    });

    processedCount++;
    checklistsSummary.push({
      id: checklist.id,
      date: checklist.date.toISOString().split("T")[0],
      score: workdayScore,
    });
  }

  return {
    processedCount,
    autoCheckedItemsCount,
    createdChecklistsCount,
    checklists: checklistsSummary,
  };
}
