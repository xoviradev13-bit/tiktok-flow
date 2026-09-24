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

/** Period windows as shown in tooltips / KPI cards. */
export function getAccountRevenuePeriods(account: AccountRevenueSource): {
  revenue7d: number;
  revenue28d: number;
  revenue30d: number;
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

  return {
    revenue7d: num(sr.revenue7d ?? analytics.revenue7d),
    revenue28d: num(sr.revenue28d ?? analytics.revenue28d),
    revenue30d: rev30,
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
    const d = String(item.date);
    if (startDateStr && d < startDateStr) continue;
    if (endDateStr && d > endDateStr) continue;
    sum += num(item.revenue);
  }
  return sum;
}

/**
 * Resolve revenue for a rolling window of `days` (0 = all-time).
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
  else if (days === 30) preset = periods.revenue30d;
  else if (days === 60) preset = periods.revenue60d;
  else if (days === 365) preset = periods.revenue365d;

  // When caller didn't merge dailies, fall back to breakdown-only for the window.
  let daily = mergedDailySum;
  if (daily <= 0) {
    const past = new Date();
    past.setUTCHours(0, 0, 0, 0);
    past.setUTCDate(past.getUTCDate() - days);
    daily = sumDailyRevenueBreakdown(account, past.toISOString().split("T")[0]);
  }

  return Math.max(daily, preset);
}
