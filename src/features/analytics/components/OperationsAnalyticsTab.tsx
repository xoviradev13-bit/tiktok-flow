"use client";

import React from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { CheckSquare, Trophy, Flame, ArrowRight, UserCheck, Sparkles } from "lucide-react";

interface OperationsAnalyticsTabProps {
  timeSeries: Array<{
    date: string;
    displayDate: string;
    tasksCompleted: number;
    tasksAssigned: number;
    completionRate: number;
  }>;
  operatorBenchmarks?: Array<{
    operatorId: string;
    operatorName: string;
    operatorAvatar: string | null;
    role: string;
    groupName: string | null;
    accountsCount: number;
    totalRevenue: number;
    totalViews: number;
    tasksCompleted: number;
    tasksAssigned: number;
    completionRate: number;
    avgRpm: number;
  }>;
  personalBenchmark?: {
    myRevenue: number;
    myViews: number;
    myRpm: number;
    myCompletionRate: number;
    myWorkdayScoreSum: number;
    myHealthyAccountsCount: number;
    myTotalAccountsCount: number;
    studioAvgRevenue: number;
    studioAvgCompletionRate: number;
  } | null;
  isStaff?: boolean;
}

export default function OperationsAnalyticsTab({
  timeSeries,
  operatorBenchmarks,
  personalBenchmark,
  isStaff,
}: OperationsAnalyticsTabProps) {
  return (
    <div className="space-y-6">
      {/* 1. Daily Checklist KPI Completion Rate Trend */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-purple-500" />
              Tiến Độ Hoàn Thành Checklist Chấm Công Hàng Ngày (%)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Theo dõi tỷ lệ hoàn thành checklist đăng video và tương tác ca làm việc.
            </p>
          </div>

          <Link
            href="/checklist"
            className="self-start sm:self-auto px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-sm transition-all flex items-center gap-1.5"
          >
            <span>Vào Bảng Chấm Công</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

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
                domain={[0, 100]}
                tickLine={false}
                axisLine={{ stroke: "#475569", opacity: 0.3 }}
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                formatter={(val) => [`${val}%`, "Tỉ lệ hoàn thành"]}
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
                dataKey="completionRate"
                stroke="#8b5cf6"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#8b5cf6" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2. Admin: Operator Efficiency Matrix */}
      {!isStaff && operatorBenchmarks && operatorBenchmarks.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Trophy className="w-4 h-4 text-yellow-500" />
                Ma Trận Hiệu Quả Vận Hành & Năng Suất Nhân Sự
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Xếp hạng nhân sự theo sản lượng doanh thu, views và kỷ luật hoàn thành công việc.
              </p>
            </div>

            <Link
              href="/leaderboard"
              className="text-xs font-semibold text-pink-600 dark:text-pink-400 hover:underline flex items-center gap-0.5"
            >
              <span>Xem Leaderboard</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold">
                  <th className="pb-3 font-semibold">Nhân Sự</th>
                  <th className="pb-3 font-semibold">Đội / Nhóm</th>
                  <th className="pb-3 font-semibold text-center">Số Kênh Phụ Trách</th>
                  <th className="pb-3 font-semibold text-center">Tỉ Lệ Chấm Công</th>
                  <th className="pb-3 font-semibold text-right">Lượt Views</th>
                  <th className="pb-3 font-semibold text-right">RPM</th>
                  <th className="pb-3 font-semibold text-right">Doanh Thu Đem Lại</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {operatorBenchmarks.map((op, idx) => (
                  <tr key={op.operatorId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 font-bold flex items-center justify-center text-slate-700 dark:text-slate-300 text-xs">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="font-extrabold text-slate-900 dark:text-white">
                            {op.operatorName}
                          </div>
                          <div className="text-xs text-slate-400">
                            {op.role}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-slate-600 dark:text-slate-300">
                      {op.groupName || "Chưa phân nhóm"}
                    </td>
                    <td className="py-3 text-center font-bold text-slate-900 dark:text-white">
                      {op.accountsCount} kênh
                    </td>
                    <td className="py-3 text-center">
                      <span
                        className={`font-bold px-2 py-0.5 rounded-lg text-xs ${
                          op.completionRate >= 90
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : op.completionRate >= 70
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {op.completionRate}%
                      </span>
                    </td>
                    <td className="py-3 text-right text-slate-700 dark:text-slate-300 font-semibold">
                      {op.totalViews.toLocaleString()}
                    </td>
                    <td className="py-3 text-right text-amber-600 dark:text-amber-400 font-semibold">
                      ${op.avgRpm.toFixed(2)}
                    </td>
                    <td className="py-3 text-right font-black text-pink-600 dark:text-pink-400 text-sm">
                      ${op.totalRevenue.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Staff: Personal Operations Cockpit Benchmark */}
      {isStaff && personalBenchmark && (
        <div className="bg-gradient-to-br from-purple-500/10 via-indigo-500/5 to-transparent border border-purple-500/20 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
              Bảng Đánh Giá Hiệu Suất Cá Nhân So Với Tiêu Chuẩn Studio
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white/80 dark:bg-slate-900/80 rounded-xl p-4 border border-purple-500/10">
              <span className="text-xs text-slate-400">Doanh thu đóng góp:</span>
              <div className="text-2xl font-black text-pink-600 dark:text-pink-400 mt-1">
                ${personalBenchmark.myRevenue.toLocaleString()}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Bình quân studio: ${personalBenchmark.studioAvgRevenue.toLocaleString()}
              </p>
            </div>

            <div className="bg-white/80 dark:bg-slate-900/80 rounded-xl p-4 border border-purple-500/10">
              <span className="text-xs text-slate-400">Tỉ lệ hoàn thành KPI:</span>
              <div className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">
                {personalBenchmark.myCompletionRate}%
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Mục tiêu SLA: {personalBenchmark.studioAvgCompletionRate}%
              </p>
            </div>

            <div className="bg-white/80 dark:bg-slate-900/80 rounded-xl p-4 border border-purple-500/10">
              <span className="text-xs text-slate-400">Tổng điểm công tích lũy:</span>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {personalBenchmark.myWorkdayScoreSum} công
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {personalBenchmark.myHealthyAccountsCount}/{personalBenchmark.myTotalAccountsCount} tài khoản an toàn
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
