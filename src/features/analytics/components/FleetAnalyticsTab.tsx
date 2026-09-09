"use client";

import React from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { Users, ShieldCheck, Globe, ArrowRight, ExternalLink } from "lucide-react";

interface FleetAnalyticsTabProps {
  statusDistribution: Array<{ status: string; count: number; percentage: number }>;
  countryDistribution: Array<{ country: string; accountsCount: number; revenue: number; views: number; rpm: number }>;
  totalAccountsCount: number;
  healthyAccountsCount: number;
  fleetHealthScore: number;
}

const STATUS_COLOR_MAP: Record<string, { bg: string; text: string; bar: string }> = {
  ACTIVE: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" },
  WARMING: { bg: "bg-cyan-500/10", text: "text-cyan-600 dark:text-cyan-400", bar: "bg-cyan-500" },
  RESTRICTED: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500" },
  BANNED: { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", bar: "bg-rose-500" },
  STOPPED: { bg: "bg-slate-500/10", text: "text-slate-600 dark:text-slate-400", bar: "bg-slate-500" },
  CUSTOM: { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", bar: "bg-purple-500" },
};

export default function FleetAnalyticsTab({
  statusDistribution,
  countryDistribution,
  totalAccountsCount,
  healthyAccountsCount,
  fleetHealthScore,
}: FleetAnalyticsTabProps) {
  return (
    <div className="space-y-6">
      {/* 1. Fleet Health Summary Banner */}
      <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black text-xl shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
              Chỉ Số Sức Khỏe Dàn Account: {fleetHealthScore}%
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {healthyAccountsCount} trên tổng số {totalAccountsCount} tài khoản đang hoạt động bình thường hoặc trong giai đoạn nuôi kênh an toàn.
            </p>
          </div>
        </div>

        <Link
          href="/accounts"
          className="self-start sm:self-auto px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 flex items-center gap-1.5 transition-all"
        >
          <span>Quản Trị Dàn Account</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* 2. Status Breakdown Progress Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statusDistribution.map((item) => {
          const style = STATUS_COLOR_MAP[item.status] || {
            bg: "bg-slate-500/10",
            text: "text-slate-600",
            bar: "bg-slate-500",
          };

          return (
            <div
              key={item.status}
              className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-2xl p-4 shadow-sm space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${style.bg} ${style.text}`}>
                  {item.status}
                </span>
                <span className="text-xs text-slate-400 font-semibold">
                  {item.percentage}%
                </span>
              </div>

              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black text-slate-900 dark:text-white">
                  {item.count}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  tài khoản
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${style.bar}`}
                  style={{ width: `${item.percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Country / Market Fleet Distribution */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
          <Globe className="w-4 h-4 text-cyan-500" />
          Quy Mô Dàn Account Theo Quốc Gia & Thị Trường
        </h3>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={countryDistribution}
              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
              <XAxis
                dataKey="country"
                tickLine={false}
                axisLine={{ stroke: "#475569", opacity: 0.3 }}
                tick={{ fill: "#94a3b8", fontSize: 11 }}
              />
              <YAxis
                tickLine={false}
                axisLine={{ stroke: "#475569", opacity: 0.3 }}
                tick={{ fill: "#94a3b8", fontSize: 11 }}
              />
              <Tooltip
                formatter={(val) => [`${val} kênh`, "Số lượng"]}
                contentStyle={{
                  backgroundColor: "#0f172a",
                  borderColor: "#1e293b",
                  borderRadius: "0.75rem",
                  fontSize: "12px",
                  color: "#f8fafc",
                }}
              />
              <Bar dataKey="accountsCount" fill="#06b6d4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
