"use client";

import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { SyncScheduleConfig, SyncScheduleItem } from "@/features/schedule/ScheduleModal";

function getIanaTimezone(tzString: string): string {
  if (!tzString) return "Asia/Bangkok";
  if (tzString.includes("Asia/Bangkok")) return "Asia/Bangkok";
  if (tzString.includes("UTC")) return "UTC";
  if (tzString.includes("New_York") || tzString.includes("America/New_York")) return "America/New_York";
  if (tzString.includes("Europe/London") || tzString.includes("London")) return "Europe/London";
  if (tzString.includes("Singapore") || tzString.includes("Asia/Singapore")) return "Asia/Singapore";
  if (tzString.includes("Tokyo") || tzString.includes("Asia/Tokyo")) return "Asia/Tokyo";
  if (tzString.includes("Los_Angeles") || tzString.includes("America/Los_Angeles")) return "America/Los_Angeles";
  if (tzString.includes("Europe/Paris") || tzString.includes("Paris")) return "Europe/Paris";
  if (tzString.includes("Europe/Berlin") || tzString.includes("Berlin")) return "Europe/Berlin";
  return "Asia/Bangkok";
}

function getTimeInZone(date: Date, tz: string): { hour: number; minute: number; dateStr: string } {
  try {
    const iana = getIanaTimezone(tz);
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: iana,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(date);
    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;
    return {
      hour: parseInt(map.hour || "0", 10),
      minute: parseInt(map.minute || "0", 10),
      dateStr: `${map.year}-${map.month}-${map.day}`,
    };
  } catch {
    return {
      hour: date.getHours(),
      minute: date.getMinutes(),
      dateStr: date.toISOString().split("T")[0],
    };
  }
}

// Configurable initial page-load delay before running catch-up sync (default 10s)
const CATCHUP_DELAY_SECONDS = parseInt(
  process.env.NEXT_PUBLIC_AUTO_SYNC_CATCHUP_DELAY_SECONDS || "10",
  10
);

const CATCHUP_DELAY_MS =
  (!isNaN(CATCHUP_DELAY_SECONDS) && CATCHUP_DELAY_SECONDS >= 0 ? CATCHUP_DELAY_SECONDS : 10) * 1000;

// FIX: cross-tab coordination constants.
// LOCK_TTL_MS is the mutex window — one tab at a time per schedule.
// The lock is released on failure so another tick can retry.
const SCHEDULE_LOCK_TTL_MS = 60 * 1000;

function safeLocalStorageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function safeLocalStorageSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, value); } catch { }
}

function safeLocalStorageRemove(key: string): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(key); } catch { }
}

function scheduleDayKey(configKey: string, itemId: string, dateStr: string): string {
  return `ttf_sched_day_${configKey}_${itemId}_${dateStr}`;
}

function scheduleLockKey(configKey: string, itemId: string): string {
  return `ttf_sched_lock_${configKey}_${itemId}`;
}

/**
 * FIX: atomic-enough cross-tab mutex using localStorage.
 * Returns true if this tab acquired the lock, false if another tab holds it.
 * A stale lock (older than TTL) is treated as free so a crashed tab cannot
 * permanently suppress future fires.
 */
function tryAcquireScheduleLock(key: string): boolean {
  const now = Date.now();
  const raw = safeLocalStorageGet(key);
  if (raw) {
    const ts = Number(raw);
    if (Number.isFinite(ts) && now - ts < SCHEDULE_LOCK_TTL_MS) return false;
  }
  safeLocalStorageSet(key, String(now));
  return true;
}

