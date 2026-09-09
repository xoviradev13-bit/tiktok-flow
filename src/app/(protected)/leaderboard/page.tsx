"use client";

import { useState, useEffect } from "react";
import {
  Trophy,
  Medal,
  Award,
  DollarSign,
  CheckSquare,
  TrendingUp,
  Sparkles,
  Flame,
  Crown,
  Calendar,
} from "lucide-react";
import confetti from "canvas-confetti";
import { Pagination } from "@/components/ui/pagination";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { LeaderboardPageSkeleton } from "@/components/skeletons/PageSkeletons";
import { trpc } from "@/lib/trpc";

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<"TODAY" | "THIS_WEEK" | "THIS_MONTH" | "ALL_TIME">("THIS_MONTH");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const utils = trpc.useUtils();

  useEffect(() => {
    const handleRefresh = () => {
      utils.leaderboard.getRanking.invalidate();
    };
    window.addEventListener("refreshData", handleRefresh);
    return () => window.removeEventListener("refreshData", handleRefresh);
  }, [utils]);

  const { data: leaderboard = [], isLoading: loading } = trpc.leaderboard.getRanking.useQuery({
    period,
  });

  const top1 = leaderboard[0];
  const top2 = leaderboard[1];
  const top3 = leaderboard[2];

  const handleCelebrate = () => {
    confetti({
      particleCount: 120,
      spread: 100,
      origin: { y: 0.6 },
    });
  };

  if (loading) {
    return <LeaderboardPageSkeleton />;
  }

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-500" />
            Bảng Xếp Hạng Nhân Sự (Leaderboard & KPI)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Vinh danh nhân viên có doanh thu cao nhất, số ngày công tích lũy và hiệu suất RPM vượt trội.
          </p>
        </div>

        {/* Period Filter Buttons */}
        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 rounded-xl shadow-sm flex-wrap sm:flex-nowrap overflow-x-auto max-w-full">
          {[
            { key: "TODAY" as const, label: "Hôm Nay" },
            { key: "THIS_WEEK" as const, label: "Tuần Này" },
            { key: "THIS_MONTH" as const, label: "Tháng Này" },
            { key: "ALL_TIME" as const, label: "Toàn Thời Gian" },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setPeriod(item.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                period === item.key
                  ? "bg-gradient-to-r from-yellow-500 to-amber-600 text-slate-950 shadow-md shadow-yellow-500/20"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Podium Top 3 Cards (Gamification) */}
      {leaderboard.length >= 2 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 items-end">
          {/* Top 2: Silver */}
          {top2 && (
            <div className="bg-gradient-to-t from-slate-100 via-white to-slate-50 dark:from-slate-900 dark:via-slate-900/90 dark:to-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-6 text-center shadow-sm dark:shadow-xl order-2 md:order-1 relative group hover:scale-[1.02] transition-transform">
              <div className="w-12 h-12 mx-auto rounded-full bg-slate-200 dark:bg-slate-700 border-2 border-slate-400 flex items-center justify-center text-slate-700 dark:text-slate-300 font-black text-lg mb-3 shadow-md">
                🥈 2
              </div>
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                {top2.fullName}
              </h3>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {top2.accountsCount} accounts | {top2.totalWorkdays} ngày công
              </div>
              <div className="mt-4 text-2xl font-black text-amber-600 dark:text-amber-300">
                ${top2.periodRevenue.toLocaleString()}
              </div>
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                RPM: <span className="text-emerald-600 dark:text-emerald-400 font-bold">${top2.avgRpm}</span>
              </div>
            </div>
          )}

          {/* Top 1: Gold Winner (Tallest) */}
          {top1 && (
            <div className="bg-gradient-to-t from-amber-50 via-yellow-50/60 to-white dark:from-yellow-950/40 dark:via-slate-900 dark:to-slate-900 border-2 border-yellow-400 dark:border-yellow-500/60 rounded-3xl p-8 text-center shadow-lg dark:shadow-2xl order-1 md:order-2 relative group hover:scale-[1.03] transition-transform">
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-yellow-400 to-amber-500 text-slate-950 font-black text-xs px-3.5 py-1 rounded-full shadow-lg flex items-center gap-1">
                <Crown className="w-3.5 h-3.5 fill-slate-950" /> QUÁN QUÂN
              </div>
              <div className="w-16 h-16 mx-auto rounded-full bg-yellow-400/20 border-2 border-yellow-400 flex items-center justify-center text-yellow-600 dark:text-yellow-300 font-black text-2xl mb-3 shadow-xl shadow-yellow-500/20">
                🥇 1
              </div>
              <h3 className="font-black text-slate-900 dark:text-white text-lg">
                {top1.fullName}
              </h3>
              <div className="text-xs text-yellow-700 dark:text-yellow-200/80 mt-0.5">
                {top1.accountsCount} accounts | {top1.totalWorkdays} ngày công
              </div>
              <div className="mt-4 text-3xl font-black text-amber-600 dark:text-yellow-400">
                ${top1.periodRevenue.toLocaleString()}
              </div>
              <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                RPM: <span className="text-emerald-600 dark:text-emerald-400 font-bold">${top1.avgRpm}</span> • Doanh thu/acc: <span className="text-amber-600 dark:text-amber-300 font-bold">${top1.revPerAccount}</span>
              </div>
            </div>
          )}

          {/* Top 3: Bronze */}
          {top3 && (
            <div className="bg-gradient-to-t from-slate-100 via-white to-slate-50 dark:from-slate-900 dark:via-slate-900/90 dark:to-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-6 text-center shadow-sm dark:shadow-xl order-3 relative group hover:scale-[1.02] transition-transform">
              <div className="w-12 h-12 mx-auto rounded-full bg-amber-100 dark:bg-amber-950 border-2 border-amber-500 dark:border-amber-600 flex items-center justify-center text-amber-700 dark:text-amber-400 font-black text-lg mb-3 shadow-md">
                🥉 3
              </div>
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                {top3.fullName}
              </h3>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {top3.accountsCount} accounts | {top3.totalWorkdays} ngày công
              </div>
              <div className="mt-4 text-2xl font-black text-amber-600 dark:text-amber-300">
                ${top3.periodRevenue.toLocaleString()}
              </div>
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                RPM: <span className="text-emerald-600 dark:text-emerald-400 font-bold">${top3.avgRpm}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Full Leaderboard Table */}
      {loading ? (
        <DataTableSkeleton columnCount={8} rowCount={pageSize} />
      ) : (
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm dark:shadow-xl overflow-hidden relative z-0 isolate">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Medal className="w-4 h-4 text-yellow-500" />
              Bảng Xếp Hạng Chi Tiết Toàn Team
            </h2>
            <button
              onClick={handleCelebrate}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-pink-50 hover:bg-pink-100 dark:bg-pink-600/20 dark:hover:bg-pink-600/30 text-pink-600 dark:text-pink-400 transition-colors cursor-pointer border border-pink-200 dark:border-pink-500/20"
            >
              <Sparkles className="w-3.5 h-3.5" /> Chúc Mừng
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300 min-w-[850px]">
              <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-slate-600 dark:text-slate-300 font-semibold text-xs border-b border-slate-200 dark:border-slate-800 normal-case">
                <tr>
                  <th className="px-5 py-3.5">Hạng</th>
                  <th className="px-4 py-3.5">Nhân viên</th>
                  <th className="px-4 py-3.5">Số acc phụ trách</th>
                  <th className="px-4 py-3.5">Ngày công tích lũy</th>
                  <th className="px-4 py-3.5">Tỷ lệ đạt KPI</th>
                  <th className="px-4 py-3.5">RPM trung bình</th>
                  <th className="px-4 py-3.5">Doanh thu / acc</th>
                  <th className="px-5 py-3.5 text-right">Tổng doanh thu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                {leaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                      Chưa có dữ liệu xếp hạng trong kỳ này.
                    </td>
                  </tr>
                ) : (
                  leaderboard
                    .slice((page - 1) * pageSize, page * pageSize)
                    .map((user) => (
                      <tr
                        key={user.userId}
                        className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                          user.rank === 1
                            ? "bg-yellow-50/50 dark:bg-yellow-950/10 font-bold"
                            : user.rank === 2
                            ? "bg-slate-50/50 dark:bg-slate-800/20"
                            : ""
                        }`}
                      >
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-black text-xs ${
                              user.rank === 1
                                ? "bg-yellow-500 text-slate-950 shadow-sm"
                                : user.rank === 2
                                ? "bg-slate-300 text-slate-950"
                                : user.rank === 3
                                ? "bg-amber-600 text-white"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                            }`}
                          >
                            {user.rank}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="font-extrabold text-slate-900 dark:text-white">
                            {user.fullName}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                            @{user.username} ({user.role})
                          </div>
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap font-semibold text-slate-800 dark:text-slate-200">
                          {user.accountsCount} accounts
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 h-7.5 rounded-xl text-xs font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-2xs">
                            {user.totalWorkdays} Ngày
                          </span>
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap font-bold text-cyan-600 dark:text-cyan-400">
                          {user.avgCompletionRate}%
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap font-bold text-emerald-600 dark:text-emerald-400">
                          ${user.avgRpm}
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap font-semibold text-slate-700 dark:text-slate-300">
                          ${user.revPerAccount}
                        </td>

                        <td className="px-5 py-3.5 whitespace-nowrap text-right font-black text-amber-600 dark:text-amber-300 text-sm">
                          ${user.periodRevenue.toLocaleString()}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          {leaderboard.length > 0 && (
            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
              <Pagination
                currentPage={page}
                totalPages={Math.max(1, Math.ceil(leaderboard.length / pageSize))}
                totalItems={leaderboard.length}
                pageSize={pageSize}
                pageSizeOptions={[10, 25, 50]}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                hasNextPage={page < Math.max(1, Math.ceil(leaderboard.length / pageSize))}
                hasPreviousPage={page > 1}
                onPageChange={setPage}
                isLoading={loading}
                itemLabel="nhân viên"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
