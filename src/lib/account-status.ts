/**
 * Account online/offline state utilities.
 * An account is considered online if it was reported as logged in by the companion extension
 * and its heartbeat / last sync occurred within the allowed freshness window.
 */

export const ACCOUNT_ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export function isAccountOnline(
  account?: {
    isOnline?: boolean | null;
    lastSyncedAt?: Date | string | null;
  } | null,
  thresholdMs: number = ACCOUNT_ONLINE_THRESHOLD_MS
): boolean {
  if (!account || !account.isOnline || !account.lastSyncedAt) {
    return false;
  }
  const syncTime = new Date(account.lastSyncedAt).getTime();
  if (Number.isNaN(syncTime)) return false;
  return Date.now() - syncTime <= thresholdMs;
}

export function getOnlineCutoffDate(thresholdMs: number = ACCOUNT_ONLINE_THRESHOLD_MS): Date {
  return new Date(Date.now() - thresholdMs);
}
