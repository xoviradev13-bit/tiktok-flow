export type InsightsUiState = "unsynced" | "stale" | "synced" | "synced_empty";

/**
 * UI precedence: latest insightsStatus / needsRepair first;
 * confirmed marker only for written | no_data (via status fields).
 */
export function getInsightsUiState(
  snap: Record<string, any> | null | undefined,
  hasSums: boolean
): InsightsUiState {
  const st = snap?.insightsStatus;
  if (st === "skipped_empty" || snap?.insightsNeedsRepair === true) return "unsynced";
  if (st === "skipped_stale") return hasSums ? "stale" : "unsynced";
  if (st === "written") return "synced";
  if (st === "no_data") return hasSums ? "synced" : "synced_empty";
  return hasSums ? "synced" : "unsynced";
}

/** Structured agent job summary (summaryVersion === 1). Anything else => legacy text. */
export function parseSyncSummary(raw: unknown): Record<string, any> | null {
  if (typeof raw !== "string") return null;
  try {
    const j = JSON.parse(raw);
    return j?.summaryVersion === 1 ? j : null;
  } catch {
    return null;
  }
}

/**
 * Contribution of one account's Insights views to a fleet sum.
 * unsynced → exclude (null); synced_empty → 0; else → numeric value.
 */
export function insightViewsContribution(
  analytics: Record<string, any> | null | undefined,
  fallbackViews: number,
  read: (sumViews: any, analytics: any) => number
): number | null {
  if (!analytics) return null;
  const snap = (analytics.rawSnapshot as Record<string, any>) ?? {};
  const hasSums = analytics.sumViews != null;
  const state = getInsightsUiState(snap, hasSums);
  if (state === "unsynced") return null;
  if (state === "synced_empty") return 0;
  const n = read(analytics.sumViews, analytics);
  if (!Number.isFinite(n)) return fallbackViews;
  return n;
}