export default function AutoSyncRunner() {
  const { data: configData } = trpc.settings.getAll.useQuery();
  const setConfigMutation = trpc.settings.set.useMutation();
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startupTimerRef = useRef<NodeJS.Timeout | null>(null);

  // FIX: prevent overlapping ticks when a fire takes longer than the interval.
  const tickInFlightRef = useRef(false);

  // FIX: one AbortController per configKey, so a new tick can cancel the previous
  // in-flight request instead of stacking fetches.
  const inFlightAbortsRef = useRef<Map<string, AbortController>>(new Map());

  useEffect(() => {
    if (!configData) return;

    const checkAndExecuteForSchedule = async (
      rawSchedule: SyncScheduleConfig | undefined,
      configKey: string,
      endpoint: string,
      description: string
    ) => {
      if (!rawSchedule) return;

      const isAutoOn = rawSchedule.autoEnabled ?? (rawSchedule.mode === "AUTO");
      if (!isAutoOn) return;

      let scheduleList: SyncScheduleItem[] = [];
      if (Array.isArray(rawSchedule.schedules) && rawSchedule.schedules.length > 0) {
        scheduleList = rawSchedule.schedules.filter((s) => s.enabled);
      } else if (rawSchedule.repeat) {
        scheduleList = [
          {
            id: "legacy_1",
            enabled: true,
            repeat: rawSchedule.repeat as any,
            intervalMinutes: rawSchedule.intervalMinutes || 30,
            timeOfDay: rawSchedule.timeOfDay || "17:00",
            startDate: rawSchedule.startDate || "",
            timezone: rawSchedule.timezone || "GMT+07:00, Asia/Bangkok",
            ends: rawSchedule.ends || "NEVER",
            endDate: rawSchedule.endDate || "",
            instructions: rawSchedule.instructions || "",
            lastRunAt: rawSchedule.lastRunAt,
            nextRunAt: rawSchedule.nextRunAt,
          },
        ];
      }

      if (scheduleList.length === 0) return;

      const now = new Date();
      let triggeredItem: SyncScheduleItem | null = null;
      let isCatchup = false;
      let triggeredDateStr = "";

      for (const item of scheduleList) {
        const tzInfo = getTimeInZone(now, item.timezone || "GMT+07:00, Asia/Bangkok");

        if (item.startDate && tzInfo.dateStr < item.startDate) continue;
        if (item.ends === "ON_DATE" && item.endDate && tzInfo.dateStr > item.endDate) continue;

        // FIX: per-browser per-day marker. Independent of the DB lastRunAt.
        // Once this browser has fired this schedule for this date, it will not
        // fire it again — regardless of what the DB row says.
        const itemId = item.id || "default";
        const dayKey = scheduleDayKey(configKey, itemId, tzInfo.dateStr);
        if (safeLocalStorageGet(dayKey) === "1") continue;

        let shouldRun = false;
        const lastRun = item.lastRunAt ? new Date(item.lastRunAt) : null;
        const lastRunTz = lastRun ? getTimeInZone(lastRun, item.timezone || "Asia/Bangkok") : null;
        const alreadyRanToday = lastRunTz?.dateStr === tzInfo.dateStr;

        if (item.repeat === "ONCE") {
          const [targetHour, targetMin] = (item.timeOfDay || "16:45").split(":").map(Number);
          const currentTotalMinutes = tzInfo.hour * 60 + tzInfo.minute;
          const targetTotalMinutes = targetHour * 60 + targetMin;
          if (
            !lastRun &&
            (!item.startDate || tzInfo.dateStr > item.startDate || (tzInfo.dateStr === item.startDate && currentTotalMinutes >= targetTotalMinutes))
          ) {
            shouldRun = true;
          }
        } else if (item.repeat === "DAILY" || item.repeat === "WEEKLY") {
          const [targetHour, targetMin] = (item.timeOfDay || "17:00").split(":").map(Number);
          const currentTotalMinutes = tzInfo.hour * 60 + tzInfo.minute;
          const targetTotalMinutes = targetHour * 60 + targetMin;

          if (!alreadyRanToday && currentTotalMinutes >= targetTotalMinutes) {
            shouldRun = true;
          }

          // Auto Catch-Up: If missed today or never run.
          // The sessionStorage marker from the original code is replaced by
          // the localStorage day marker above, which persists across tabs and
          // across reloads within the same browser.
          if (!alreadyRanToday && !shouldRun) {
            if (!lastRun) {
              shouldRun = true;
              isCatchup = true;
            } else if (lastRunTz && lastRunTz.dateStr < tzInfo.dateStr) {
              shouldRun = true;
              isCatchup = true;
            }
          }
        } else {
          let intervalMs = (item.intervalMinutes || 60) * 60 * 1000;
          if (item.repeat === "EVERY_15_MIN") intervalMs = 15 * 60 * 1000;
          else if (item.repeat === "EVERY_30_MIN") intervalMs = 30 * 60 * 1000;
          else if (item.repeat === "HOURLY") intervalMs = (item.everyCount || 1) * 60 * 60 * 1000;

          if (!lastRun || now.getTime() - lastRun.getTime() >= intervalMs) {
            shouldRun = true;
            if (!lastRun || (lastRunTz && lastRunTz.dateStr < tzInfo.dateStr)) {
              isCatchup = true;
            }
          }
        }

        if (shouldRun) {
          triggeredItem = item;
          triggeredDateStr = tzInfo.dateStr;
          break;
        }
      }

      if (!triggeredItem) return;

      const itemId = triggeredItem.id || "default";
      const lockKey = scheduleLockKey(configKey, itemId);

      // FIX: cross-tab mutex. Another tab of this browser already firing this
      // schedule → skip. This is what prevents N tabs from issuing N POSTs.
      if (!tryAcquireScheduleLock(lockKey)) {
        console.log(`[AutoSyncRunner] Another tab is already firing ${description} — skipping`);
        return;
      }

      // FIX: abort any prior in-flight request for this config, then start fresh.
      const prevAbort = inFlightAbortsRef.current.get(configKey);
      if (prevAbort) prevAbort.abort();
      const abort = new AbortController();
      inFlightAbortsRef.current.set(configKey, abort);

      try {
        console.log(`[AutoSyncRunner] Triggering ${description} (${isCatchup ? "CATCH-UP" : "SCHEDULED"})...`);
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isAutoSchedule: true, isCatchup }),
          signal: abort.signal,
        });

        // FIX: check HTTP status before trusting the response body.
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json().catch(() => ({}));
        if (json && json.success === false) {
          throw new Error(json.error || "Server rejected sync trigger");
        }

        // FIX: mark this browser as having fired this schedule for this date.
        // Set only after a successful response so a failed fire remains retryable.
        const dayKey = scheduleDayKey(configKey, itemId, triggeredDateStr);
        safeLocalStorageSet(dayKey, "1");

        // Update the server's lastRunAt so the UI and other clients converge.
        await setConfigMutation.mutateAsync({
          key: configKey,
          value: {
            ...rawSchedule,
            schedules: Array.isArray(rawSchedule.schedules)
              ? rawSchedule.schedules.map((s) =>
                s.id === triggeredItem!.id
                  ? { ...s, lastRunAt: now.toISOString() }
                  : s
              )
              : [{ ...triggeredItem, lastRunAt: now.toISOString() }],
            lastRunAt: now.toISOString(),
          },
          description,
        });

        window.dispatchEvent(new Event("refreshData"));
      } catch (err: any) {
        if (err?.name === "AbortError") {
          // Superseded by a newer tick or unmount — nothing to do.
          return;
        }
        console.warn(`[AutoSyncRunner] Failed executing ${description}:`, err?.message || err);
        // FIX: release the lock so the next tick can retry. The day marker is
        // NOT set, so the client will fire again on the next 30s tick.
        safeLocalStorageRemove(lockKey);
      } finally {
        if (inFlightAbortsRef.current.get(configKey) === abort) {
          inFlightAbortsRef.current.delete(configKey);
        }
      }
    };

    const checkAndExecuteSync = async () => {
      // FIX: no overlapping ticks. A slow fire (network delay, big fleet) must
      // not let the 30s interval spawn a second concurrent pass.
      if (tickInFlightRef.current) return;
      tickInFlightRef.current = true;
      try {
        const rawGpm = (configData["gpm_sync_schedule"] || configData["sync_schedule"]) as SyncScheduleConfig | undefined;
        await checkAndExecuteForSchedule(rawGpm, "gpm_sync_schedule", "/api/gpm/sync", "Lịch kiểm kê Profile GPM (Fleet Inventory)");

        const rawSweeper = configData["tiktok_sweeper_schedule"] as SyncScheduleConfig | undefined;
        await checkAndExecuteForSchedule(rawSweeper, "tiktok_sweeper_schedule", "/api/gpm/sweeper", "Lịch quét vét TikTok Studio ngầm (Deep Sweeper)");
      } finally {
        tickInFlightRef.current = false;
      }
    };

    startupTimerRef.current = setTimeout(() => {
      checkAndExecuteSync();
      syncTimerRef.current = setInterval(checkAndExecuteSync, 30000);
    }, CATCHUP_DELAY_MS);

    return () => {
      if (startupTimerRef.current) clearTimeout(startupTimerRef.current);
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
      // FIX: abort any in-flight fetches on unmount so navigation does not
      // leave orphan requests or trigger setState on an unmounted tree.
      for (const abort of inFlightAbortsRef.current.values()) abort.abort();
      inFlightAbortsRef.current.clear();
    };
  }, [configData, setConfigMutation]);

  return null;
}