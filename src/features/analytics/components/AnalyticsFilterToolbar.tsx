"use client";

import React, { useState } from "react";
import {
  Calendar as CalendarIcon,
  Download,
  Filter,
  RefreshCw,
  Sparkles,
  Users,
  Layers,
  Globe,
  CheckCircle2,
  X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { format, subDays } from "date-fns";

export type PeriodType = "7D" | "14D" | "28D" | "30D" | "60D" | "90D" | "365D" | "ALL" | "CUSTOM";

interface AnalyticsFilterToolbarProps {
  period: PeriodType;
  setPeriod: (p: PeriodType) => void;
  startDate?: string;
  setStartDate: (d?: string) => void;
  endDate?: string;
  setEndDate: (d?: string) => void;
  operatorId?: string | null;
  setOperatorId: (id: string | null) => void;
  groupId?: string | null;
  setGroupId: (id: string | null) => void;
  country?: string | null;
  setCountry: (c: string | null) => void;
  status?: any | null;
  setStatus: (s: any | null) => void;
  filterOptions?: {
    groups: Array<{ id: string; name: string; color: string | null }>;
    operators: Array<{
      id: string;
      name: string;
      fullName: string;
      username: string | null;
      avatar: string | null;
      role: string;
      groupName: string | null;
    }>;
    countries: string[];
    userRole: string;
  };
  isLoading: boolean;
  onRefresh: () => void;
  onExportExcel: () => void;
}

export default function AnalyticsFilterToolbar({
  period,
  setPeriod,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  operatorId,
  setOperatorId,
  groupId,
  setGroupId,
  country,
  setCountry,
  status,
  setStatus,
  filterOptions,
  isLoading,
  onRefresh,
  onExportExcel,
}: AnalyticsFilterToolbarProps) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    if (startDate && endDate) {
      return {
        from: new Date(startDate),
        to: new Date(endDate),
      };
    }
    return {
      from: subDays(new Date(), 29),
      to: new Date(),
    };
  });

  const isStaff = filterOptions?.userRole === "STAFF";

  const presetButtons: Array<{ key: PeriodType; label: string }> = [
    { key: "7D", label: "7 Ngày" },
    { key: "14D", label: "14 Ngày" },
    { key: "30D", label: "30 Ngày" },
    { key: "90D", label: "90 Ngày" },
    { key: "365D", label: "1 Năm" },
    { key: "ALL", label: "Toàn Bộ" },
  ];

  const handleApplyCustomRange = (range: DateRange | undefined) => {
    setDateRange(range);
    if (range?.from && range?.to) {
      setStartDate(format(range.from, "yyyy-MM-dd"));
      setEndDate(format(range.to, "yyyy-MM-dd"));
      setPeriod("CUSTOM");
      setIsCalendarOpen(false);
    }
  };

  const hasActiveFilters = Boolean(
    operatorId || groupId || country || status || period === "CUSTOM"
  );

  const handleResetFilters = () => {
    setOperatorId(null);
    setGroupId(null);
    setCountry(null);
    setStatus(null);
    setPeriod("30D");
    setStartDate(undefined);
    setEndDate(undefined);
  };

  return (
    <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 shadow-sm space-y-3.5 transition-all">
      {/* Row 1: Period Presets, Custom Date Range, Action Buttons */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Preset Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
          {presetButtons.map((btn) => {
            const active = period === btn.key;
            return (
              <button
                key={btn.key}
                type="button"
                onClick={() => {
                  setPeriod(btn.key);
                  setStartDate(undefined);
                  setEndDate(undefined);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer select-none ${
                  active
                    ? "bg-pink-600 text-white shadow-md shadow-pink-600/25 ring-2 ring-pink-500/20"
                    : "bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800"
                }`}
              >
                {btn.label}
              </button>
            );
          })}

          {/* Custom Date Popover */}
          <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  period === "CUSTOM"
                    ? "bg-pink-600 text-white shadow-md shadow-pink-600/25"
                    : "bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800"
                }`}
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                <span>
                  {period === "CUSTOM" && startDate && endDate
                    ? `${format(new Date(startDate), "dd/MM")} - ${format(new Date(endDate), "dd/MM")}`
                    : "Tùy Chọn Ngày"}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-auto p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-2xl"
              align="start"
            >
              <div className="space-y-3">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-1">
                  Chọn khoảng thời gian phân tích:
                </div>
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={handleApplyCustomRange}
                  numberOfMonths={1}
                  className="rounded-xl border border-slate-100 dark:border-slate-800"
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Right side actions: Refresh, Export */}
        <div className="flex items-center gap-2 self-end lg:self-auto">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer transition-colors disabled:opacity-50"
            title="Làm mới dữ liệu"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-pink-500" : ""}`} />
            <span className="hidden sm:inline">Làm Mới</span>
          </button>

          <button
            type="button"
            onClick={onExportExcel}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm hover:shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Row 2: Secondary Dropdown Filters (Only for Admin/Lead or Country/Status for all) */}
      <div className="flex items-center gap-2.5 flex-wrap pt-2 border-t border-slate-100 dark:border-slate-800/70 text-xs">
        <div className="flex items-center gap-1.5 text-slate-400 font-medium mr-1">
          <Filter className="w-3.5 h-3.5" />
          <span>Bộ Lọc:</span>
        </div>

        {/* 1. Team / Group filter (Admin/Lead only) */}
        {!isStaff && filterOptions && filterOptions.groups.length > 0 && (
          <div className="relative">
            <select
              value={groupId || ""}
              onChange={(e) => setGroupId(e.target.value || null)}
              className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl px-2.5 py-1.5 pr-6 font-medium border border-transparent hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer outline-none transition-all"
            >
              <option value="">Tất Cả Đội / Nhóm</option>
              {filterOptions.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 2. Operator Filter (Admin/Lead only) */}
        {!isStaff && filterOptions && filterOptions.operators.length > 0 && (
          <div className="relative">
            <select
              value={operatorId || ""}
              onChange={(e) => setOperatorId(e.target.value || null)}
              className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl px-2.5 py-1.5 pr-6 font-medium border border-transparent hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer outline-none transition-all"
            >
              <option value="">Tất Cả Nhân Sự</option>
              {filterOptions.operators.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.fullName} ({op.role})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 3. Country Filter */}
        {filterOptions && filterOptions.countries.length > 0 && (
          <div className="relative">
            <select
              value={country || ""}
              onChange={(e) => setCountry(e.target.value || null)}
              className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl px-2.5 py-1.5 pr-6 font-medium border border-transparent hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer outline-none transition-all"
            >
              <option value="">Mọi Thị Trường</option>
              {filterOptions.countries.map((c) => (
                <option key={c} value={c}>
                  Thị trường: {c}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 4. Status Filter */}
        <div className="relative">
          <select
            value={status || ""}
            onChange={(e) => setStatus(e.target.value || null)}
            className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl px-2.5 py-1.5 pr-6 font-medium border border-transparent hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer outline-none transition-all"
          >
            <option value="">Mọi Trạng Thái</option>
            <option value="ACTIVE">ACTIVE (Hoạt động)</option>
            <option value="WARMING">WARMING (Nuôi kênh)</option>
            <option value="RESTRICTED">RESTRICTED (Hạn chế)</option>
            <option value="BANNED">BANNED (Khóa / Die)</option>
            <option value="STOPPED">STOPPED (Tạm dừng)</option>
          </select>
        </div>

        {/* Clear Filters Reset Button */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleResetFilters}
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 cursor-pointer transition-colors"
          >
            <X className="w-3 h-3" />
            <span>Xóa bộ lọc</span>
          </button>
        )}
      </div>
    </div>
  );
}
