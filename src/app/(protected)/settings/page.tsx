"use client";

import { useEffect, useState } from "react";
import {
  Settings,
  Bot,
  Plus,
  Calendar,
  Zap,
  RefreshCw,
  Trash2,
  Pencil,
  Sparkles,
  Check,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import ScheduleModal, {
  SyncScheduleConfig,
  SyncScheduleItem,
} from "@/features/schedule/ScheduleModal";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function SettingsPage() {
  const [config, setConfig] = useState<any>({
    gpmConfig: {
      baseUrl: "http://localhost:9495/api/v1",
      autoSyncTime: "09:00",
      enabled: true,
    },
  });

  const [syncSchedule, setSyncSchedule] = useState<SyncScheduleConfig>({
    autoEnabled: false,
    schedules: [],
  });

  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SyncScheduleItem | null>(null);
  const [manualSyncing, setManualSyncing] = useState(false);
  const [gpmSaveStatus, setGpmSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: configData } = trpc.settings.getAll.useQuery();
  const setConfigMutation = trpc.settings.set.useMutation();

  useEffect(() => {
    if (configData) {
      setConfig({
        gpmConfig: configData["gpm_config"] || config.gpmConfig,
      });

      const rawSchedule = configData["sync_schedule"];
      if (rawSchedule) {
        let schedules: SyncScheduleItem[] = [];
        if (Array.isArray(rawSchedule.schedules)) {
          schedules = rawSchedule.schedules;
        } else if (rawSchedule.repeat) {
          // Migrate legacy single schedule format
          schedules = [
            {
              id: "sch_1",
              enabled: true,
              repeat: rawSchedule.repeat || "HOURLY",
              intervalMinutes: rawSchedule.intervalMinutes || 60,
              timeOfDay: rawSchedule.timeOfDay || "17:00",
              startDate: rawSchedule.startDate || new Date().toISOString().split("T")[0],
              timezone: rawSchedule.timezone || "GMT+07:00, Asia/Bangkok",
              ends: rawSchedule.ends || "NEVER",
              endDate: rawSchedule.endDate || "",
              instructions: rawSchedule.instructions || "",
              lastRunAt: rawSchedule.lastRunAt,
              nextRunAt: rawSchedule.nextRunAt,
            },
          ];
        }

        setSyncSchedule({
          autoEnabled: rawSchedule.autoEnabled ?? (rawSchedule.mode === "AUTO"),
          schedules,
        });
      }
    }
  }, [configData]);

  // Persist GPM Config automatically
  const persistGpmConfig = async (newGpmConfig: any) => {
    try {
      setGpmSaveStatus("saving");
      await setConfigMutation.mutateAsync({
        key: "gpm_config",
        value: newGpmConfig,
        description: "Cấu hình GPMLogin Local API",
      });
      utils.settings.getAll.invalidate();
      setGpmSaveStatus("saved");
      setTimeout(() => setGpmSaveStatus("idle"), 2500);
    } catch (err: any) {
      console.error("Error persisting GPM config:", err);
      setGpmSaveStatus("idle");
      setSaveMsg(`❌ Lỗi lưu cấu hình: ${err.message}`);
      setTimeout(() => setSaveMsg(null), 4000);
    }
  };

  // Persist schedule changes immediately
  const persistSchedule = async (updatedConfig: SyncScheduleConfig) => {
    setSyncSchedule(updatedConfig);
    try {
      await setConfigMutation.mutateAsync({
        key: "sync_schedule",
        value: {
          ...updatedConfig,
          mode: updatedConfig.autoEnabled ? "AUTO" : "MANUAL",
        },
        description: "Cấu hình lịch chạy tự động GPMLogin",
      });
      utils.settings.getAll.invalidate();
    } catch (err: any) {
      console.error("Error persisting schedule:", err);
    }
  };

  // Toggle Auto Sync ON/OFF
  const handleToggleAutoSync = (checked: boolean) => {
    const updated = {
      ...syncSchedule,
      autoEnabled: checked,
    };
    persistSchedule(updated);
    if (checked) {
      setSaveMsg("✅ Đã bật chế độ Đồng bộ hóa tự động.");
    } else {
      setSaveMsg("ℹ️ Đã tắt chế độ Đồng bộ hóa tự động.");
    }
    setTimeout(() => setSaveMsg(null), 3500);
  };

  // Toggle a specific schedule item ON/OFF
  const handleToggleScheduleItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedSchedules = syncSchedule.schedules.map((item) =>
      item.id === id ? { ...item, enabled: !item.enabled } : item
    );
    const updated = { ...syncSchedule, schedules: updatedSchedules };
    persistSchedule(updated);
  };

  // Delete a schedule item
  const handleDeleteScheduleItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedSchedules = syncSchedule.schedules.filter((item) => item.id !== id);
    const updated = { ...syncSchedule, schedules: updatedSchedules };
    persistSchedule(updated);
    setSaveMsg("🗑️ Đã xóa lịch trình thành công.");
    setTimeout(() => setSaveMsg(null), 3000);
  };

  // Save item from modal (Add or Edit)
  const handleSaveScheduleItem = async (savedItem: SyncScheduleItem) => {
    let updatedSchedules: SyncScheduleItem[];
    const exists = syncSchedule.schedules.some((s) => s.id === savedItem.id);
    if (exists) {
      updatedSchedules = syncSchedule.schedules.map((s) =>
        s.id === savedItem.id ? savedItem : s
      );
    } else {
      updatedSchedules = [...syncSchedule.schedules, savedItem];
    }

    const updated: SyncScheduleConfig = {
      ...syncSchedule,
      autoEnabled: true, // Ensure auto is on when a schedule is added
      schedules: updatedSchedules,
    };

    await persistSchedule(updated);
    setSaveMsg("✅ Đã lưu lịch trình thành công!");
    setTimeout(() => setSaveMsg(null), 4000);
  };

  // Manual Trigger Run
  const handleManualRun = async () => {
    try {
      setManualSyncing(true);
      setSaveMsg("⏳ Đang thực hiện đồng bộ toàn bộ profile từ GPMLogin...");
      const res = await fetch("/api/gpm/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncAll: true, manual: true }),
      });
      const json = await res.json();
      if (json.success) {
        setSaveMsg(`✅ ${json.message}`);
        window.dispatchEvent(new Event("refreshData"));
      } else {
        setSaveMsg(`❌ ${json.error || "Lỗi đồng bộ"}`);
      }
    } catch (err: any) {
      setSaveMsg(`❌ Lỗi: ${err.message}`);
    } finally {
      setManualSyncing(false);
      setTimeout(() => setSaveMsg(null), 5000);
    }
  };

  // Format 24h time to 12h string for display
  const formatTime12h = (time24?: string) => {
    if (!time24) return "5:00 PM";
    const [h, m] = time24.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 || 12;
    return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
  };

  // Format schedule text for listing
  const getScheduleLabel = (item: SyncScheduleItem) => {
    const timeFormatted = formatTime12h(item.timeOfDay || "16:45");
    if (item.repeat === "ONCE") {
      return `Một lần lúc ${timeFormatted} ngày ${item.startDate || "hôm nay"}`;
    }
    if (item.repeat === "HOURLY") {
      const count = item.everyCount || 1;
      return count === 1 ? `Hàng giờ lúc ${timeFormatted}` : `Mỗi ${count} giờ lúc ${timeFormatted}`;
    }
    if (item.repeat === "DAILY") {
      const count = item.everyCount || 1;
      return count === 1 ? `Hàng ngày lúc ${timeFormatted}` : `Mỗi ${count} ngày lúc ${timeFormatted}`;
    }
    if (item.repeat === "EVERY_15_MIN") return `Mỗi 15 phút`;
    if (item.repeat === "EVERY_30_MIN") return `Mỗi 30 phút`;
    if (item.repeat === "WEEKLY") return `Hàng tuần lúc ${timeFormatted}`;
    if (item.repeat === "CUSTOM") return `Mỗi ${item.intervalMinutes || 60} phút`;
    return `Lịch lúc ${timeFormatted}`;
  };

  return (
    <div className="space-y-8 animate-fadeIn max-w-5xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-pink-500/10 dark:bg-pink-500/20 text-pink-500 flex items-center justify-center">
              <Settings className="w-4 h-4" />
            </div>
            <span>Cấu Hình Hệ Thống & Tự Động Hóa</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Tùy chỉnh kết nối GPMLogin, thiết lập lịch trình đồng bộ tự động và thông số hệ thống.
          </p>
        </div>

        {/* Auto-save badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-[11px] font-medium text-slate-600 dark:text-slate-400">
          <Sparkles className="w-3.5 h-3.5 text-purple-500" />
          <span>Tự động lưu thay đổi</span>
        </div>
      </div>

      {saveMsg && (
        <div className="p-3.5 rounded-2xl bg-cyan-50 dark:bg-slate-900 border border-cyan-200 dark:border-slate-800 text-xs font-bold text-center text-cyan-800 dark:text-cyan-300 shadow-sm animate-in fade-in duration-200">
          {saveMsg}
        </div>
      )}

      {/* Main Settings Sections */}
      <div className="space-y-6">
        {/* Card 1: GPM-Login Connection */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/80">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Bot className="w-4 h-4 text-cyan-500" />
                Cổng Kết Nối GPMLogin Local API
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Địa chỉ Endpoint GPMLogin chạy trên máy cục bộ (Mặc định Port 9495)
              </p>
            </div>

            <button
              type="button"
              onClick={handleManualRun}
              disabled={manualSyncing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/40 dark:hover:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 transition-all cursor-pointer disabled:opacity-60 shrink-0 self-start sm:self-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${manualSyncing ? "animate-spin" : ""}`} />
              <span>{manualSyncing ? "Đang Đồng Bộ..." : "Đồng Bộ Ngay (Run Now)"}</span>
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                GPM Base URL
              </label>
              {gpmSaveStatus === "saving" && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500 animate-in fade-in">
                  <RefreshCw className="w-3 h-3 animate-spin text-pink-500" />
                  <span>Đang lưu...</span>
                </span>
              )}
              {gpmSaveStatus === "saved" && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 animate-in fade-in">
                  <Check className="w-3.5 h-3.5" />
                  <span>Đã lưu</span>
                </span>
              )}
            </div>
            <input
              type="text"
              value={config.gpmConfig?.baseUrl ?? "http://localhost:9495/api/v1"}
              onChange={(e) =>
                setConfig({
                  ...config,
                  gpmConfig: { ...config.gpmConfig, baseUrl: e.target.value },
                })
              }
              onBlur={() => {
                if (config.gpmConfig) {
                  persistGpmConfig(config.gpmConfig);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder="http://localhost:9495/api/v1"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-2.5 text-xs font-mono text-cyan-700 dark:text-cyan-300 focus:outline-none focus:border-pink-500 transition-colors"
            />
          </div>
        </div>

        {/* Card 2: Phương thức đồng bộ hóa (2 lines: Thủ công & Tự động) */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              Phương Thức Đồng Bộ Hóa Dữ Liệu
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Lựa chọn hình thức cập nhật số liệu TikTok từ GPMLogin
            </p>
          </div>

          <div className="space-y-4 divide-y divide-slate-100 dark:divide-slate-800/80">
            {/* Line 1: Đồng bộ hóa thủ công */}
            <div className="pt-2 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>Đồng bộ hóa thủ công</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Cho phép thực hiện quét và cập nhật số liệu ngay lập tức bất cứ lúc nào khi nhấn nút đồng bộ.
                </p>
              </div>

              {/* Disabled Switch with Tooltip */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="relative inline-flex items-center cursor-not-allowed">
                    <button
                      type="button"
                      disabled
                      aria-label="Đồng bộ hóa thủ công"
                      className="w-11 h-6 bg-purple-600 rounded-full p-0.5 transition-colors focus:outline-none opacity-80 cursor-not-allowed"
                    >
                      <span className="block w-5 h-5 bg-white rounded-full shadow-md transform translate-x-5 transition-transform" />
                    </button>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-center font-medium">
                  Đồng bộ hóa thủ công đảm bảo dữ liệu cập nhật mới nhất
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Line 2: Đồng bộ hóa tự động */}
            <div className="pt-4 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>Đồng bộ hóa tự động</span>
                  {syncSchedule.autoEnabled && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
                      Đang bật
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Tự động kích hoạt đồng bộ dữ liệu ngầm theo các khung giờ hoặc chu kỳ định kỳ đã thiết lập.
                </p>
              </div>

              {/* Interactive Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={syncSchedule.autoEnabled}
                onClick={() => handleToggleAutoSync(!syncSchedule.autoEnabled)}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors focus:outline-none cursor-pointer ${
                  syncSchedule.autoEnabled
                    ? "bg-purple-600"
                    : "bg-slate-300 dark:bg-slate-700"
                }`}
              >
                <span
                  className={`block w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
                    syncSchedule.autoEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Sub-section: Lịch trình đã lên lịch (Shown when Đồng bộ hóa tự động is ON) */}
          {syncSchedule.autoEnabled && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 space-y-3 animate-in fade-in duration-300">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Danh sách lịch trình {syncSchedule.schedules.length > 0 ? `(${syncSchedule.schedules.length})` : ""}
                </h3>
              </div>

              {/* Case 1: Empty Card */}
              {syncSchedule.schedules.length === 0 ? (
                <div className="relative border border-slate-200 dark:border-slate-800 rounded-2xl p-8 bg-slate-50/60 dark:bg-slate-950/40 text-center flex flex-col items-center justify-center space-y-3">
                  <div className="w-10 h-10 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-center text-slate-600 dark:text-slate-400">
                    <Calendar className="w-5 h-5" />
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm">
                    Chạy đồng bộ theo chu kỳ hàng giờ, hàng ngày, hàng tuần hoặc tùy chỉnh
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingItem(null);
                      setIsScheduleModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700/80 transition-all cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm lịch trình</span>
                  </button>
                </div>
              ) : (
                /* Case 2: Schedule List */
                <div className="space-y-2">
                  <div className="space-y-1.5">
                    {syncSchedule.schedules.map((item) => (
                      <div
                        key={item.id}
                        className="group flex items-center justify-between p-3.5 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-950/80 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-800"
                      >
                        {/* Left: Calendar Icon + Title */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                            <Calendar className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                              {getScheduleLabel(item)}
                            </div>
                            {item.instructions && (
                              <div className="text-[11px] text-slate-400 truncate max-w-md">
                                {item.instructions}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right: Actions on hover & Toggle Switch */}
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Hover Action Icons (Only show on hover) */}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                            {/* Edit Icon Button with Tooltip */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingItem(item);
                                    setIsScheduleModalOpen(true);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950/30 transition-colors cursor-pointer"
                                  aria-label="Chỉnh sửa lịch trình"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="font-semibold text-[11px]">
                                Chỉnh sửa lịch trình
                              </TooltipContent>
                            </Tooltip>

                            {/* Delete Trash Button with Tooltip */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteScheduleItem(item.id, e)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                                  aria-label="Xóa lịch trình"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="font-semibold text-[11px]">
                                Xóa lịch trình
                              </TooltipContent>
                            </Tooltip>
                          </div>

                          {/* Switch for this schedule item (Always visible) */}
                          <button
                            type="button"
                            role="switch"
                            aria-checked={item.enabled}
                            onClick={(e) => handleToggleScheduleItem(item.id, e)}
                            className={`w-10 h-5.5 rounded-full p-0.5 transition-colors focus:outline-none cursor-pointer ${
                              item.enabled
                                ? "bg-purple-600"
                                : "bg-slate-300 dark:bg-slate-700"
                            }`}
                          >
                            <span
                              className={`block w-4.5 h-4.5 bg-white rounded-full shadow-sm transform transition-transform ${
                                item.enabled ? "translate-x-4.5" : "translate-x-0"
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add schedule button below list */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingItem(null);
                        setIsScheduleModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700/80 transition-all cursor-pointer shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm lịch trình</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Schedule Modal in 100% Vietnamese */}
      <ScheduleModal
        isOpen={isScheduleModalOpen}
        onClose={() => {
          setIsScheduleModalOpen(false);
          setEditingItem(null);
        }}
        initialItem={editingItem}
        onSave={handleSaveScheduleItem}
      />
    </div>
  );
}
