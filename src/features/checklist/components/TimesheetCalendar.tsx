"use client";

import React, { useMemo, useState } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  subDays,
  startOfDay,
} from "date-fns";
import { vi } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  CheckCircle2,
  AlertCircle,
  Clock,
  Video,
  RefreshCw,
  Users,
  Award,
  Sparkles,
  TrendingUp,
  FileText,
  ArrowRight,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";

interface TimesheetCalendarProps {
  checklists: any[];
  selectedMonthDate: Date;
  onMonthChange: (newMonthDate: Date) => void;
  selectedDate?: string;
  selectedUserId: string;
  staffList: any[];
  onSelectDate: (dateStr: string) => void;
  onNavigateDate?: (dateStr: string) => void;
  isLoading?: boolean;
}

export default function TimesheetCalendar({
  checklists,
  selectedMonthDate,
  onMonthChange,
  selectedDate,
  selectedUserId,
  staffList,
  onSelectDate,
  onNavigateDate,
  isLoading,
}: TimesheetCalendarProps) {
  const [isQuickDateOpen, setIsQuickDateOpen] = useState(false);
  // 'today' | 'yesterday' | 'custom' | null
  const [quickMode, setQuickMode] = useState<'today' | 'yesterday' | 'custom' | null>('today');
  // Calendar Matrix generation
  const { daysInGrid, monthStart, monthEnd } = useMemo(() => {
    const mStart = startOfMonth(selectedMonthDate);
    const mEnd = endOfMonth(selectedMonthDate);
    const gridStart = startOfWeek(mStart, { weekStartsOn: 1 }); // Monday start
    const gridEnd = endOfWeek(mEnd, { weekStartsOn: 1 });

    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
    return { daysInGrid: days, monthStart: mStart, monthEnd: mEnd };
  }, [selectedMonthDate]);

  // Index checklists by date string "YYYY-MM-DD"
  const checklistsByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const c of checklists) {
      const dStr = format(new Date(c.date), "yyyy-MM-dd");
      if (!map.has(dStr)) {
        map.set(dStr, []);
      }
      map.get(dStr)!.push(c);
    }
    return map;
  }, [checklists]);

  // Monthly Aggregated Stats
  const monthStats = useMemo(() => {
    let totalScore = 0;
    let fullDays = 0;
    let halfDays = 0;
    let zeroDays = 0;
    let totalVideos = 0;
    let totalSynced = 0;
    let totalAssigned = 0;
    let totalCompletionSum = 0;

    // Filter checklists only within current month
    const inMonthChecklists = checklists.filter((c) => {
      const cDate = new Date(c.date);
      return cDate >= monthStart && cDate <= monthEnd;
    });

    for (const c of inMonthChecklists) {
      const score = Number(c.workdayScore || 0);
      totalScore += score;
      if (score >= 1.0) fullDays++;
      else if (score === 0.5) halfDays++;
      else zeroDays++;

      totalCompletionSum += Number(c.completionRate || 0);
      totalAssigned += c.items?.length || 0;

      for (const it of c.items || []) {
        if (it.isPosted) totalVideos++;
        if (it.isSynced) totalSynced++;
      }
    }

    const avgRate =
      inMonthChecklists.length > 0
        ? Math.round((totalCompletionSum / inMonthChecklists.length) * 10) / 10
        : 0;

    const syncRate =
      totalAssigned > 0 ? Math.round((totalSynced / totalAssigned) * 100) : 0;

    return {
      totalScore,
      fullDays,
      halfDays,
      zeroDays,
      totalVideos,
      totalSynced,
      totalAssigned,
      avgRate,
      syncRate,
      recordedDaysCount: inMonthChecklists.length,
    };
  }, [checklists, monthStart, monthEnd]);

  // Selected User Object (if single user)
  const isSingleUser = selectedUserId !== "ALL";
  const currentUserObj = useMemo(() => {
    if (!isSingleUser) return null;
    return staffList.find((s) => s.id === selectedUserId);
  }, [isSingleUser, selectedUserId, staffList]);

  // Navigation handlers
  const handlePrevMonth = () => {
    onMonthChange(subMonths(selectedMonthDate, 1));
  };

  const handleNextMonth = () => {
    onMonthChange(addMonths(selectedMonthDate, 1));
  };

  const handleToday = () => {
    onMonthChange(new Date());
  };

  const weekDayLabels = [
    "Thứ 2",
    "Thứ 3",
    "Thứ 4",
    "Thứ 5",
    "Thứ 6",
    "Thứ 7",
    "Chủ Nhật",
  ];

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Month Navigation & Summary Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Month Title & Prev/Next Buttons */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-2xl border border-slate-200 dark:border-slate-800">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-colors cursor-pointer shadow-2xs"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs font-semibold z-50">
                  Tháng trước
                </TooltipContent>
              </Tooltip>

              {/* Quick Date Popover */}
              <Popover open={isQuickDateOpen} onOpenChange={setIsQuickDateOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={`px-3 h-8 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5 ${isQuickDateOpen
                      ? "bg-pink-500 text-white"
                      : "text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800"
                      }`}
                  >
                    <span className="leading-none">
                      {quickMode === 'yesterday' ? 'Hôm qua' : quickMode === 'custom' ? 'Tùy chọn' : 'Hôm nay'}
                    </span>
                    <CalendarIcon className={`w-3.5 h-3.5 shrink-0 self-center ${isQuickDateOpen ? 'text-white' : 'text-pink-500'}`} />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  side="bottom"
                  align="start"
                  sideOffset={8}
                  className="w-auto p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl z-[100]"
                >
                  <div className="space-y-3">
                    <div className="pb-2 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        Chuyển nhanh ngày & tháng
                      </span>
                      {quickMode === "custom" && (
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Trong vòng 365 ngày gần nhất
                        </p>
                      )}
                    </div>

                    {/* 3 Option Pills */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {/* Hôm nay */}
                      <button
                        type="button"
                        onClick={() => {
                          const today = new Date();
                          setQuickMode('today');
                          onMonthChange(today);
                          if (onNavigateDate) onNavigateDate(format(today, "yyyy-MM-dd"));
                          setIsQuickDateOpen(false);
                        }}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${quickMode === 'today'
                          ? 'bg-pink-500 text-white border-pink-500 shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-pink-50 hover:text-pink-600 hover:border-pink-300 dark:hover:bg-pink-950/40 dark:hover:text-pink-400 dark:hover:border-pink-800 border-slate-200 dark:border-slate-700'
                          }`}
                      >
                        Hôm nay
                      </button>

                      {/* Hôm qua */}
                      <button
                        type="button"
                        onClick={() => {
                          const yest = new Date();
                          yest.setDate(yest.getDate() - 1);
                          setQuickMode('yesterday');
                          onMonthChange(yest);
                          if (onNavigateDate) onNavigateDate(format(yest, "yyyy-MM-dd"));
                          setIsQuickDateOpen(false);
                        }}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${quickMode === 'yesterday'
                          ? 'bg-pink-500 text-white border-pink-500 shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-pink-50 hover:text-pink-600 hover:border-pink-300 dark:hover:bg-pink-950/40 dark:hover:text-pink-400 dark:hover:border-pink-800 border-slate-200 dark:border-slate-700'
                          }`}
                      >
                        Hôm qua
                      </button>

                      {/* Tùy chọn */}
                      <button
                        type="button"
                        onClick={() => setQuickMode('custom')}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${quickMode === 'custom'
                          ? 'bg-pink-500 text-white border-pink-500 shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-pink-50 hover:text-pink-600 hover:border-pink-300 dark:hover:bg-pink-950/40 dark:hover:text-pink-400 dark:hover:border-pink-800 border-slate-200 dark:border-slate-700'
                          }`}
                      >
                        Tùy chọn
                      </button>
                    </div>

                    {/* Calendar: only shown for Tùy chọn */}
                    {quickMode === 'custom' && (
                      <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                        <CalendarPicker
                          mode="single"
                          selected={selectedDate ? new Date(selectedDate + "T00:00:00") : selectedMonthDate}
                          onSelect={(d) => {
                            if (d) {
                              onMonthChange(d);
                              if (onNavigateDate) onNavigateDate(format(d, "yyyy-MM-dd"));
                              setIsQuickDateOpen(false);
                            }
                          }}
                          disabled={(date) => {
                            const d = startOfDay(date);
                            const today = startOfDay(new Date());
                            return d > today || d < subDays(today, 365);
                          }}
                        />
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-colors cursor-pointer shadow-2xs"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs font-semibold z-50">
                  Tháng sau
                </TooltipContent>
              </Tooltip>
            </div>

            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white capitalize tracking-tight flex items-center gap-2">
                <span>
                  {format(selectedMonthDate, "MMMM, yyyy", { locale: vi })}
                </span>
                {isSingleUser && currentUserObj && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-pink-50 text-pink-700 dark:bg-pink-950/60 dark:text-pink-300 border border-pink-200 dark:border-pink-800">
                    {currentUserObj.fullName || currentUserObj.username}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Click vào bất kỳ ô ngày nào để xem chi tiết.
              </p>
            </div>
          </div>

          {/* Color Legend */}
          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600 dark:text-slate-400 self-start md:self-auto bg-slate-50 dark:bg-slate-950 px-3 py-2 rounded-2xl border border-slate-200/80 dark:border-slate-800">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
              <span>1 công (&ge;85%)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
              <span>0.5 công (50-84%)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
              <span>0 công (&lt;50%)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700 shrink-0" />
              <span>Nghỉ / Chưa có ca</span>
            </span>
          </div>
        </div>

        {/* Monthly Key Metrics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/80">
          {/* Metric 1: Total Workdays */}
          <div className="bg-slate-50/80 dark:bg-slate-950/50 rounded-2xl p-3.5 border border-slate-200/70 dark:border-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {isSingleUser ? "Tổng Ngày Công Tháng" : "Tổng Ngày Công Đội"}
              </div>
              <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
                {monthStats.totalScore}{" "}
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  Công
                </span>
              </div>
            </div>
          </div>

          {/* Metric 2: Average KPI Rate */}
          <div className="bg-slate-50/80 dark:bg-slate-950/50 rounded-2xl p-3.5 border border-slate-200/70 dark:border-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Tỷ Lệ Đạt KPI TB
              </div>
              <div className="text-base sm:text-lg font-black text-cyan-600 dark:text-cyan-400 truncate">
                {monthStats.avgRate}%
              </div>
            </div>
          </div>

          {/* Metric 3: Total Videos Posted */}
          <div className="bg-slate-50/80 dark:bg-slate-950/50 rounded-2xl p-3.5 border border-slate-200/70 dark:border-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 flex items-center justify-center shrink-0">
              <Video className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Video Lên Kênh Tháng
              </div>
              <div className="text-base sm:text-lg font-black text-pink-600 dark:text-pink-400 truncate">
                {monthStats.totalVideos}{" "}
                <span className="text-xs font-bold text-slate-400">videos</span>
              </div>
            </div>
          </div>

          {/* Metric 4: GPM Sync Health Rate */}
          <div className="bg-slate-50/80 dark:bg-slate-950/50 rounded-2xl p-3.5 border border-slate-200/70 dark:border-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 flex items-center justify-center shrink-0">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Tỷ Lệ Sync Live GPM
              </div>
              <div className="text-base sm:text-lg font-black text-purple-600 dark:text-purple-400 truncate">
                {monthStats.syncRate}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Calendar Grid Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden p-3 sm:p-5">
        {/* Weekday Column Headers */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-center pb-2.5 mb-1.5 border-b border-slate-100 dark:border-slate-800/80">
          {weekDayLabels.map((lbl, idx) => (
            <div
              key={lbl}
              className={`text-xs font-bold uppercase tracking-wider py-1 ${idx >= 5
                ? "text-rose-500/90 dark:text-rose-400/90"
                : "text-slate-500 dark:text-slate-400"
                }`}
            >
              {lbl}
            </div>
          ))}
        </div>

        {/* 7-column Calendar Cells */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {daysInGrid.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const isCurrMonth = isSameMonth(day, selectedMonthDate);
            const isCurrDay = isToday(day);
            const dayChecklists = checklistsByDate.get(dateStr) || [];
            const hasData = dayChecklists.length > 0;

            // Single staff day data
            const singleChecklist = isSingleUser ? dayChecklists[0] : null;
            const singleScore = singleChecklist
              ? Number(singleChecklist.workdayScore || 0)
              : null;
            const singleRate = singleChecklist
              ? Number(singleChecklist.completionRate || 0)
              : 0;
            const singleTotalAcc = singleChecklist
              ? singleChecklist.items?.length || 0
              : 0;
            const singlePosted = singleChecklist
              ? singleChecklist.items?.filter((i: any) => i.isPosted).length ||
              0
              : 0;
            const singleSynced = singleChecklist
              ? singleChecklist.items?.filter((i: any) => i.isSynced).length ||
              0
              : 0;
            const singleHasNotes = singleChecklist?.items?.some(
              (i: any) => !!i.notes
            );

            // Team / All staff day data
            const teamFull = dayChecklists.filter(
              (c) => Number(c.workdayScore) >= 1.0
            ).length;
            const teamHalf = dayChecklists.filter(
              (c) => Number(c.workdayScore) === 0.5
            ).length;
            const teamZero = dayChecklists.filter(
              (c) => Number(c.workdayScore) === 0
            ).length;
            const teamTotalStaff = dayChecklists.length;
            const teamVideos = dayChecklists.reduce(
              (sum, c) =>
                sum + (c.items?.filter((i: any) => i.isPosted).length || 0),
              0
            );
            const teamAvgRate =
              teamTotalStaff > 0
                ? Math.round(
                  dayChecklists.reduce(
                    (sum, c) => sum + Number(c.completionRate || 0),
                    0
                  ) / teamTotalStaff
                )
                : 0;

            const isSelected = selectedDate === dateStr;

            return (
              <div
                key={dateStr}
                onClick={() => onSelectDate(dateStr)}
                className={`min-h-[110px] sm:min-h-[125px] p-2 sm:p-2.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between group relative select-none ${isSelected
                  ? "ring-2 ring-pink-500 dark:ring-pink-400 ring-offset-2 dark:ring-offset-slate-900 border-pink-500 shadow-md scale-[1.01]"
                  : ""
                  } ${!isCurrMonth
                    ? "opacity-35 bg-slate-50/50 dark:bg-slate-950/20 border-slate-100 dark:border-slate-800/40 hover:opacity-80"
                    : isCurrDay
                      ? "bg-gradient-to-b from-pink-50/40 to-white dark:from-pink-950/20 dark:to-slate-900 border-pink-400 dark:border-pink-600/70 shadow-xs"
                      : hasData
                        ? "bg-white dark:bg-slate-900/90 border-slate-200/90 dark:border-slate-800/90 hover:border-pink-300 dark:hover:border-slate-700 hover:shadow-md"
                        : "bg-slate-50/60 dark:bg-slate-950/40 border-slate-200/60 dark:border-slate-800/50 hover:bg-white dark:hover:bg-slate-900"
                  }`}
              >
                {/* Cell Header: Day Number + Status Flag */}
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-xs sm:text-sm font-black rounded-lg w-6 h-6 flex items-center justify-center ${isCurrDay
                        ? "bg-pink-600 text-white shadow-xs"
                        : isCurrMonth
                          ? "text-slate-800 dark:text-slate-200"
                          : "text-slate-400 dark:text-slate-600"
                        }`}
                    >
                      {format(day, "d")}
                    </span>
                    {isCurrDay && (
                      <span className="hidden xl:inline-block text-[9px] font-black uppercase text-pink-600 dark:text-pink-400">
                        Hôm nay
                      </span>
                    )}
                  </div>

                  {/* Note Indicator Icon if any note exists */}
                  {singleHasNotes && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-pink-500 dark:text-pink-400">
                          <FileText className="w-3 h-3" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        Có ghi chú vận hành ngày này
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>

                {/* Cell Center: Metrics & Workday Status */}
                <div className="my-1.5 space-y-1">
                  {/* Case A: Single Staff Mode */}
                  {isSingleUser ? (
                    singleChecklist ? (
                      <div className="space-y-1">
                        {/* Workday Badge Pill */}
                        <div className="flex items-center">
                          {singleScore !== null && singleScore >= 1.0 ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              <span>1 công</span>
                            </span>
                          ) : singleScore === 0.5 ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                              <Clock className="w-3.5 h-3.5 shrink-0" />
                              <span>0.5 công</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-xs font-bold bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>0 công</span>
                            </span>
                          )}
                        </div>

                        {/* Accounts Completed Mini Bar */}
                        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${singleRate >= 85
                              ? "bg-emerald-500"
                              : singleRate >= 50
                                ? "bg-amber-500"
                                : "bg-rose-500"
                              }`}
                            style={{ width: `${Math.min(100, singleRate)}%` }}
                          />
                        </div>

                        {/* Counts: Videos & Sync */}
                        <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
                          <span className="flex items-center gap-1">
                            <Video className="w-3.5 h-3.5 text-pink-500" />
                            <strong>{singlePosted}</strong>/{singleTotalAcc}
                          </span>
                          <span className="flex items-center gap-1">
                            <RefreshCw className="w-3.5 h-3.5 text-cyan-500" />
                            <strong>{singleSynced}</strong>/{singleTotalAcc}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 dark:text-slate-600 italic">
                        {isCurrMonth ? "Không có ca" : ""}
                      </div>
                    )
                  ) : (
                    /* Case B: Team / All Staff Mode */
                    hasData ? (
                      <div className="space-y-1">
                        {/* Segmented attendance micro-bar */}
                        <div className="w-full h-1.5 rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800">
                          {teamFull > 0 && (
                            <div
                              className="bg-emerald-500 h-full"
                              style={{
                                width: `${(teamFull / teamTotalStaff) * 100}%`,
                              }}
                              title={`${teamFull} NV đạt 1 công`}
                            />
                          )}
                          {teamHalf > 0 && (
                            <div
                              className="bg-amber-500 h-full"
                              style={{
                                width: `${(teamHalf / teamTotalStaff) * 100}%`,
                              }}
                              title={`${teamHalf} NV đạt 0.5 công`}
                            />
                          )}
                          {teamZero > 0 && (
                            <div
                              className="bg-rose-500 h-full"
                              style={{
                                width: `${(teamZero / teamTotalStaff) * 100}%`,
                              }}
                              title={`${teamZero} NV 0 công`}
                            />
                          )}
                        </div>

                        {/* Staff count pills: 0 công, 0.5 công, 1 công */}
                        <div className="text-xs font-bold flex items-center justify-between min-h-[18px]">
                          {teamFull > 0 && (
                            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                              {teamTotalStaff > 1 && <span>{teamFull} NV ×</span>}
                              <span>1 công</span>
                            </span>
                          )}
                          {teamHalf > 0 && (
                            <span className="text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                              {teamTotalStaff > 1 && <span>{teamHalf} NV ×</span>}
                              <span>0.5 công</span>
                            </span>
                          )}
                          {teamZero > 0 && (
                            <span className="text-rose-600 dark:text-rose-400 flex items-center gap-0.5">
                              {teamTotalStaff > 1 ? (
                                <span>{teamZero} NV × 0 công</span>
                              ) : (
                                <span>0 công</span>
                              )}
                            </span>
                          )}
                        </div>

                        {/* Team avg rate & videos - Same text-xs font-bold size */}
                        <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 pt-0.5 border-t border-slate-100 dark:border-slate-800/60">
                          <span className="text-cyan-600 dark:text-cyan-400">
                            {teamAvgRate}% KPI
                          </span>
                          <span className="flex items-center gap-1">
                            <Video className="w-3.5 h-3.5 text-pink-500" />
                            <span>{teamVideos}</span>
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 dark:text-slate-600 italic">
                        {isCurrMonth ? "Chưa chấm" : ""}
                      </div>
                    )
                  )}
                </div>

                {/* Hover Subtle Prompt: Prominent & Easy to see */}
                <div className="text-xs font-bold text-pink-600 dark:text-pink-400 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-between pt-1 border-t border-pink-100 dark:border-pink-900/40">
                  <span className="flex items-center gap-1">
                    <span>Chi tiết</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
