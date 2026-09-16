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
  cutOffHour: number; // e.g., 10 (10:00 AM)
  cutOffMinute: number; // e.g., 0
  timezone: string; // e.g., "Asia/Ho_Chi_Minh"
  fullDayThreshold: number; // e.g., 85 (85%)
  halfDayThreshold: number; // e.g., 50 (50%)
  requireDataSync: boolean; // require last_synced_at before cutoff
  requirePostCheck: boolean; // require video post checklist checked
}

export const DEFAULT_SCORING_CONFIG: ScoringRuleConfig = {
  cutOffHour: 10,
  cutOffMinute: 0,
  timezone: "Asia/Ho_Chi_Minh",
  fullDayThreshold: 85,
  halfDayThreshold: 50,
  requireDataSync: true,
  requirePostCheck: true,
};

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
