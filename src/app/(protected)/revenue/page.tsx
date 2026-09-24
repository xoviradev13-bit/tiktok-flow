"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useUrlParams } from "@/hooks/useUrlState";
import {
  DollarSign,
  BarChart3,
  ArrowRight,
  TableProperties,
  Eye,
  TrendingUp,
  Layers,
  Calendar as CalendarIcon,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { trpc } from "@/lib/trpc";
import { RevenuePageSkeleton } from "@/components/skeletons/PageSkeletons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip as UITooltip, TooltipContent as UITooltipContent, TooltipTrigger as UITooltipTrigger } from "@/components/ui/tooltip";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { format, subDays } from "date-fns";
import { useCurrency } from "@/contexts/CurrencyContext";

function RevenuePageContent() {
  // SaaS URL Query State Synchronization
  const { searchParams, updateUrlParams } = useUrlParams();

  const paramPreset = searchParams?.get("preset");
  // Legacy preset=0 (Toàn Bộ) → 365 (Studio daily data capped at 365 days)
  const parsedPreset =
    paramPreset === "custom"
      ? "custom"
      : paramPreset
        ? Number(paramPreset)
        : 28;
  const initialPreset =
    parsedPreset === "custom"
      ? "custom"
      : parsedPreset === 0 || !Number.isFinite(parsedPreset)
        ? 365
        : (parsedPreset as number);
  const [activePreset, setActivePreset] = useState<number | "custom">(initialPreset);

  const initialFrom = searchParams?.get("from") || "";
  const initialTo = searchParams?.get("to") || "";
  const [startDate, setStartDate] = useState<string>(initialFrom);
  const [endDate, setEndDate] = useState<string>(initialTo);

  const [isRangePickerOpen, setIsRangePickerOpen] = useState(false);
  const [rangeSelection, setRangeSelection] = useState<DateRange | undefined>(() => {
    if (initialFrom && initialTo) {
      return { from: new Date(initialFrom + "T00:00:00"), to: new Date(initialTo + "T00:00:00") };
    }
    const to = new Date();
    const from = subDays(to, 27);
    return { from, to };
  });

  const paramMetric = searchParams?.get("metric") as any;
  const initialMetric = ["REVENUE", "VIEWS", "BOTH"].includes(paramMetric) ? paramMetric : "REVENUE";
  const [chartMetric, setChartMetric] = useState<"REVENUE" | "VIEWS" | "BOTH">(initialMetric);

  const { currency, formatAmount, convertToActive } = useCurrency();

  // Auto sync active state to URL
  useEffect(() => {
    updateUrlParams(
      {
        preset: activePreset,
        from: startDate,
        to: endDate,
        metric: chartMetric,
      },
      {
        from: "",
        to: "",
        metric: "REVENUE",
      }
    );
  }, [activePreset, startDate, endDate, chartMetric, updateUrlParams]);

  const utils = trpc.useUtils();

  useEffect(() => {
    const handleRefresh = () => {
      utils.revenue.getOverview.invalidate();
    };
    window.addEventListener("refreshData", handleRefresh);
    return () => window.removeEventListener("refreshData", handleRefresh);
  }, [utils]);

  const queryInput =
    activePreset === "custom" && startDate && endDate
      ? { startDate, endDate, days: undefined }
      : { days: typeof activePreset === "number" ? activePreset : 28 };

  const { data: overview, isLoading: loading } = trpc.revenue.getOverview.useQuery(queryInput);

  const convertedChartData = useMemo(() => {
    if (!overview?.chartData) return [];
    return overview.chartData.map((d: any) => ({
      ...d,
      revenue: convertToActive(d.revenue || 0, "USD"),
    }));
  }, [overview?.chartData, convertToActive]);

  const revenueData = {
    data: overview?.records || [],
    chartData: convertedChartData,
    summary: {
      totalRevenue: overview?.totalRevenue || 0,
      totalViews: overview?.totalViews || 0,
      avgRPM: overview?.averageRpm || 0,
      recordCount: overview?.totalRecords ?? overview?.records?.length ?? 0,
    },
  };

  const periodOptions = [
    { value: 7, label: "7 Ngày" },
    { value: 28, label: "28 Ngày" },
    { value: 30, label: "Tháng Này" },
    { value: 60, label: "60 Ngày" },
    { value: 365, label: "365 Ngày" },
  ];

  const getPeriodLabel = () => {
    if (activePreset === "custom" && startDate && endDate) {
      try {
        const s = format(new Date(startDate + "T00:00:00"), "dd/MM/yyyy");
        const e = format(new Date(endDate + "T00:00:00"), "dd/MM/yyyy");
        return `${s} - ${e}`;
      } catch {
        return "Tùy chọn";
      }
    }
    if (activePreset === 30) return "Tháng Này (30 ngày)";
    return `${activePreset} ngày`;
  };

  if (loading) {
    return <RevenuePageSkeleton />;
  }

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2 min-w-0">
            <DollarSign className="w-6 h-6 text-amber-500 shrink-0" />
            <span className="truncate" title="Thống Kê Doanh Thu & Báo Cáo Tài Chính">
              Thống Kê Doanh Thu & Báo Cáo Tài Chính
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
            Theo dõi tổng tiền từng account, RPM trung bình và import báo cáo TikTok Creator Rewards.
          </p>
        </div>

        {/* Action button: Details Redirect */}
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          <UITooltip>
            <UITooltipTrigger asChild>
              <Link
                href="/revenue/details"
                className="h-10 flex items-center gap-2 px-4 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm hover:shadow transition-all active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
              >
                <TableProperties className="w-4 h-4 shrink-0" />
                <span className="truncate">Chi Tiết Bản Ghi Từng Account</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </Link>
            </UITooltipTrigger>
            <UITooltipContent side="bottom" className="text-xs font-semibold">
              Xem bảng kê chi tiết doanh thu và import dữ liệu từng tài khoản
            </UITooltipContent>
          </UITooltip>
        </div>
      </div>

      {/* Revenue Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm dark:shadow-lg min-w-0">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate whitespace-nowrap" title={`Tổng Doanh Thu (${getPeriodLabel()})`}>
            Tổng Doanh Thu ({getPeriodLabel()})
          </div>
          <div className="mt-2 text-xl sm:text-2xl lg:text-3xl font-black text-amber-600 dark:text-amber-300 truncate">
            {formatAmount(revenueData.summary.totalRevenue, "USD")}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm dark:shadow-lg min-w-0">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate whitespace-nowrap" title="Tổng Views Đủ Điều Kiện">
            Tổng Views Đủ Điều Kiện
          </div>
          <div className="mt-2 text-xl sm:text-2xl lg:text-3xl font-black text-cyan-600 dark:text-cyan-400 truncate">
            {(revenueData?.summary?.totalViews || 0).toLocaleString()}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm dark:shadow-lg min-w-0">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate whitespace-nowrap" title="RPM Trung Bình Toàn Dàn">
            RPM Trung Bình Toàn Dàn
          </div>
          <div className="mt-2 text-xl sm:text-2xl lg:text-3xl font-black text-emerald-600 dark:text-emerald-400 truncate">
            {formatAmount(Number(revenueData.summary.avgRPM || 0), "USD")}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm dark:shadow-lg min-w-0">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate whitespace-nowrap" title="Số Bản Ghi Thu Nhập">
            Số Bản Ghi Thu Nhập
          </div>
          <div className="mt-2 text-xl sm:text-2xl lg:text-3xl font-black text-pink-600 dark:text-pink-400 truncate">
            {revenueData?.summary?.recordCount || 0}
          </div>
        </div>
      </div>

      {/* Chart & Period Filter */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm dark:shadow-xl space-y-4 min-w-0">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="shrink-0">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-amber-500" />
              Biến Động Dữ Liệu ({getPeriodLabel()})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Biểu đồ theo ngày từ Creator Rewards & Affiliate
            </p>
          </div>

          <div className="flex items-center gap-2.5 overflow-x-auto max-w-full scrollbar-none pb-1 xl:pb-0">
            {/* Metric Mode Toggle */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0">
              <button
                onClick={() => setChartMetric("REVENUE")}
                className={`px-2.5 py-1 rounded-lg text-xs font-normal transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  chartMetric === "REVENUE"
                    ? "bg-amber-500 text-slate-950 shadow-sm font-medium"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Doanh Thu ($)
              </button>
              <button
                onClick={() => setChartMetric("VIEWS")}
                className={`px-2.5 py-1 rounded-lg text-xs font-normal transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  chartMetric === "VIEWS"
                    ? "bg-cyan-500 text-slate-950 shadow-sm font-medium"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Lượt Views
              </button>
              <button
                onClick={() => setChartMetric("BOTH")}
                className={`px-2.5 py-1 rounded-lg text-xs font-normal transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  chartMetric === "BOTH"
                    ? "bg-gradient-to-r from-amber-500 to-cyan-500 text-slate-950 shadow-sm font-medium"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Tổng Hợp
              </button>
            </div>

            {/* Date range chips & Custom Range Popover */}
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0">
              {periodOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setActivePreset(opt.value);
                    setStartDate("");
                    setEndDate("");
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-normal transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    activePreset === opt.value
                      ? "bg-amber-500 text-slate-950 shadow-sm font-medium"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}

              {/* Custom Date Range Popover */}
              <Popover open={isRangePickerOpen} onOpenChange={setIsRangePickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={`px-3 py-1 rounded-lg text-xs font-normal transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                      activePreset === "custom"
                        ? "bg-amber-500 text-slate-950 shadow-sm font-medium"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <CalendarIcon className="w-3.5 h-3.5" />
                    <span>
                      {activePreset === "custom" && startDate && endDate
                        ? `${format(new Date(startDate + "T00:00:00"), "dd/MM")} - ${format(new Date(endDate + "T00:00:00"), "dd/MM")}`
                        : "Tùy chọn"}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  side="bottom"
                  sideOffset={6}
                  align="end"
                  avoidCollisions={false}
                  className="w-[325px] p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50"
                >
                  <div className="flex items-center justify-between gap-2 pb-2 mb-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      Chọn khoảng ngày thống kê
                    </span>
                    {rangeSelection?.from && (
                      <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800 whitespace-nowrap shrink-0">
                        {format(rangeSelection.from, "dd/MM/yy")} - {rangeSelection.to ? format(rangeSelection.to, "dd/MM/yy") : "..."}
                      </span>
                    )}
                  </div>

                  <div className="w-full py-0.5">
                    <CalendarPicker
                      mode="range"
                      selected={rangeSelection}
                      onSelect={(range) => {
                        setRangeSelection(range);
                      }}
                      numberOfMonths={1}
                      className="w-full p-0 [--cell-size:2.1rem] [&_.rdp-root]:w-full [&_.rdp-months]:w-full [&_.rdp-month]:w-full [&_.rdp-month_grid]:w-full [&_.rdp-weekdays]:w-full [&_.rdp-weekdays]:justify-between [&_.rdp-week]:w-full [&_.rdp-week]:justify-between [&_.rdp-week]:mt-1 [&_.rdp-day]:flex-1 [&_.rdp-button]:w-full [&_.rdp-button]:h-8 [&_.rdp-button]:min-w-0 [&_.rdp-button]:aspect-auto [&_.rdp-button]:text-xs"
                      classNames={{
                        root: "w-full",
                        months: "relative flex flex-col w-full",
                        month: "w-full flex flex-col gap-1.5",
                        weekdays: "flex w-full justify-between",
                        week: "flex w-full mt-1 justify-between",
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setIsRangePickerOpen(false)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      disabled={!rangeSelection?.from}
                      onClick={() => {
                        if (rangeSelection?.from) {
                          const s = format(rangeSelection.from, "yyyy-MM-dd");
                          const e = rangeSelection.to ? format(rangeSelection.to, "yyyy-MM-dd") : s;
                          setStartDate(s);
                          setEndDate(e);
                          setActivePreset("custom");
                        }
                        setIsRangePickerOpen(false);
                      }}
                      className="px-4 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 rounded-lg shadow-sm cursor-pointer transition-all"
                    >
                      Áp dụng
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>


        {/* Spacious Chart Area */}
        <div className="h-[340px] sm:h-[420px] lg:h-[480px] w-full pt-4">
          {revenueData?.chartData?.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              {chartMetric === "BOTH" ? (
                <ComposedChart data={revenueData.chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickFormatter={(val) => val.slice(5)} />
                  <YAxis
                    yAxisId="left"
                    stroke="#f59e0b"
                    fontSize={11}
                    tickFormatter={(val) => currency === "USD" ? `$${val}` : `${(val / 1000).toFixed(0)}k₫`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#06b6d4"
                    fontSize={11}
                    tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--background)",
                      borderColor: "#cbd5e1",
                      borderRadius: "0.75rem",
                      fontSize: "12px",
                      color: "var(--foreground)",
                    }}
                    formatter={(value: any, name: any) => {
                      if (name && String(name).includes("Doanh thu")) {
                        return [currency === "USD" ? `$${Number(value).toFixed(2)}` : `${Number(value).toLocaleString("vi-VN")} ₫`, name];
                      }
                      if (name === "Lượt views") return [Number(value).toLocaleString(), name];
                      return [value, name];
                    }}
                    labelFormatter={(label) => `Ngày: ${label}`}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }} />
                  <Bar yAxisId="left" dataKey="revenue" name={currency === "USD" ? "Doanh thu ($)" : "Doanh thu (₫)"} fill="#f59e0b" radius={[6, 6, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="views" name="Lượt views" stroke="#06b6d4" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </ComposedChart>
              ) : chartMetric === "VIEWS" ? (
                <BarChart data={revenueData.chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickFormatter={(val) => val.slice(5)} />
                  <YAxis
                    stroke="#06b6d4"
                    fontSize={11}
                    tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--background)",
                      borderColor: "#cbd5e1",
                      borderRadius: "0.75rem",
                      fontSize: "12px",
                      color: "var(--foreground)",
                    }}
                    formatter={(value: any) => [Number(value).toLocaleString(), "Lượt views"]}
                    labelFormatter={(label) => `Ngày: ${label}`}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }} />
                  <Bar dataKey="views" name="Lượt views" fill="#06b6d4" radius={[6, 6, 0, 0]} />
                </BarChart>
              ) : (
                <BarChart data={revenueData.chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickFormatter={(val) => val.slice(5)} />
                  <YAxis stroke="#f59e0b" fontSize={11} tickFormatter={(val) => currency === "USD" ? `$${val}` : `${(val / 1000).toFixed(0)}k₫`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--background)",
                      borderColor: "#cbd5e1",
                      borderRadius: "0.75rem",
                      fontSize: "12px",
                      color: "var(--foreground)",
                    }}
                    formatter={(value: any) => [currency === "USD" ? `$${Number(value).toFixed(2)}` : `${Number(value).toLocaleString("vi-VN")} ₫`, currency === "USD" ? "Doanh thu ($)" : "Doanh thu (₫)"]}
                    labelFormatter={(label) => `Ngày: ${label}`}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }} />
                  <Bar dataKey="revenue" name={currency === "USD" ? "Doanh thu ($)" : "Doanh thu (₫)"} fill="#f59e0b" radius={[6, 6, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-500 text-xs">
              Chưa có dữ liệu biểu đồ trong khoảng thời gian này.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RevenuePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400 text-xs">Đang tải thống kê doanh thu...</div>}>
      <RevenuePageContent />
    </Suspense>
  );
}
