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
 * Evaluates and locks pending daily checklists.
 * In catch-up mode (options.includeToday !== true), strictly locks past days:
 * isLocked = false && date >= sevenDaysAgo && date < todayDateOnly.
 * In cron/cutoff mode (options.includeToday === true), also locks today's checklist.
 */
export async function finalizePendingChecklists(
  prisma: any,
  options: { includeToday?: boolean } = {}
): Promise<{
  processedCount: number;
  autoCheckedItemsCount: number;
  checklists: Array<{ id: string; date: string; score: number }>;
}> {
  const { todayDateOnly, sevenDaysAgoDateOnly } = getBusinessToday();
  const scoringConfig = await getScoringConfig(prisma);

  const dateFilter: any = {
    gte: sevenDaysAgoDateOnly,
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
    return { processedCount: 0, autoCheckedItemsCount: 0, checklists: [] };
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
    const eligibleItems = shouldExcludeBanned
      ? allItems.filter((i: any) => i.account?.status !== "BANNED")
      : allItems;

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
    checklists: checklistsSummary,
  };
}
