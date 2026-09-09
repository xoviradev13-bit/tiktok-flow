"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  ArrowUpRight,
  ShieldAlert,
  Award,
  DollarSign,
  Eye,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";

interface OverviewTabProps {
  timeSeries: Array<{
    date: string;
    displayDate: string;
    revenue: number;
    views: number;
    rpm: number;
    tasksCompleted: number;
    tasksAssigned: number;
    completionRate: number;
  }>;
  distributions: {
    status: Array<{ status: string; count: number; percentage: number }>;
    country: Array<{ country: string; accountsCount: number; revenue: number; views: number; rpm: number }>;
    source: Array<{ source: string; revenue: number; percentage: number }>;
  };
  topAccounts: Array<{
    id: string;
    username: string;
    country: string;
    status: string;
    totalFollowers: number;
    periodRevenue: number;
    periodViews: number;
    rpm: number;
    operatorName: string;
    openAlertsCount: number;
    hasCriticalAlert: boolean;
  }>;
  atRiskAccounts: Array<{
    id: string;
    username: string;
    country: string;
    status: string;
    periodRevenue: number;
    periodViews: number;
    rpm: number;
    operatorName: string;
    openAlertsCount: number;
    hasCriticalAlert: boolean;
  }>;
  isStaff?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "#10b981", // emerald-500
  WARMING: "#06b6d4", // cyan-500
  RESTRICTED: "#f59e0b", // amber-500
  BANNED: "#ef4444", // rose-500
  STOPPED: "#64748b", // slate-500
  CUSTOM: "#8b5cf6", // purple-500
};

const SOURCE_COLORS = ["#ec4899", "#8b5cf6", "#3b82f6", "#10b981"];

