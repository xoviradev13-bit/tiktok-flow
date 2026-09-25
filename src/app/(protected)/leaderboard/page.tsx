"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useUrlParams } from "@/hooks/useUrlState";
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
  Shield,
  Layers,
  Users,
  Search,
  X,
} from "lucide-react";
import confetti from "canvas-confetti";
import { Pagination } from "@/components/ui/pagination";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { LeaderboardPageSkeleton } from "@/components/skeletons/PageSkeletons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserAccountsHoverCard } from "@/components/user/UserAccountsHoverCard";
import { trpc } from "@/lib/trpc";

function LeaderboardPageContent() {
  // SaaS URL Query State Synchronization
  const { searchParams, updateUrlParams } = useUrlParams();

  const validPeriods = ["TODAY", "THIS_WEEK", "THIS_MONTH", "ALL_TIME"] as const;
  const paramPeriod = searchParams?.get("period") as any;
  const initialPeriod = validPeriods.includes(paramPeriod) ? paramPeriod : "THIS_MONTH";
  const [period, setPeriod] = useState<"TODAY" | "THIS_WEEK" | "THIS_MONTH" | "ALL_TIME">(initialPeriod);

  const initialTeam = searchParams?.get("teamId") || "ALL";
  const [teamFilter, setTeamFilter] = useState<string>(initialTeam);

  const initialSearch = searchParams?.get("q") || searchParams?.get("search") || "";
  const [searchQuery, setSearchQuery] = useState(initialSearch);

  const initialPage = Number(searchParams?.get("p") || searchParams?.get("page")) || 1;
  const initialPageSize = Number(searchParams?.get("ps") || searchParams?.get("pageSize")) || 10;
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // Auto sync active state to URL
  useEffect(() => {
    updateUrlParams(
      {
        period: period,
        teamId: teamFilter,
        q: searchQuery,
        p: page,
        ps: pageSize,
      },
      {
        period: "THIS_MONTH",
        teamId: "ALL",
        q: "",
        p: 1,
        ps: 10,
      }
    );
  }, [period, teamFilter, searchQuery, page, pageSize, updateUrlParams]);

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
    teamId: teamFilter,
  });

  const { data: allTeams = [] } = trpc.leaderboard.getTeams.useQuery();

  const filteredLeaderboard = useMemo(() => {
    if (!searchQuery.trim()) return leaderboard;
    const q = searchQuery.toLowerCase().trim().replace(/^@+/, "");
    return leaderboard.filter((u: any) => {
      const fn = String(u.fullName || "").toLowerCase();
      const un = String(u.username || "").toLowerCase();
      const n = String(u.name || "").toLowerCase();
      return fn.includes(q) || un.includes(q) || n.includes(q);
    });
  }, [leaderboard, searchQuery]);

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
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2 min-w-0">
            <Trophy className="w-6 h-6 text-yellow-500 shrink-0" />
            <span className="truncate">Bảng Xếp Hạng Nhân Sự</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
            Vinh danh nhân viên có doanh thu cao nhất, số ngày công tích lũy và hiệu suất RPM vượt trội.
          </p>
        </div>

        {/* Filter Controls: Team Select + Period Filter Buttons */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Team Filter Dropdown */}
          <Select
            value={teamFilter}
            onValueChange={(val) => {
              setTeamFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger
              className={`h-9 w-auto min-w-[170px] px-3 rounded-xl border text-xs font-bold transition-all shadow-xs cursor-pointer ${teamFilter !== "ALL"
                ? "bg-gradient-to-r from-yellow-500 to-amber-600 text-slate-950 border-yellow-500/30 shadow-md shadow-yellow-500/20"
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <Users className={`w-3.5 h-3.5 shrink-0 ${teamFilter !== "ALL" ? "text-slate-950" : "text-slate-500 dark:text-slate-400"}`} />
                <SelectValue placeholder="Tất cả thành viên" />
              </div>
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
              <SelectItem value="ALL" className="font-semibold text-xs cursor-pointer">
                Tất cả thành viên
              </SelectItem>
              {allTeams.map((team: any) => (
                <SelectItem key={team.id} value={team.id} className="font-semibold text-xs cursor-pointer">
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Period Filter Buttons */}
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 rounded-xl shadow-xs flex-wrap sm:flex-nowrap overflow-x-auto max-w-full">
            {[
              { key: "TODAY" as const, label: "Hôm Nay" },
              { key: "THIS_WEEK" as const, label: "Tuần Này" },
              { key: "THIS_MONTH" as const, label: "Tháng Này" },
              { key: "ALL_TIME" as const, label: "Toàn Thời Gian" },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setPeriod(item.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${period === item.key
                  ? "bg-gradient-to-r from-yellow-500 to-amber-600 text-slate-950 shadow-md shadow-yellow-500/20"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
              >
                {item.label}
              </button>
            ))}
          </div>
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
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center justify-center gap-1.5 flex-wrap">
                <span>{top2.accountsCount} accounts | {top2.totalWorkdays} ngày công</span>
                {top2.teamName && (
                  <span className="text-pink-600 dark:text-pink-400 font-semibold">• {top2.teamName}</span>
                )}
              </div>
              <div className="mt-4 text-2xl font-black text-amber-600 dark:text-amber-300">
                ${Number(top2.periodRevenue).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                RPM: <span className="text-emerald-600 dark:text-emerald-400 font-bold">${Number(top2.avgRpm).toFixed(2)}</span>
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
              <div className="text-xs text-yellow-700 dark:text-yellow-200/80 mt-0.5 flex items-center justify-center gap-1.5 flex-wrap">
                <span>{top1.accountsCount} accounts | {top1.totalWorkdays} ngày công</span>
                {top1.teamName && (
                  <span className="font-bold text-amber-800 dark:text-yellow-300">• {top1.teamName}</span>
                )}
              </div>
              <div className="mt-4 text-3xl font-black text-amber-600 dark:text-yellow-400">
                ${Number(top1.periodRevenue).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                RPM: <span className="text-emerald-600 dark:text-emerald-400 font-bold">${Number(top1.avgRpm).toFixed(2)}</span> • Doanh thu/acc: <span className="text-amber-600 dark:text-amber-300 font-bold">${Number(top1.revPerAccount).toFixed(2)}</span>
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
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center justify-center gap-1.5 flex-wrap">
                <span>{top3.accountsCount} accounts | {top3.totalWorkdays} ngày công</span>
                {top3.teamName && (
                  <span className="text-pink-600 dark:text-pink-400 font-semibold">• {top3.teamName}</span>
                )}
              </div>
              <div className="mt-4 text-2xl font-black text-amber-600 dark:text-amber-300">
                ${Number(top3.periodRevenue).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                RPM: <span className="text-emerald-600 dark:text-emerald-400 font-bold">${Number(top3.avgRpm).toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Full Leaderboard Table */}
      {loading ? (
        <DataTableSkeleton columnCount={10} rowCount={pageSize} />
      ) : (
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm dark:shadow-xl overflow-hidden relative z-0 isolate">
          <div className="px-5 py-3 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 shrink-0">
              <Medal className="w-4 h-4 text-yellow-500 shrink-0" />
              <span>Bảng Xếp Hạng Chi Tiết Toàn Team</span>
              {searchQuery && (
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                  ({filteredLeaderboard.length}/{leaderboard.length})
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              {/* Search input for username / full name */}
              <div className="relative w-48 sm:w-60">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Tìm tên hoặc @username..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="w-full h-8 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-8 pr-7 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 focus:ring-1 focus:ring-pink-500/20 transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setPage(1);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                    title="Xóa tìm kiếm"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleCelebrate}
                    className="h-8 flex items-center gap-1.5 px-3 rounded-xl text-xs font-bold bg-pink-50 hover:bg-pink-100 dark:bg-pink-600/20 dark:hover:bg-pink-600/30 text-pink-600 dark:text-pink-400 transition-colors cursor-pointer border border-pink-200 dark:border-pink-500/20 shrink-0 whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Chúc Mừng
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs font-semibold">
                  Bắn pháo hoa vinh danh bảng vàng
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300 min-w-[950px]">
              <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-slate-600 dark:text-slate-300 font-semibold text-xs border-b border-slate-200 dark:border-slate-800 normal-case">
                <tr>
                  <th className="sticky left-0 z-20 bg-slate-50 dark:bg-slate-950 px-5 py-3.5 w-16 min-w-[64px] max-w-[64px]">Hạng</th>
                  <th className="sticky left-16 z-20 bg-slate-50 dark:bg-slate-950 px-4 py-3.5 min-w-[200px] border-r border-slate-200/80 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">Nhân viên</th>
                  <th className="px-4 py-3.5 min-w-[130px] whitespace-nowrap">Vai trò</th>
                  <th className="px-4 py-3.5 min-w-[150px] whitespace-nowrap">Đội nhóm</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Số acc phụ trách</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Ngày công tích lũy</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Tỷ lệ đạt KPI</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">RPM trung bình</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Doanh thu / acc</th>
                  <th className="px-5 py-3.5 text-right whitespace-nowrap">Tổng doanh thu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                {filteredLeaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                      {searchQuery.trim()
                        ? `Không tìm thấy nhân viên nào phù hợp với từ khóa "${searchQuery}".`
                        : "Chưa có dữ liệu xếp hạng trong kỳ này."}
                    </td>
                  </tr>
                ) : (
                  filteredLeaderboard
                    .slice((page - 1) * pageSize, page * pageSize)
                    .map((user) => (
                      <tr
                        key={user.userId}
                        className={`group hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${user.rank === 1
                          ? "bg-yellow-50/50 dark:bg-yellow-950/10 font-bold"
                          : user.rank === 2
                            ? "bg-slate-50/50 dark:bg-slate-800/20"
                            : ""
                          }`}
                      >
                        <td className={`sticky left-0 z-10 px-5 py-3.5 whitespace-nowrap w-16 min-w-[64px] max-w-[64px] transition-colors ${user.rank === 1
                          ? "bg-yellow-50 dark:bg-[#1a1708]"
                          : user.rank === 2
                            ? "bg-slate-50 dark:bg-[#111622]"
                            : "bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800"
                          }`}>
                          <span
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-black text-xs ${user.rank === 1
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

                        <td className={`sticky left-16 z-10 px-4 py-3.5 whitespace-nowrap min-w-[200px] border-r border-slate-200/80 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] transition-colors ${user.rank === 1
                          ? "bg-yellow-50 dark:bg-[#1a1708]"
                          : user.rank === 2
                            ? "bg-slate-50 dark:bg-[#111622]"
                            : "bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800"
                          }`}>
                          <div className="font-extrabold text-slate-900 dark:text-white">
                            {user.fullName}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                            @{user.username}
                          </div>
                        </td>

                        {/* Vai trò */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span
                            className={`h-7.5 inline-flex items-center gap-1.5 px-2.5 rounded-xl text-xs font-bold ${user.role === "ADMIN"
                              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                              : user.role === "LEAD"
                                ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20"
                                : "bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20"
                              }`}
                          >
                            <Shield className="w-3 h-3" />
                            <span>{user.role === "ADMIN" ? "Quản trị viên" : user.role === "LEAD" ? "Trưởng nhóm" : "Nhân viên"}</span>
                          </span>
                        </td>

                        {/* Đội nhóm */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {user.teamName ? (
                            <span
                              title={user.teamName}
                              className="inline-flex items-center gap-1.5 px-2.5 h-7.5 rounded-xl text-xs font-semibold bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800 max-w-[150px]"
                            >
                              <Layers className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                              <span className="truncate max-w-[105px]">{user.teamName}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-xs">Chưa gán nhóm</span>
                          )}
                        </td>

                        {/* Số acc phụ trách with UserAccountsHoverCard */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <UserAccountsHoverCard
                            userId={user.userId}
                            userName={user.fullName}
                            accountsCount={user.accountsCount}
                            accounts={(user as any).accounts || []}
                          />
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
                          ${Number(user.avgRpm).toFixed(2)}
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap font-semibold text-slate-700 dark:text-slate-300">
                          ${Number(user.revPerAccount).toFixed(2)}
                        </td>

                        <td className="px-5 py-3.5 whitespace-nowrap text-right font-black text-amber-600 dark:text-amber-300 text-sm">
                          ${Number(user.periodRevenue).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          {filteredLeaderboard.length > 0 && (
            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
              <Pagination
                currentPage={page}
                totalPages={Math.max(1, Math.ceil(filteredLeaderboard.length / pageSize))}
                totalItems={filteredLeaderboard.length}
                pageSize={pageSize}
                pageSizeOptions={[10, 25, 50]}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                hasNextPage={page < Math.max(1, Math.ceil(filteredLeaderboard.length / pageSize))}
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

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<LeaderboardPageSkeleton />}>
      <LeaderboardPageContent />
    </Suspense>
  );
}
