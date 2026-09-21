"use client";

import React, { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { DollarSign, TrendingUp, Globe, ArrowUpRight, Search } from "lucide-react";

interface RevenueAnalyticsTabProps {
  timeSeries: Array<{
    date: string;
    displayDate: string;
    revenue: number;
    views: number;
    rpm: number;
  }>;
  countryDistribution: Array<{
    country: string;
    accountsCount: number;
    revenue: number;
    views: number;
    rpm: number;
  }>;
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
  }>;
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
  WARMING: "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10",
  RESTRICTED: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
  BANNED: "text-rose-600 dark:text-rose-400 bg-rose-500/10",
  STOPPED: "text-slate-600 dark:text-slate-400 bg-slate-500/10",
  CUSTOM: "text-purple-600 dark:text-purple-400 bg-purple-500/10",
};

export default function RevenueAnalyticsTab({
  timeSeries,
  countryDistribution,
  topAccounts,
}: RevenueAnalyticsTabProps) {
  const [searchAccount, setSearchAccount] = useState("");

  const filteredAccounts = topAccounts.filter((a) =>
    a.username.toLowerCase().includes(searchAccount.toLowerCase()) ||
    a.operatorName.toLowerCase().includes(searchAccount.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* 1. Daily Revenue Bar Chart & RPM Curve */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Daily Revenue Bar Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-pink-500" />
            Doanh Thu Theo Từng Ngày ($)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Theo dõi khối lượng tiền tạo ra mỗi ngày trong chu kỳ.
          </p>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeSeries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                <XAxis
                  dataKey="displayDate"
                  tickLine={false}
                  axisLine={{ stroke: "#475569", opacity: 0.3 }}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={{ stroke: "#475569", opacity: 0.3 }}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip
                  formatter={(val) => [`$${Number(val).toFixed(2)}`, "Doanh Thu"]}
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#1e293b",
                    borderRadius: "0.75rem",
                    fontSize: "12px",
                    color: "#f8fafc",
                  }}
                />
                <Bar dataKey="revenue" fill="#ec4899" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* RPM Fluctuation Curve */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-amber-500" />
            Biến Động RPM ($ / 1,000 Views)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Hiệu quả doanh thu trên mỗi 1,000 lượt xem đủ điều kiện.
          </p>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeSeries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                <XAxis
                  dataKey="displayDate"
                  tickLine={false}
                  axisLine={{ stroke: "#475569", opacity: 0.3 }}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={{ stroke: "#475569", opacity: 0.3 }}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip
                  formatter={(val) => [`$${Number(val).toFixed(2)}`, "RPM"]}
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#1e293b",
                    borderRadius: "0.75rem",
                    fontSize: "12px",
                    color: "#f8fafc",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="rpm"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#f59e0b" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 2. Country Revenue Breakdown */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm">
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
          <Globe className="w-4 h-4 text-cyan-500" />
          Hiệu Quả Doanh Thu Theo Thị Trường / Quốc Gia
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {countryDistribution.map((item) => (
            <div
              key={item.country}
              className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl p-3.5 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-slate-900 dark:text-white text-base">
                  {item.country}
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  {item.accountsCount} kênh
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">Doanh thu:</span>
                <span className="text-sm font-black text-pink-600 dark:text-pink-400">
                  ${Number(item.revenue).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-slate-400">Views:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {item.views.toLocaleString()}
                </span>
              </div>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-slate-400">RPM:</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  ${item.rpm.toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Top Earning Accounts Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
              Bảng Doanh Thu Chi Tiết Theo Kênh
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Danh sách các kênh có số liệu thu nhập và tỷ suất RPM.
            </p>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo username hoặc nhân sự..."
              value={searchAccount}
              onChange={(e) => setSearchAccount(e.target.value)}
              className="bg-slate-100 dark:bg-slate-800 text-xs pl-8 pr-3 py-1.5 rounded-xl text-slate-900 dark:text-white outline-none border border-transparent focus:border-pink-500 w-64"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold">
                <th className="pb-3 font-semibold">Kênh TikTok</th>
                <th className="pb-3 font-semibold">Quốc Gia</th>
                <th className="pb-3 font-semibold">Trạng Thái</th>
                <th className="pb-3 font-semibold">Nhân Sự</th>
                <th className="pb-3 font-semibold text-right">Lượt Views</th>
                <th className="pb-3 font-semibold text-right">RPM</th>
                <th className="pb-3 font-semibold text-right">Doanh Thu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400">
                    Không tìm thấy tài khoản phù hợp.
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 font-bold text-slate-900 dark:text-white">
                      @{acc.username}
                    </td>
                    <td className="py-3">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-semibold text-slate-600 dark:text-slate-300">
                        {acc.country}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${STATUS_STYLES[acc.status] || "text-slate-600 dark:text-slate-400 bg-slate-500/10"}`}>
                        {acc.status}
                      </span>
                    </td>
                    <td className="py-3 text-slate-600 dark:text-slate-300">
                      {acc.operatorName}
                    </td>
                    <td className="py-3 text-right text-slate-700 dark:text-slate-300 font-semibold">
                      {acc.periodViews.toLocaleString()}
                    </td>
                    <td className="py-3 text-right text-amber-600 dark:text-amber-400 font-semibold">
                      ${acc.rpm.toFixed(2)}
                    </td>
                    <td className="py-3 text-right font-black text-pink-600 dark:text-pink-400 text-sm">
                      ${Number(acc.periodRevenue).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
