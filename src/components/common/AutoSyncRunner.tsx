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

export default function AutoSyncRunner() {
  const { data: configData } = trpc.settings.getAll.useQuery();
  const setConfigMutation = trpc.settings.set.useMutation();
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startupTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!configData) return;

    // Helper to evaluate and trigger a single schedule configuration
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
      let triggered = false;
      let isCatchup = false;

      for (const item of scheduleList) {
        const tzInfo = getTimeInZone(now, item.timezone || "GMT+07:00, Asia/Bangkok");

        if (item.startDate && tzInfo.dateStr < item.startDate) continue;
        if (item.ends === "ON_DATE" && item.endDate && tzInfo.dateStr > item.endDate) continue;

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

          // Auto Catch-Up: If missed today or never run
          if (!alreadyRanToday && !shouldRun) {
            if (!lastRun) {
              shouldRun = true;
              isCatchup = true;
            } else if (lastRunTz && lastRunTz.dateStr < tzInfo.dateStr) {
              const sessionKey = `ttf_catchup_${configKey}_${tzInfo.dateStr}_${item.id}`;
              const alreadyCaughtUp = typeof window !== "undefined" && window.sessionStorage.getItem(sessionKey);
              if (!alreadyCaughtUp) {
                shouldRun = true;
                isCatchup = true;
                if (typeof window !== "undefined") {
                  window.sessionStorage.setItem(sessionKey, "true");
                }
              }
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
          item.lastRunAt = now.toISOString();
          triggered = true;
          break;
        }
      }

      if (triggered) {
        try {
          console.log(`[AutoSyncRunner] Triggering ${description} (${isCatchup ? "CATCH-UP" : "SCHEDULED"})...`);
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isAutoSchedule: true, isCatchup }),
          });
          const json = await res.json();
          if (json.success) {
            window.dispatchEvent(new Event("refreshData"));
          }

          // Update config in DB
          await setConfigMutation.mutateAsync({
            key: configKey,
            value: {
              ...rawSchedule,
              schedules: Array.isArray(rawSchedule.schedules)
                ? rawSchedule.schedules.map((s) => {
                    const updated = scheduleList.find((item) => item.id === s.id);
                    return updated ? { ...s, lastRunAt: updated.lastRunAt } : s;
                  })
                : scheduleList,
              lastRunAt: now.toISOString(),
            },
            description,
          });
        } catch (err) {
          console.warn(`[AutoSyncRunner] Failed executing ${description}:`, err);
        }
      }
    };

    const checkAndExecuteSync = async () => {
      // 1. GPM Fleet Inventory Schedule (fallback to sync_schedule)
      const rawGpm = (configData["gpm_sync_schedule"] || configData["sync_schedule"]) as SyncScheduleConfig | undefined;
      await checkAndExecuteForSchedule(rawGpm, "gpm_sync_schedule", "/api/gpm/sync", "Lịch kiểm kê Profile GPM (Fleet Inventory)");

      // 2. TikTok Studio Deep Sweeper Schedule
      const rawSweeper = configData["tiktok_sweeper_schedule"] as SyncScheduleConfig | undefined;
      await checkAndExecuteForSchedule(rawSweeper, "tiktok_sweeper_schedule", "/api/gpm/sweeper", "Lịch quét vét TikTok Studio ngầm (Deep Sweeper)");
    };

    startupTimerRef.current = setTimeout(() => {
      checkAndExecuteSync();
      syncTimerRef.current = setInterval(checkAndExecuteSync, 30000);
    }, CATCHUP_DELAY_MS);

    return () => {
      if (startupTimerRef.current) clearTimeout(startupTimerRef.current);
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    };
  }, [configData]);

  return null;
}