export default function OverviewTab({
  timeSeries,
  distributions,
  topAccounts,
  atRiskAccounts,
  isStaff,
}: OverviewTabProps) {
  const [activeMetric, setActiveMetric] = useState<"ALL" | "REVENUE" | "VIEWS" | "RPM">("ALL");

  const CustomChartTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900/95 backdrop-blur-md border border-slate-800 p-3 rounded-xl shadow-2xl text-xs space-y-1 text-slate-100 min-w-[170px]">
          <p className="font-bold text-slate-300 pb-1 border-b border-slate-800">
            Ngày: {data.date}
          </p>
          <p className="flex justify-between items-center text-pink-400 font-semibold">
            <span>Doanh Thu:</span>
            <span>${Number(data.revenue).toFixed(2)}</span>
          </p>
          <p className="flex justify-between items-center text-cyan-400 font-semibold">
            <span>Lượt Views:</span>
            <span>{Number(data.views).toLocaleString()}</span>
          </p>
          <p className="flex justify-between items-center text-amber-400 font-semibold">
            <span>RPM:</span>
            <span>${Number(data.rpm).toFixed(2)}</span>
          </p>
          {data.tasksAssigned > 0 && (
            <p className="flex justify-between items-center text-emerald-400 font-semibold pt-1 border-t border-slate-800">
              <span>Chấm công:</span>
              <span>{data.completionRate}%</span>
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* 1. Main TimeSeries Chart Panel */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-pink-500" />
              Biểu Đồ Xu Hướng & Tương Quan Doanh Thu - Lượt Views - RPM
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Phân tích biến động doanh thu theo ngày kết hợp RPM và lượng truy cập.
            </p>
          </div>

          {/* Metric Selector Pills */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl text-xs self-start sm:self-auto">
            {[
              { key: "ALL" as const, label: "Tất Cả" },
              { key: "REVENUE" as const, label: "Doanh Thu ($)" },
              { key: "VIEWS" as const, label: "Views" },
              { key: "RPM" as const, label: "RPM" },
            ].map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setActiveMetric(m.key)}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  activeMetric === m.key
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Chart View */}
        <div className="h-[340px] w-full">
          {timeSeries.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-400 text-xs">
              Không có dữ liệu thời gian cho bộ lọc hiện tại.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={timeSeries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ec4899" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#ec4899" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                <XAxis
                  dataKey="displayDate"
                  tickLine={false}
                  axisLine={{ stroke: "#475569", opacity: 0.3 }}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                />
                <YAxis
                  yAxisId="left"
                  tickLine={false}
                  axisLine={{ stroke: "#475569", opacity: 0.3 }}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  tickFormatter={(v) => `$${v}`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickLine={false}
                  axisLine={{ stroke: "#475569", opacity: 0.3 }}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                />
                <Tooltip content={<CustomChartTooltip />} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ paddingBottom: 12, fontSize: 11 }}
                />

                {(activeMetric === "ALL" || activeMetric === "REVENUE") && (
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="revenue"
                    name="Doanh Thu ($)"
                    stroke="#ec4899"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorRev)"
                  />
                )}

                {(activeMetric === "ALL" || activeMetric === "VIEWS") && (
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="views"
                    name="Lượt Views"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    dot={false}
                  />
                )}

                {(activeMetric === "ALL" || activeMetric === "RPM") && (
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="rpm"
                    name="RPM ($/1k views)"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 2. Distributions & Fleet Donut Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Donut 1: Account Fleet Status Breakdown */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            Cơ Cấu Trạng Thái Dàn Tài Khoản
          </h3>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="h-44 w-44 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={distributions.status.filter((s) => s.count > 0)}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                  >
                    {distributions.status.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={STATUS_COLORS[entry.status] || "#94a3b8"}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val, name) => [`${val} tài khoản`, `${name}`]}
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#1e293b",
                      borderRadius: "0.75rem",
                      fontSize: "12px",
                      color: "#f8fafc",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="flex-1 w-full space-y-2">
              {distributions.status.map((item) => (
                <div key={item.status} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: STATUS_COLORS[item.status] || "#94a3b8" }}
                    />
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {item.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {item.count} kênh
                    </span>
                    <span className="text-slate-400 w-9 text-right font-medium">
                      ({item.percentage}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Donut 2: Revenue by Source Breakdown */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
            <DollarSign className="w-4 h-4 text-pink-500" />
            Cơ Cấu Doanh Thu Theo Nguồn Kiếm Tiền
          </h3>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="h-44 w-44 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={distributions.source.length > 0 ? distributions.source : [{ source: "Chưa có", revenue: 1, percentage: 100 }]}
                    dataKey="revenue"
                    nameKey="source"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                  >
                    {distributions.source.map((_, index) => (
                      <Cell
                        key={`src-cell-${index}`}
                        fill={SOURCE_COLORS[index % SOURCE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val, name) => [`$${Number(val).toFixed(2)}`, `${name}`]}
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#1e293b",
                      borderRadius: "0.75rem",
                      fontSize: "12px",
                      color: "#f8fafc",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="flex-1 w-full space-y-2.5">
              {distributions.source.length === 0 ? (
                <div className="text-xs text-slate-400 py-4">Chưa có dữ liệu nguồn doanh thu.</div>
              ) : (
                distributions.source.map((item, idx) => (
                  <div key={item.source} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: SOURCE_COLORS[idx % SOURCE_COLORS.length] }}
                      />
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {item.source}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">
                        ${item.revenue.toLocaleString()}
                      </span>
                      <span className="text-slate-400 w-9 text-right font-medium">
                        ({item.percentage}%)
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Top Performers vs At-Risk Accounts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top 5 Outperforming Accounts */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-yellow-500" />
              Top Tài Khoản Doanh Thu Cao Nhất
            </h3>
            <Link
              href="/revenue"
              className="text-xs font-semibold text-pink-600 dark:text-pink-400 hover:underline flex items-center gap-0.5"
            >
              <span>Xem tất cả</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {topAccounts.length === 0 ? (
              <div className="text-xs text-slate-400 py-4 text-center">Chưa có tài khoản nào có doanh thu.</div>
            ) : (
              topAccounts.map((acc, idx) => (
                <div key={acc.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 font-bold flex items-center justify-center text-slate-700 dark:text-slate-300 shrink-0 text-xs">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="font-extrabold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                        <span>@{acc.username}</span>
                        <span className="text-xs font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {acc.country}
                        </span>
                      </div>
                      <div className="text-slate-400 text-xs truncate">
                        {acc.operatorName} | {acc.totalFollowers.toLocaleString()} followers
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-extrabold text-emerald-600 dark:text-emerald-400 text-sm">
                      ${acc.periodRevenue.toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-400">
                      RPM: ${acc.rpm.toFixed(2)} | {acc.periodViews.toLocaleString()} views
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top 5 At-Risk Accounts (Requiring Attention) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-500" />
              Tài Khoản Rủi Ro & Cần Xử Lý
            </h3>
            <Link
              href="/accounts"
              className="text-xs font-semibold text-pink-600 dark:text-pink-400 hover:underline flex items-center gap-0.5"
            >
              <span>Dàn Account</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {atRiskAccounts.length === 0 ? (
              <div className="text-xs text-emerald-600 dark:text-emerald-400 py-6 text-center font-medium">
                Tuyệt vời! Không có tài khoản nào gặp lỗi nghiêm trọng hoặc bị khóa.
              </div>
            ) : (
              atRiskAccounts.map((acc) => (
                <div key={acc.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-extrabold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                      <span>@{acc.username}</span>
                      <span
                        className={`text-xs font-bold px-1.5 py-0.2 rounded ${
                          acc.status === "BANNED"
                            ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                            : acc.status === "RESTRICTED"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-600"
                        }`}
                      >
                        {acc.status}
                      </span>
                    </div>
                    <div className="text-slate-400 text-xs truncate">
                      Phụ trách: {acc.operatorName}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {acc.hasCriticalAlert ? (
                      <span className="inline-flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-lg text-xs">
                        <AlertCircle className="w-3 h-3" />
                        Lỗi Nguy Hiểm
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">
                        {acc.openAlertsCount} cảnh báo mở
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
