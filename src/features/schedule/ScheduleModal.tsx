"use client";

import { useState, useEffect } from "react";
import { X, Clock, Calendar, Sparkles, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface DatePickerFieldProps {
  value?: string; // "YYYY-MM-DD"
  onChange: (value: string) => void;
  placeholder?: string;
}

function DatePickerField({
  value,
  onChange,
  placeholder = "Chọn ngày",
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);

  const parsedDate = value ? new Date(value + "T00:00:00") : undefined;
  const isValidDate = parsedDate && !isNaN(parsedDate.getTime());

  const displayString = isValidDate
    ? `${String(parsedDate.getDate()).padStart(2, "0")}/${String(parsedDate.getMonth() + 1).padStart(2, "0")}/${parsedDate.getFullYear()}`
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center justify-between rounded-xl h-10 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3.5 py-2 text-sm font-normal text-slate-900 dark:text-slate-100 shadow-xs transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
        >
          <span>{displayString}</span>
          <ChevronDown
            className={cn(
              "size-4 opacity-50 text-slate-500 shrink-0 transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-2 z-[350] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl"
      >
        <CalendarPicker
          mode="single"
          selected={isValidDate ? parsedDate : undefined}
          onSelect={(selected) => {
            if (selected) {
              const yyyy = selected.getFullYear();
              const mm = String(selected.getMonth() + 1).padStart(2, "0");
              const dd = String(selected.getDate()).padStart(2, "0");
              onChange(`${yyyy}-${mm}-${dd}`);
              setOpen(false);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export interface SyncScheduleItem {
  id: string;
  enabled: boolean;
  repeat: "ONCE" | "HOURLY" | "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM" | "EVERY_15_MIN" | "EVERY_30_MIN";
  everyCount?: number;
  everyUnit?: "HOUR" | "DAY" | "WEEK" | "MINUTE";
  intervalMinutes: number;
  timeOfDay: string; // "16:45"
  startDate: string; // "YYYY-MM-DD"
  startTime?: string;
  timezone: string;
  ends: "NEVER" | "ON_DATE";
  endDate?: string;
  endTime?: string;
  instructions?: string;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
}

export interface SyncScheduleConfig {
  autoEnabled: boolean;
  schedules: SyncScheduleItem[];
  mode?: "AUTO" | "MANUAL";
  repeat?: any;
  intervalMinutes?: number;
  timeOfDay?: string;
  startDate?: string;
  startTime?: string;
  timezone?: string;
  ends?: "NEVER" | "ON_DATE";
  endDate?: string;
  endTime?: string;
  instructions?: string;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
}

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialItem?: SyncScheduleItem | null;
  onSave: (item: SyncScheduleItem) => Promise<void>;
  title?: string;
  description?: string;
}

// 15-minute intervals across 24 hours
const TIME_OPTIONS = Array.from({ length: 96 }).map((_, i) => {
  const totalMinutes = i * 15;
  const h24 = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const time24 = `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const period = h24 >= 12 ? "pm" : "am";
  const h12 = h24 % 12 || 12;
  const label = `${h12}:${String(m).padStart(2, "0")} ${period}`;
  return { value: time24, label };
});

export default function ScheduleModal({
  isOpen,
  onClose,
  initialItem,
  onSave,
  title,
  description,
}: ScheduleModalProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);

  const [item, setItem] = useState<SyncScheduleItem>({
    id: "",
    enabled: true,
    repeat: "HOURLY",
    everyCount: 1,
    everyUnit: "HOUR",
    intervalMinutes: 60,
    timeOfDay: "16:45",
    startDate: new Date().toISOString().split("T")[0],
    timezone: "GMT+07:00, Asia/Bangkok",
    ends: "NEVER",
    endDate: new Date().toISOString().split("T")[0],
    instructions: "",
    lastRunAt: null,
    nextRunAt: null,
  });

  useEffect(() => {
    if (initialItem) {
      setItem({
        ...initialItem,
        everyCount: initialItem.everyCount || 1,
        everyUnit:
          initialItem.everyUnit ||
          (initialItem.repeat === "DAILY"
            ? "DAY"
            : initialItem.repeat === "WEEKLY"
              ? "WEEK"
              : "HOUR"),
      });
    } else {
      setItem({
        id: "sch_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
        enabled: true,
        repeat: "HOURLY",
        everyCount: 1,
        everyUnit: "HOUR",
        intervalMinutes: 60,
        timeOfDay: "16:45",
        startDate: new Date().toISOString().split("T")[0],
        timezone: "GMT+07:00, Asia/Bangkok",
        ends: "NEVER",
        endDate: new Date().toISOString().split("T")[0],
        instructions: "",
        lastRunAt: null,
        nextRunAt: null,
      });
    }
  }, [initialItem, isOpen]);

  const handleSave = async () => {
    try {
      setSaving(true);
      let calculatedInterval = item.intervalMinutes || 60;
      if (item.repeat === "HOURLY") {
        calculatedInterval = (item.everyCount || 1) * 60;
      } else if (item.repeat === "EVERY_15_MIN") {
        calculatedInterval = 15;
      } else if (item.repeat === "EVERY_30_MIN") {
        calculatedInterval = 30;
      }

      await onSave({
        ...item,
        intervalMinutes: calculatedInterval,
      });
      onClose();
    } catch (err: any) {
      alert(err.message || "Lỗi lưu lịch trình");
    } finally {
      setSaving(false);
    }
  };

  // Format 24h to 12h AM/PM for display
  const formatTime12h = (time24: string) => {
    if (!time24) return "4:45 pm";
    const [h, m] = time24.split(":").map(Number);
    const period = h >= 12 ? "pm" : "am";
    const hour12 = h % 12 || 12;
    return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
  };

  // Generate summary text in Vietnamese
  const getSummaryText = () => {
    const timeFormatted = formatTime12h(item.timeOfDay || "16:45");
    if (item.repeat === "ONCE") {
      return `Chạy 1 lần duy nhất vào lúc ${timeFormatted} ngày ${item.startDate || "hôm nay"}`;
    }
    if (item.repeat === "HOURLY") {
      const count = item.everyCount || 1;
      return count === 1
        ? `Mỗi 1 giờ vào lúc ${timeFormatted}`
        : `Mỗi ${count} giờ vào lúc ${timeFormatted}`;
    }
    if (item.repeat === "DAILY") {
      const count = item.everyCount || 1;
      return count === 1
        ? `Hàng ngày vào lúc ${timeFormatted}`
        : `Mỗi ${count} ngày vào lúc ${timeFormatted}`;
    }
    if (item.repeat === "EVERY_15_MIN") {
      return `Mỗi 15 phút`;
    }
    if (item.repeat === "EVERY_30_MIN") {
      return `Mỗi 30 phút`;
    }
    if (item.repeat === "WEEKLY") {
      return `Hàng tuần vào lúc ${timeFormatted}`;
    }
    if (item.repeat === "CUSTOM") {
      return `Mỗi ${item.intervalMinutes || 60} phút`;
    }
    return `Lịch trình tự động`;
  };

  const timeOptions = (() => {
    const current = item.timeOfDay;
    if (current && !TIME_OPTIONS.some((o) => o.value === current)) {
      const [h, m] = current.split(":").map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        const period = h >= 12 ? "pm" : "am";
        const h12 = h % 12 || 12;
        const label = `${h12}:${String(m).padStart(2, "0")} ${period}`;
        const list = [...TIME_OPTIONS, { value: current, label }];
        return list.sort((a, b) => a.value.localeCompare(b.value));
      }
    }
    return TIME_OPTIONS;
  })();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-md w-full rounded-3xl p-0 gap-0 border border-slate-200 dark:border-slate-800 shadow-2xl bg-white dark:bg-slate-900 overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between">
          <div className="space-y-0.5">
            <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
              {initialItem
                ? title
                  ? `Chỉnh sửa: ${title}`
                  : "Chỉnh sửa lịch trình"
                : title || "Thêm lịch trình đồng bộ"}
            </DialogTitle>
            {description && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer shrink-0 ml-2"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="px-6 pt-3.5 pb-6 space-y-4 max-h-[72vh] overflow-y-auto custom-scrollbar">
          {/* Repeat */}
          <div>
            <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-2">
              Tần suất lặp lại
            </Label>
            <Select
              value={item.repeat}
              onValueChange={(val) => {
                setItem({
                  ...item,
                  repeat: val as any,
                  everyUnit: val === "DAILY" ? "DAY" : val === "WEEKLY" ? "WEEK" : "HOUR",
                });
              }}
            >
              <SelectTrigger className="w-full rounded-xl h-10 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-sm font-normal focus:ring-purple-500">
                <SelectValue placeholder="Chọn tần suất lặp lại" />
              </SelectTrigger>
              <SelectContent className="z-[300]">
                <SelectItem value="HOURLY" className="cursor-pointer">Mỗi giờ (Hourly)</SelectItem>
                <SelectItem value="DAILY" className="cursor-pointer">Hàng ngày (Daily)</SelectItem>
                <SelectItem value="ONCE" className="cursor-pointer">Một lần duy nhất (Once)</SelectItem>
                <SelectItem value="EVERY_30_MIN" className="cursor-pointer">Mỗi 30 phút</SelectItem>
                <SelectItem value="EVERY_15_MIN" className="cursor-pointer">Mỗi 15 phút</SelectItem>
                <SelectItem value="WEEKLY" className="cursor-pointer">Hàng tuần (Weekly)</SelectItem>
                <SelectItem value="CUSTOM" className="cursor-pointer">Tùy chỉnh số phút</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Every Field (When Hourly, Daily, Weekly, Custom) */}
          {item.repeat === "HOURLY" ? (
            <div>
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-2">
                Chu kỳ (Mỗi)
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={item.everyCount ?? 1}
                  onChange={(e) =>
                    setItem({
                      ...item,
                      everyCount: Math.max(1, parseInt(e.target.value, 10) || 1),
                    })
                  }
                  className="rounded-xl h-10 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-center text-sm font-normal focus-visible:ring-purple-500"
                />
                <div className="flex items-center px-4 h-10 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-normal text-slate-700 dark:text-slate-300">
                  {item.everyCount && item.everyCount > 1 ? "Giờ" : "Giờ"}
                </div>
              </div>
            </div>
          ) : item.repeat === "DAILY" ? (
            <div>
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-2">
                Chu kỳ (Mỗi)
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={item.everyCount ?? 1}
                  onChange={(e) =>
                    setItem({
                      ...item,
                      everyCount: Math.max(1, parseInt(e.target.value, 10) || 1),
                    })
                  }
                  className="rounded-xl h-10 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-center text-sm font-normal focus-visible:ring-purple-500"
                />
                <div className="flex items-center px-4 h-10 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-normal text-slate-700 dark:text-slate-300">
                  {item.everyCount && item.everyCount > 1 ? "Ngày" : "Ngày"}
                </div>
              </div>
            </div>
          ) : item.repeat === "CUSTOM" ? (
            <div>
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-2">
                Chu kỳ (Mỗi)
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={item.intervalMinutes || 60}
                  onChange={(e) =>
                    setItem({
                      ...item,
                      intervalMinutes: parseInt(e.target.value, 10) || 60,
                    })
                  }
                  className="rounded-xl h-10 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-center text-sm font-normal focus-visible:ring-purple-500"
                />
                <div className="flex items-center px-4 h-10 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-normal text-slate-700 dark:text-slate-300">
                  Phút
                </div>
              </div>
            </div>
          ) : null}

          {/* At (Time dropdown) */}
          <div>
            <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-2">
              Vào lúc
            </Label>
            <Select
              value={item.timeOfDay || "16:45"}
              onValueChange={(val) => setItem({ ...item, timeOfDay: val })}
            >
              <SelectTrigger className="w-full rounded-xl h-10 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-sm font-normal focus:ring-purple-500">
                <SelectValue placeholder="Chọn thời gian">
                  {formatTime12h(item.timeOfDay || "16:45")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="z-[350]">
                {timeOptions.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    className="cursor-pointer py-2 text-sm font-normal"
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Starts */}
          <div>
            <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-2">
              Ngày bắt đầu
            </Label>
            <DatePickerField
              value={item.startDate || new Date().toISOString().split("T")[0]}
              onChange={(dateStr) => setItem({ ...item, startDate: dateStr })}
              placeholder="Chọn ngày bắt đầu"
            />
          </div>

          {/* Advanced Link */}
          <div className="flex justify-end pt-0.5">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 underline underline-offset-4 cursor-pointer font-medium"
            >
              {showAdvanced ? "Ẩn cài đặt nâng cao" : "Cài đặt nâng cao"}
            </button>
          </div>

          {/* Advanced Section */}
          {showAdvanced && (
            <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800 animate-in fade-in duration-200">
              {/* Timezone */}
              <div>
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-2">
                  Múi giờ
                </Label>
                <Select
                  value={item.timezone}
                  onValueChange={(val) => setItem({ ...item, timezone: val })}
                >
                  <SelectTrigger className="w-full rounded-xl h-10 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-sm font-normal focus:ring-purple-500">
                    <SelectValue placeholder="Chọn múi giờ" />
                  </SelectTrigger>
                  <SelectContent className="z-[300]">
                    <SelectItem value="GMT+07:00, Asia/Bangkok">GMT+07:00, Asia/Bangkok (Việt Nam)</SelectItem>
                    <SelectItem value="GMT+00:00, UTC">GMT+00:00, UTC</SelectItem>
                    <SelectItem value="GMT-05:00, America/New_York">GMT-05:00, America/New_York</SelectItem>
                    <SelectItem value="GMT-08:00, America/Los_Angeles">GMT-08:00, America/Los_Angeles</SelectItem>
                    <SelectItem value="GMT+08:00, Asia/Singapore">GMT+08:00, Asia/Singapore</SelectItem>
                    <SelectItem value="GMT+09:00, Asia/Tokyo">GMT+09:00, Asia/Tokyo</SelectItem>
                    <SelectItem value="GMT+01:00, Europe/London">GMT+01:00, Europe/London</SelectItem>
                    <SelectItem value="GMT+02:00, Europe/Paris">GMT+02:00, Europe/Paris</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Ends */}
              <div>
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-2">
                  Thời hạn kết thúc
                </Label>
                <Select
                  value={item.ends || "NEVER"}
                  onValueChange={(val) => setItem({ ...item, ends: val as any })}
                >
                  <SelectTrigger className="w-full rounded-xl h-10 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-sm font-normal focus:ring-purple-500">
                    <SelectValue placeholder="Chọn điều kiện kết thúc" />
                  </SelectTrigger>
                  <SelectContent className="z-[300]">
                    <SelectItem value="NEVER">Không bao giờ</SelectItem>
                    <SelectItem value="ON_DATE">Vào ngày cụ thể</SelectItem>
                  </SelectContent>
                </Select>

                {item.ends === "ON_DATE" && (
                  <div className="mt-2.5">
                    <DatePickerField
                      value={item.endDate || item.startDate || new Date().toISOString().split("T")[0]}
                      onChange={(dateStr) => setItem({ ...item, endDate: dateStr })}
                      placeholder="Chọn ngày kết thúc"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Instructions */}
          <div>
            <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-2">
              Hướng dẫn / Ghi chú thực hiện
            </Label>
            <div className="relative">
              <Textarea
                rows={3}
                placeholder="Nhập hướng dẫn hoặc ghi chú thực hiện..."
                value={item.instructions || ""}
                onChange={(e) => setItem({ ...item, instructions: e.target.value })}
                className="rounded-xl bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-sm font-normal resize-none placeholder:text-slate-400 focus-visible:ring-purple-500"
              />
              <div className="text-xs text-slate-400 text-right pr-2 pt-1 flex items-center justify-end gap-1">
                <span>Tham chiếu công việc, tài liệu, thành viên bằng ký tự</span>
                <span className="font-bold text-slate-500">@</span>
              </div>
            </div>
          </div>

          {/* Summary Box */}
          <div className="bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-900/40 rounded-2xl p-3.5">
            <div className="text-xs font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>{getSummaryText()}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3 bg-slate-50/50 dark:bg-slate-950/50">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="rounded-xl h-9 px-5 text-xs font-semibold cursor-pointer"
          >
            Hủy
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl h-9 px-6 text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/20 cursor-pointer"
          >
            {saving ? "Đang lưu..." : "Lưu lịch trình"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
