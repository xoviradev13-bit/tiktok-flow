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

export default function AutoSyncRunner() {
  const { data: configData } = trpc.settings.getAll.useQuery();
  const setConfigMutation = trpc.settings.set.useMutation();
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!configData) return;

    const rawSchedule = configData["sync_schedule"] as SyncScheduleConfig | undefined;

    // Check if auto sync is enabled
    const isAutoOn = rawSchedule?.autoEnabled ?? (rawSchedule?.mode === "AUTO");
    if (!isAutoOn) {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
      return;
    }

    // Extract schedule items
    let scheduleList: SyncScheduleItem[] = [];
    if (Array.isArray(rawSchedule?.schedules) && rawSchedule.schedules.length > 0) {
      scheduleList = rawSchedule.schedules.filter((s) => s.enabled);
    } else if (rawSchedule?.repeat) {
      // Legacy single schedule format
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

    if (scheduleList.length === 0) {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
      return;
    }

    const checkAndExecuteSync = async () => {
      const now = new Date();
      let triggered = false;

      for (const item of scheduleList) {
        const tzInfo = getTimeInZone(now, item.timezone || "GMT+07:00, Asia/Bangkok");

        // Check start date in target timezone
        if (item.startDate && tzInfo.dateStr < item.startDate) {
          continue;
        }

        // Check end date in target timezone
        if (item.ends === "ON_DATE" && item.endDate && tzInfo.dateStr > item.endDate) {
          continue;
        }

        let shouldRun = false;
        const lastRun = item.lastRunAt ? new Date(item.lastRunAt) : null;

        if (item.repeat === "ONCE") {
          const [targetHour, targetMin] = (item.timeOfDay || "16:45").split(":").map(Number);
          if (
            !lastRun &&
            (!item.startDate || tzInfo.dateStr === item.startDate) &&
            tzInfo.hour === targetHour &&
            tzInfo.minute === targetMin
          ) {
            shouldRun = true;
          }
        } else if (item.repeat === "DAILY" || item.repeat === "WEEKLY") {
          const [targetHour, targetMin] = (item.timeOfDay || "17:00").split(":").map(Number);
          if (tzInfo.hour === targetHour && tzInfo.minute === targetMin) {
            if (!lastRun || now.getTime() - lastRun.getTime() > 60000) {
              shouldRun = true;
            }
          }
        } else {
          // Interval based (15 min, 30 min, 60 min, custom)
          let intervalMs = (item.intervalMinutes || 60) * 60 * 1000;
          if (item.repeat === "EVERY_15_MIN") intervalMs = 15 * 60 * 1000;
          else if (item.repeat === "EVERY_30_MIN") intervalMs = 30 * 60 * 1000;
          else if (item.repeat === "HOURLY") intervalMs = (item.everyCount || 1) * 60 * 60 * 1000;

          if (!lastRun || now.getTime() - lastRun.getTime() >= intervalMs) {
            shouldRun = true;
          }
        }

        if (shouldRun) {
          item.lastRunAt = now.toISOString();
          triggered = true;
          break; // Avoid firing multiple syncs at the exact same tick
        }
      }

      if (triggered) {
        try {
          console.log("[AutoSyncRunner] Triggering scheduled auto sync...");
          const res = await fetch("/api/gpm/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ syncAll: true, isAutoSchedule: true }),
          });
          const json = await res.json();
          if (json.success) {
            window.dispatchEvent(new Event("refreshData"));
          }

          // Update config in DB
          if (rawSchedule) {
            await setConfigMutation.mutateAsync({
              key: "sync_schedule",
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
              description: "Cấu hình lịch chạy tự động GPMLogin",
            });
          }
        } catch (err) {
          console.warn("[AutoSyncRunner] Scheduled sync failed:", err);
        }
      }
    };

    // Initial check
    checkAndExecuteSync();

    // Polling check every 30 seconds
    syncTimerRef.current = setInterval(checkAndExecuteSync, 30000);

    return () => {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    };
  }, [configData]);

  return null;
}
