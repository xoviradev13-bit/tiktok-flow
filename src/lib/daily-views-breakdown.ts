/**
 * Studio insight histories are oldest → newest ({ status, value }[]).
 * Trailing `{ status: 2 }` slots are not finalized yet — Studio excludes them
 * from period cards ("7 ngày gần nhất", etc.), then sums the last N days.
 */

export type InsightHistoryPoint = {
  status?: number;
  value?: number | null;
};

/** Count trailing unavailable (status:2) points Studio has not finalized. */
export function countTrailingInsightUnavailable(
  history: unknown
): number {
  if (!Array.isArray(history) || history.length === 0) return 0;
  let n = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (Number((history[i] as InsightHistoryPoint)?.status) === 2) n += 1;
    else break;
  }
  return n;
}

/**
 * Sum a Studio insight history for a period card (7 / 28 / 60 / 365).
 * Trims trailing status:2, then sums the last `periodDays` points.
 */
export function sumStudioInsightPeriod(
  history: unknown,
  periodDays: number
): number {
  if (!Array.isArray(history) || periodDays <= 0) return 0;
  const trim = countTrailingInsightUnavailable(history);
  const end = history.length - trim;
  const start = Math.max(0, end - periodDays);
  let s = 0;
  for (let i = start; i < end; i++) {
    s += Number((history[i] as InsightHistoryPoint)?.value || 0) || 0;
  }
  return s;
}

/**
 * Convert Studio Insights `vv_history` into dated daily points.
 * Trailing status:2 days are omitted so the series ends on the last
 * finalized day (matches Studio period card windows).
 *
 * Request shape: days ≈ period+pad, end_days: 1.
 */
export function buildDailyViewsBreakdown(
  vvHistory: unknown,
  endDays = 1
): Array<{ date: string; views: number }> {
  if (!Array.isArray(vvHistory) || vvHistory.length === 0) return [];

  const trim = countTrailingInsightUnavailable(vvHistory);
  const arr = trim > 0 ? vvHistory.slice(0, vvHistory.length - trim) : vvHistory;
  if (arr.length === 0) return [];

  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(
    end.getUTCDate() - Math.max(0, Number(endDays) || 0) - trim
  );

  const n = arr.length;
  const out: Array<{ date: string; views: number }> = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - (n - 1 - i));
    const views = Number((arr[i] as InsightHistoryPoint)?.value ?? 0);
    out.push({
      date: d.toISOString().split("T")[0],
      views: Number.isFinite(views) ? views : 0,
    });
  }
  return out;
}

/** Sum views in [from, to] inclusive (YYYY-MM-DD), or all if bounds omitted. */
export function sumDailyViewsInRange(
  breakdown: Array<{ date?: string; views?: number }> | null | undefined,
  from?: string | null,
  to?: string | null
): number {
  if (!Array.isArray(breakdown) || breakdown.length === 0) return 0;
  let s = 0;
  for (const item of breakdown) {
    const date = item?.date;
    if (!date) continue;
    if (from && date < from) continue;
    if (to && date > to) continue;
    s += Number(item.views || 0) || 0;
  }
  return s;
}

export type AccountViewsSource = {
  totalViews?: unknown;
  analytics?: {
    sumViews?: Record<string, unknown> | null;
  } | null;
};

/** Period windows for views tooltips / KPI cards (from sumViews). */
export function getAccountViewsPeriods(account: AccountViewsSource): {
  views7d: number;
  views28d: number;
  views60d: number;
  views365d: number;
  totalViews: number;
} {
  const sv = (account.analytics?.sumViews ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => {
    const x = Number(v ?? 0);
    return Number.isFinite(x) ? x : 0;
  };
  const views365d = n(sv.views365d);
  const totalViews = n(sv.totalViews ?? views365d ?? account.totalViews);
  return {
    views7d: n(sv.views7d),
    views28d: n(sv.views28d),
    views60d: n(sv.views60d),
    views365d,
    totalViews,
  };
}
