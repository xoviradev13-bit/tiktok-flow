/**
 * Shared revenue resolution for analytics, accounts, revenue, and users pages.
 *
 * account.totalRevenue / sumRevenue.totalRevenue often comes from a monetization
 * DOM "Total" scrape and can stay stale while period windows + postRewards show $0.
 */

export type AccountRevenueSource = {
  totalRevenue?: unknown;
  revenueBreakdown?: Record<string, unknown> | null;
  analytics?: {
    sumRevenue?: Record<string, unknown> | null;
    revenueBreakdown?: Record<string, unknown> | null;
    postRewards?: unknown;
    rawSnapshot?: Record<string, unknown> | null;
    dailyRevenueBreakdown?: unknown;
    dailyBreakdown?: unknown;
  } | null;
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Resolve all-time (Toàn Bộ) revenue for one account.
 * Prefer Creator Rewards API period windows — especially 365d, which matches
 * how sumViews.totalViews is usually populated (insights 365d).
 */
export function resolveAllTimeRevenue(account: AccountRevenueSource): number {
  const sr = (account.analytics?.sumRevenue ?? {}) as Record<string, unknown>;
  const r365 = num(sr.revenue365d);
  const r60 = num(sr.revenue60d);
  const r28 = num(sr.revenue28d);
  const r7 = num(sr.revenue7d);

  // Prefer 365d when present (aligned with insights totalViews ≈ views365d).
  if (r365 > 0) return r365;

  const periodBest = Math.max(r60, r28, r7);
  if (periodBest > 0) return periodBest;

  const postRewards = account.analytics?.postRewards;
  if (Array.isArray(postRewards)) {
    const prSum = postRewards.reduce(
      (s: number, p: any) => s + (Number(p?.rewards) || Number(p?.reward) || 0),
      0
    );
    if (prSum > 0) return Math.round(prSum * 100) / 100;

    const rewardsStatus = account.analytics?.rawSnapshot?.rewardsStatus;
    // Confirmed sync with no period income and empty/zero postRewards —
    // do not keep an orphaned lifetime total from an older scrape.
    if (rewardsStatus === "written" || rewardsStatus === "no_program") {
      return 0;
    }
  }

  return num(sr.totalRevenue ?? account.totalRevenue);
}

export function getStartOfMonthDateStr(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

export function getTodayDateStr(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * TikTok delays estimated revenue reports by 2 days.
 * "Today" (hôm nay) effectively means 2 days ago.
 * E.g., if today is 08/10, effective today is 06/10.
 */
export function getEffectiveTodayDate(referenceDate: Date = new Date()): {
  dateStr: string;
  displayStr: string;
} {
  const d = new Date(referenceDate);
  d.setDate(d.getDate() - 2);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return {
    dateStr: `${year}-${month}-${day}`,
    displayStr: `${day}/${month}`,
  };
}

/**
 * Resolve revenue for "Today" (hôm nay), which is 2 days ago due to TikTok's 2-day reporting delay.
 */
export function resolveTodayRevenue(
  account: AccountRevenueSource,
  targetDateStr?: string
): number {
  const target = targetDateStr || getEffectiveTodayDate().dateStr;
  let daily = 0;

  const breakdown =
    (account.analytics?.dailyRevenueBreakdown as any[]) ||
    (account.analytics?.dailyBreakdown as any[]) ||
    [];
  if (Array.isArray(breakdown)) {
    for (const item of breakdown) {
      if (!item?.date) continue;
      const dStr = String(item.date).split("T")[0];
      if (dStr === target) {
        daily += num(item.revenue);
      }
    }
  }

  // Also check dailyRevenues array if present
  const drList = (account as any).dailyRevenues;
  if (Array.isArray(drList)) {
    let drSum = 0;
    for (const dr of drList) {
      if (!dr?.date) continue;
      const dStr =
        typeof dr.date === "string"
          ? dr.date.split("T")[0]
          : new Date(dr.date).toISOString().split("T")[0];
      if (dStr === target) {
        drSum += num(dr.revenue);
      }
    }
    if (drSum > daily) daily = drSum;
  }

  return Math.round(daily * 100) / 100;
}

/**
 * Returns the Monday (start) and Sunday (end) of the current week as YYYY-MM-DD strings.
 * Week is Monday–Sunday per Vietnamese/ISO convention.
 */
export function getThisWeekDateRange(): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  // Days to subtract to get Monday (ISO week start)
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: fmt(monday), end: fmt(sunday) };
}

/**
 * Returns date strings for the previous calendar month: 01 of prev month to the last day of prev month.
 */
export function getPreviousMonthDateRange(): { start: string; end: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed: 0 = Jan
  // Previous month
  const prevYear = month === 0 ? year - 1 : year;
  const prevMonth = month === 0 ? 12 : month; // 1-indexed
  const lastDay = new Date(prevYear, prevMonth, 0).getDate(); // last day of prev month
  const start = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
  const end = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

/**
 * Resolve revenue for the current week (Monday to Sunday).
 */
export function resolveThisWeekRevenue(account: AccountRevenueSource): number {
  const { start, end } = getThisWeekDateRange();
  let daily = sumDailyRevenueBreakdown(account, start, end);
  // Also check dailyRevenues array if present
  const drList = (account as any).dailyRevenues;
  if (Array.isArray(drList)) {
    let drSum = 0;
    for (const dr of drList) {
      if (!dr?.date) continue;
      const dStr =
        typeof dr.date === "string"
          ? dr.date.split("T")[0]
          : new Date(dr.date).toISOString().split("T")[0];
      if (dStr >= start && dStr <= end) {
        drSum += num(dr.revenue);
      }
    }
    if (drSum > daily) daily = drSum;
  }
  return Math.round(daily * 100) / 100;
}

/**
 * Resolve revenue for the previous calendar month (01 to last day of that month).
 */
export function resolvePreviousMonthRevenue(account: AccountRevenueSource): number {
  const { start, end } = getPreviousMonthDateRange();
  let daily = sumDailyRevenueBreakdown(account, start, end);
  const drList = (account as any).dailyRevenues;
  if (Array.isArray(drList)) {
    let drSum = 0;
    for (const dr of drList) {
      if (!dr?.date) continue;
      const dStr =
        typeof dr.date === "string"
          ? dr.date.split("T")[0]
          : new Date(dr.date).toISOString().split("T")[0];
      if (dStr >= start && dStr <= end) {
        drSum += num(dr.revenue);
      }
    }
    if (drSum > daily) daily = drSum;
  }
  return Math.round(daily * 100) / 100;
}

/**
 * Resolve Month-To-Date (MTD) revenue: from day 01 of the current month to today.
 */
export function resolveThisMonthRevenue(
  account: AccountRevenueSource,
  mergedDailySum = 0
): number {
  const startOfMonthStr = getStartOfMonthDateStr();
  const todayStr = getTodayDateStr();

  let daily = mergedDailySum;
  if (daily <= 0) {
    daily = sumDailyRevenueBreakdown(account, startOfMonthStr, todayStr);
    const drList = (account as any).dailyRevenues;
    if (Array.isArray(drList)) {
      let drSum = 0;
      for (const dr of drList) {
        if (!dr?.date) continue;
        const dStr =
          typeof dr.date === "string"
            ? dr.date.split("T")[0]
            : new Date(dr.date).toISOString().split("T")[0];
        if (dStr >= startOfMonthStr && dStr <= todayStr) {
          drSum += num(dr.revenue);
        }
      }
      if (drSum > daily) {
        daily = drSum;
      }
    }
  }

  return Math.round(daily * 100) / 100;
}

/** Period windows as shown in tooltips / KPI cards. */
export function getAccountRevenuePeriods(account: AccountRevenueSource): {
  revenue7d: number;
  revenue28d: number;
  revenue30d: number;
  revenueToday: number;
  revenueThisMonth: number;
  revenueThisWeek: number;
  revenuePrevMonth: number;
  revenue60d: number;
  revenue365d: number;
  totalRevenue: number;
} {
  const sr = (account.analytics?.sumRevenue ?? {}) as Record<string, unknown>;
  const analytics = (account.analytics ?? {}) as Record<string, unknown>;

  // 30-day resolution:
  // sumRevenue natively does not contain 30-day data (TikTok Studio only provides 7d/28d/60d/365d).
  // 1. Check revenueBreakdown.totalRevenue.revenue30d first (from monetization programs).
  // 2. Fall back to sum of dailyRevenueBreakdown over the last 30 days.
  // 3. Fall back to sumRevenue (revenue30d if present, or revenue28d).
  const rb = (
    account.analytics?.revenueBreakdown ??
    account.revenueBreakdown ??
    (account.analytics?.rawSnapshot as any)?.revenueBreakdown ??
    {}
  ) as Record<string, unknown>;
  const rbTotal = (rb?.totalRevenue ?? {}) as Record<string, unknown>;
  const rb30 = num(rbTotal?.revenue30d);

  let rev30 = rb30 > 0 ? rb30 : 0;
  if (rev30 <= 0) {
    const past30 = new Date();
    past30.setUTCHours(0, 0, 0, 0);
    past30.setUTCDate(past30.getUTCDate() - 30);
    const daily30 = sumDailyRevenueBreakdown(account, past30.toISOString().split("T")[0]);
    if (daily30 > 0) {
      rev30 = daily30;
    }
  }
  if (rev30 <= 0) {
    rev30 = num(
      sr.revenue30d ?? analytics.revenue30d ?? sr.revenue28d ?? analytics.revenue28d
    );
  }

  const revenueToday = resolveTodayRevenue(account);
  const revenueThisMonth = resolveThisMonthRevenue(account);
  const revenueThisWeek = resolveThisWeekRevenue(account);
  const revenuePrevMonth = resolvePreviousMonthRevenue(account);

  return {
    revenue7d: num(sr.revenue7d ?? analytics.revenue7d),
    revenue28d: num(sr.revenue28d ?? analytics.revenue28d),
    revenue30d: rev30,
    revenueToday,
    revenueThisMonth,
    revenueThisWeek,
    revenuePrevMonth,
    revenue60d: num(sr.revenue60d ?? analytics.revenue60d),
    revenue365d: num(sr.revenue365d ?? analytics.revenue365d),
    totalRevenue: resolveAllTimeRevenue(account),
  };
}

/** Sum dailyRevenueBreakdown (or legacy dailyBreakdown) for an optional date window. */
export function sumDailyRevenueBreakdown(
  account: AccountRevenueSource,
  startDateStr?: string,
  endDateStr?: string
): number {
  const breakdown =
    (account.analytics?.dailyRevenueBreakdown as any[]) ||
    (account.analytics?.dailyBreakdown as any[]) ||
    [];
  if (!Array.isArray(breakdown)) return 0;
  let sum = 0;
  for (const item of breakdown) {
    if (!item?.date) continue;
    const d = String(item.date).split("T")[0];
    if (startDateStr && d < startDateStr) continue;
    if (endDateStr && d > endDateStr) continue;
    sum += num(item.revenue);
  }
  return sum;
}

/**
 * Resolve revenue for a rolling window of `days` (0 = all-time).
 * When days === 30, it resolves Month-To-Date (from day 01 to today).
 * `mergedDailySum` should already be the deduped sum of DailyRevenue rows
 * + dailyRevenueBreakdown for that window (caller handles dedupe).
 */
export function resolvePeriodRevenue(
  account: AccountRevenueSource,
  days: number,
  mergedDailySum = 0
): number {
  if (days <= 0) return resolveAllTimeRevenue(account);

  const periods = getAccountRevenuePeriods(account);
  let preset = 0;
  if (days === 7) preset = periods.revenue7d;
  else if (days === 28) preset = periods.revenue28d;
  else if (days === 30) preset = periods.revenueThisMonth;
  else if (days === 60) preset = periods.revenue60d;
  else if (days === 365) preset = periods.revenue365d;

  // When caller didn't merge dailies, fall back to breakdown-only for the window.
  let daily = mergedDailySum;
  if (daily <= 0) {
    if (days === 30) {
      daily = periods.revenueThisMonth;
    } else {
      const past = new Date();
      past.setUTCHours(0, 0, 0, 0);
      past.setUTCDate(past.getUTCDate() - days);
      daily = sumDailyRevenueBreakdown(account, past.toISOString().split("T")[0]);
    }
  }

  return Math.max(daily, preset);
}
