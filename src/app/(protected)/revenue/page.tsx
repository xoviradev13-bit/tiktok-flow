"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  DollarSign,
  BarChart3,
  ArrowRight,
  TableProperties,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { trpc } from "@/lib/trpc";

export default function RevenuePage() {
  const [days, setDays] = useState(28);

  const utils = trpc.useUtils();

  useEffect(() => {
    const handleRefresh = () => {
      utils.revenue.getOverview.invalidate();
    };
    window.addEventListener("refreshData", handleRefresh);
    return () => window.removeEventListener("refreshData", handleRefresh);
  }, [utils]);

  const { data: overview, isLoading: loading } = trpc.revenue.getOverview.useQuery({ days });

  const revenueData = {
    data: overview?.records || [],
    chartData: overview?.chartData || [],
    summary: {
      totalRevenue: overview?.totalRevenue || 0,
      totalViews: overview?.totalViews || 0,
      avgRPM: overview?.averageRpm || 0,
      recordCount: overview?.records?.length || 0,
    },
  };

  const periodOptions = [
    { value: 7, label: "7 Ngày" },
    { value: 28, label: "28 Ngày" },
    { value: 60, label: "60 Ngày" },
    { value: 365, label: "365 Ngày" },
    { value: 0, label: "Toàn Bộ" },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm dark:shadow-lg">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Tổng Doanh Thu ({days === 0 ? "Toàn bộ" : `${days} ngày`})
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-300">
            ${revenueData?.summary?.totalRevenue?.toLocaleString() || "0"}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm dark:shadow-lg">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Tổng Views Đủ Điều Kiện
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-cyan-600 dark:text-cyan-400">
            {(revenueData?.summary?.totalViews || 0).toLocaleString()}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm dark:shadow-lg">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            RPM Trung Bình Toàn Dàn
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
            ${revenueData?.summary?.avgRPM || "0.00"}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm dark:shadow-lg">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Số Bản Ghi Thu Nhập
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-pink-600 dark:text-pink-400">
            {revenueData?.summary?.recordCount || 0}
          </div>
        </div>
      </div>

      {/* Chart & Period Filter */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm dark:shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-amber-500" />
              Biến Động Doanh Thu ({days === 0 ? "Toàn bộ" : `${days} ngày`})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Biểu đồ phân bổ doanh thu Creator Rewards & Affiliate
            </p>
          </div>

          {/* Date range chips */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 flex-wrap">
            {periodOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDays(opt.value)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  days === opt.value
                    ? "bg-amber-500 text-slate-950 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Recharts Bar Chart */}
        <div className="h-80 w-full pt-4">
          {revenueData?.chartData?.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueData.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickFormatter={(val) => val.slice(5)} />
                <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(val) => `$${val}`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--background)",
                    borderColor: "#cbd5e1",
                    borderRadius: "0.75rem",
                    fontSize: "12px",
                    color: "var(--foreground)",
                  }}
                  formatter={(value: any) => [`$${Number(value).toFixed(2)}`, "Doanh thu"]}
                />
                <Bar dataKey="revenue" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-500 text-xs">
              Chưa có dữ liệu biểu đồ.
            </div>
          )}
        </div>
      </div>

      {/* Detailed Records Navigation Banner */}
      <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent dark:from-amber-950/30 dark:via-amber-950/10 dark:to-transparent border border-amber-200/80 dark:border-amber-800/50 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <TableProperties className="w-5 h-5 text-amber-500" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Chi Tiết Bản Ghi Doanh Thu Từng Account
            </h3>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-xl">
            Bảng tra cứu toàn bộ bản ghi theo từng ngày, hỗ trợ lọc theo tài khoản, nhân sự phụ trách, nguồn thu, xuất Excel và chọn hàng loạt.
          </p>
        </div>

        <Link
          href="/revenue/details"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md hover:shadow-lg transition-all active:scale-95 cursor-pointer whitespace-nowrap"
        >
          <span>Xem Toàn Bộ Bản Ghi</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
