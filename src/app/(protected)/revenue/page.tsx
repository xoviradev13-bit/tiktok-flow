"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { format, subDays } from "date-fns";

export default function RevenuePage() {
  const [activePreset, setActivePreset] = useState<number | "custom">(28);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [isRangePickerOpen, setIsRangePickerOpen] = useState(false);
  const [rangeSelection, setRangeSelection] = useState<DateRange | undefined>(() => {
    const to = new Date();
    const from = subDays(to, 27);
    return { from, to };
  });
  const [chartMetric, setChartMetric] = useState<"REVENUE" | "VIEWS" | "BOTH">("REVENUE");

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

  const revenueData = {
    data: overview?.records || [],
    chartData: overview?.chartData || [],
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
    { value: 60, label: "60 Ngày" },
    { value: 365, label: "365 Ngày" },
    { value: 0, label: "Toàn Bộ" },
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
    if (activePreset === 0) return "Toàn bộ";
    return `${activePreset} ngày`;
  };

  if (loading) {
    return <RevenuePageSkeleton />;
  }

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-amber-500" />
            Thống Kê Doanh Thu & Báo Cáo Tài Chính
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Theo dõi tổng tiền từng account, RPM trung bình và import báo cáo TikTok Creator Rewards.
          </p>
        </div>

        {/* Action button: Details Redirect */}
        <div className="flex items-center gap-2">
          <Link
            href="/revenue/details"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm hover:shadow transition-all active:scale-95 cursor-pointer"
          >
            <TableProperties className="w-4 h-4" />
            <span>Chi Tiết Bản Ghi Từng Account</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Revenue Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm dark:shadow-lg">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Tổng Doanh Thu ({getPeriodLabel()})
          </div>
          <div className="mt-2 text-xl sm:text-2xl lg:text-3xl font-black text-amber-600 dark:text-amber-300">
            ${revenueData?.summary?.totalRevenue?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00"}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm dark:shadow-lg">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Tổng Views Đủ Điều Kiện
          </div>
          <div className="mt-2 text-xl sm:text-2xl lg:text-3xl font-black text-cyan-600 dark:text-cyan-400">
            {(revenueData?.summary?.totalViews || 0).toLocaleString()}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm dark:shadow-lg">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            RPM Trung Bình Toàn Dàn
          </div>
          <div className="mt-2 text-xl sm:text-2xl lg:text-3xl font-black text-emerald-600 dark:text-emerald-400">
            ${Number(revenueData?.summary?.avgRPM || 0).toFixed(3)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm dark:shadow-lg">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Số Bản Ghi Thu Nhập
          </div>
          <div className="mt-2 text-xl sm:text-2xl lg:text-3xl font-black text-pink-600 dark:text-pink-400">
            {revenueData?.summary?.recordCount || 0}
          </div>
        </div>
      </div>

      {/* Chart & Period Filter */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm dark:shadow-xl space-y-4 min-w-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-amber-500" />
              Biến Động Dữ Liệu ({getPeriodLabel()})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Biểu đồ trực quan theo ngày thực tế từ TikTok Creator Rewards & Affiliate
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Metric Mode Toggle */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto max-w-full scrollbar-none">
              <button
                onClick={() => setChartMetric("REVENUE")}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  chartMetric === "REVENUE"
                    ? "bg-amber-500 text-slate-950 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Doanh Thu ($)
              </button>
              <button
                onClick={() => setChartMetric("VIEWS")}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  chartMetric === "VIEWS"
                    ? "bg-cyan-500 text-slate-950 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Lượt Views
              </button>
              <button
                onClick={() => setChartMetric("BOTH")}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  chartMetric === "BOTH"
                    ? "bg-gradient-to-r from-amber-500 to-cyan-500 text-slate-950 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Tổng Hợp
              </button>
            </div>

            {/* Date range chips & Custom Range Popover */}
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto max-w-full scrollbar-none">
              {periodOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setActivePreset(opt.value);
                    setStartDate("");
                    setEndDate("");
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    activePreset === opt.value
                      ? "bg-amber-500 text-slate-950 shadow-sm"
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
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                      activePreset === "custom"
                        ? "bg-amber-500 text-slate-950 shadow-sm"
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
                <PopoverContent align="end" className="w-auto p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Chọn khoảng ngày thống kê
                    </span>
                    {rangeSelection?.from && (
                      <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
                        {format(rangeSelection.from, "dd/MM/yy")} - {rangeSelection.to ? format(rangeSelection.to, "dd/MM/yy") : "..."}
                      </span>
                    )}
                  </div>

                  <CalendarPicker
                    mode="range"
                    selected={rangeSelection}
                    onSelect={(range) => {
                      setRangeSelection(range);
                    }}
                    numberOfMonths={1}
                  />

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
                      className="px-3 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 rounded-lg shadow-sm cursor-pointer transition-all"
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
                    tickFormatter={(val) => `$${val}`}
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
                      if (name === "Doanh thu ($)") return [`$${Number(value).toFixed(2)}`, name];
                      if (name === "Lượt views") return [Number(value).toLocaleString(), name];
                      return [value, name];
                    }}
                    labelFormatter={(label) => `Ngày: ${label}`}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }} />
                  <Bar yAxisId="left" dataKey="revenue" name="Doanh thu ($)" fill="#f59e0b" radius={[6, 6, 0, 0]} />
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
                  <YAxis stroke="#f59e0b" fontSize={11} tickFormatter={(val) => `$${val}`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--background)",
                      borderColor: "#cbd5e1",
                      borderRadius: "0.75rem",
                      fontSize: "12px",
                      color: "var(--foreground)",
                    }}
                    formatter={(value: any) => [`$${Number(value).toFixed(2)}`, "Doanh thu ($)"]}
                    labelFormatter={(label) => `Ngày: ${label}`}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }} />
                  <Bar dataKey="revenue" name="Doanh thu ($)" fill="#f59e0b" radius={[6, 6, 0, 0]} />
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
