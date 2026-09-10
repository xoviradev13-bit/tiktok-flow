"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Bot,
  RefreshCw,
  Play,
  Square,
  Zap,
  CheckCircle2,
  XCircle,
  Search,
  ExternalLink,
  Shield,
  DownloadCloud,
  Layers,
  Users,
  Copy,
  Check,
  Filter,
  CheckSquare,
  Clock,
  Sparkles,
  Laptop,
} from "lucide-react";
import { Pagination } from "@/components/ui/pagination";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function GpmHubPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [runningProfiles, setRunningProfiles] = useState<Set<string>>(new Set());

  const utils = trpc.useUtils();

  useEffect(() => {
    const handleRefresh = () => {
      utils.accounts.list.invalidate();
      utils.gpm.checkStatus.invalidate();
    };
    window.addEventListener("refreshData", handleRefresh);
    return () => window.removeEventListener("refreshData", handleRefresh);
  }, [utils]);

  const { data: gpmStatus, refetch: refetchStatus, isFetching: checkingGpm } =
    trpc.gpm.checkStatus.useQuery();

  const { data: accountsData, isLoading: loading } = trpc.accounts.list.useQuery();

  const accounts = accountsData?.items || [];

  // Scan & Import Mutation
  const scanMutation = trpc.gpm.scanAndImport.useMutation({
    onSuccess: (res) => {
      toast.success(res.message || "Quét profile GPMLogin thành công!");
      utils.accounts.list.invalidate();
      utils.gpm.checkStatus.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Lỗi khi quét profile GPMLogin");
    },
  });

  // Start Profile Mutation
  const startMutation = trpc.gpm.startProfile.useMutation({
    onSuccess: (_, vars) => {
      setRunningProfiles((prev) => new Set(prev).add(vars.gpmProfileId));
      toast.success("Đã mở profile GPMLogin (TikTok Studio)!");
    },
    onError: (err) => {
      toast.error(err.message || "Không thể mở profile");
    },
  });

  // Stop Profile Mutation
  const stopMutation = trpc.gpm.stopProfile.useMutation({
    onSuccess: (_, vars) => {
      setRunningProfiles((prev) => {
        const next = new Set(prev);
        next.delete(vars.gpmProfileId);
        return next;
      });
      toast.success("Đã dừng profile GPMLogin.");
    },
    onError: (err) => {
      toast.error(err.message || "Không thể dừng profile");
    },
  });

  // Sync Single Account Mutation
  const syncAccountMutation = trpc.accounts.syncAccount.useMutation({
    onSuccess: () => {
      toast.success("Đồng bộ số liệu tài khoản thành công!");
      utils.accounts.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Lỗi đồng bộ tài khoản");
    },
  });

  const handleScanProfiles = () => {
    scanMutation.mutate({});
  };

  const handleStartProfile = (profileId: string) => {
    startMutation.mutate({
      gpmProfileId: profileId,
      url: "https://www.tiktok.com/tiktokstudio",
    });
  };

  const handleStopProfile = (profileId: string) => {
    stopMutation.mutate({ gpmProfileId: profileId });
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Đã chép Profile ID!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filter accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc: any) => {
      const matchesSearch =
        searchQuery === "" ||
        acc.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        acc.gpmProfileId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        acc.groupName?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "ALL" ||
        acc.status === statusFilter ||
        (statusFilter === "LINKED" && Boolean(acc.gpmProfileId)) ||
        (statusFilter === "UNASSIGNED" && !acc.assignedUserId);

      return matchesSearch && matchesStatus;
    });
  }, [accounts, searchQuery, statusFilter]);

  // Compute 4 Stat Cards
  const stats = useMemo(() => {
    const totalLinked = accounts.filter((a: any) => Boolean(a.gpmProfileId)).length;
    const totalActive = accounts.filter((a: any) => a.status === "ACTIVE").length;
    const totalUnassigned = accounts.filter((a: any) => !a.assignedUserId).length;
    return {
      total: accounts.length,
      linked: totalLinked,
      active: totalActive,
      unassigned: totalUnassigned,
    };
  }, [accounts]);

  const paginatedAccounts = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredAccounts.slice(start, start + pageSize);
  }, [filteredAccounts, page, pageSize]);

  return (
    <div className="space-y-6 animate-fadeIn pb-16">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                GPMLogin Fleet & Automation Hub
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Quản trị dàn profile GPMLogin, tự động hóa quét số liệu TikTok Creator Rewards và điều khiển trình duyệt ngầm.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons & Status Badge */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Connection Status Badge */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
              gpmStatus?.isOnline
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                gpmStatus?.isOnline ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
              }`}
            />
            <span>
              {gpmStatus?.isOnline
                ? `GPM Online (Port: ${gpmStatus.port || "auto"})`
                : "GPM Offline"}
            </span>
            <button
              onClick={() => refetchStatus()}
              disabled={checkingGpm}
              className="ml-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              title="Kiểm tra lại kết nối"
            >
              <RefreshCw className={`w-3 h-3 ${checkingGpm ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* 1-Click Scan Button */}
          <button
            onClick={handleScanProfiles}
            disabled={scanMutation.isPending}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-600/20 active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
          >
            <DownloadCloud className={`w-4 h-4 ${scanMutation.isPending ? "animate-bounce" : ""}`} />
            <span>{scanMutation.isPending ? "Đang quét..." : "1-Click Scan Profile"}</span>
          </button>
        </div>
      </div>

      {/* 4 Premium Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-xs relative overflow-hidden group hover:border-cyan-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Tổng Dàn Tài Khoản
            </span>
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
          </div>
          {loading ? (
            <div className="h-8 w-16 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse mt-3" />
          ) : (
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-3 tracking-tight">
              {stats.total}
            </div>
          )}
          <div className="text-xs text-slate-400 mt-1 flex items-center gap-1 font-medium">
            <span>Dàn account TikTok trong hệ thống</span>
          </div>
        </div>

        {/* Card 2 */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-xs relative overflow-hidden group hover:border-emerald-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Đã Gắn GPM Profile
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          {loading ? (
            <div className="h-8 w-16 bg-emerald-100 dark:bg-emerald-950/60 rounded-lg animate-pulse mt-3" />
          ) : (
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-3 tracking-tight">
              {stats.linked}
            </div>
          )}
          <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1 font-medium">
            <span>Sẵn sàng cào số liệu & mở profile</span>
          </div>
        </div>

        {/* Card 3 */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-xs relative overflow-hidden group hover:border-indigo-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Đang Hoạt Động (Active)
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
          </div>
          {loading ? (
            <div className="h-8 w-16 bg-indigo-100 dark:bg-indigo-950/60 rounded-lg animate-pulse mt-3" />
          ) : (
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-3 tracking-tight">
              {stats.active}
            </div>
          )}
          <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-1 flex items-center gap-1 font-medium">
            <span>Trạng thái tài khoản chuẩn sạch</span>
          </div>
        </div>

        {/* Card 4 */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-xs relative overflow-hidden group hover:border-amber-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Chưa Phân Công
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          {loading ? (
            <div className="h-8 w-16 bg-amber-100 dark:bg-amber-950/60 rounded-lg animate-pulse mt-3" />
          ) : (
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-3 tracking-tight">
              {stats.unassigned}
            </div>
          )}
          <div className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1 font-medium">
            <span>Cần phân công nhân viên quản lý</span>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm theo username, Profile ID, nhóm..."
            className="w-full h-10 pl-9 pr-4 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-slate-900 dark:text-white placeholder:text-slate-400"
          />
        </div>

        {/* Quick Filter Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => {
              setStatusFilter("ALL");
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              statusFilter === "ALL"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Tất Cả ({loading ? "..." : stats.total})
          </button>

          <button
            onClick={() => {
              setStatusFilter("LINKED");
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              statusFilter === "LINKED"
                ? "bg-cyan-600 text-white shadow-xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Đã Gắn GPM ({loading ? "..." : stats.linked})
          </button>

          <button
            onClick={() => {
              setStatusFilter("ACTIVE");
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              statusFilter === "ACTIVE"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Đang Hoạt Động ({loading ? "..." : stats.active})
          </button>

          <button
            onClick={() => {
              setStatusFilter("UNASSIGNED");
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              statusFilter === "UNASSIGNED"
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Chưa Gán ({loading ? "..." : stats.unassigned})
          </button>
        </div>
      </div>

      {/* Modern Data Table */}
      {loading ? (
        <DataTableSkeleton columnCount={6} rowCount={pageSize} />
      ) : (
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-4">Tài Khoản TikTok</th>
                  <th className="px-4 py-4">GPM Profile ID</th>
                  <th className="px-4 py-4">Nhóm & Quốc Gia</th>
                  <th className="px-4 py-4">Nhân Sự Quản Lý</th>
                  <th className="px-4 py-4">Trạng Thái</th>
                  <th className="px-4 py-4">Lần Sync Cuối</th>
                  <th className="px-5 py-4 text-right">Thao Tác Profile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {paginatedAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                      Không tìm thấy profile nào phù hợp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  paginatedAccounts.map((acc: any) => {
                    const isRunning = acc.gpmProfileId && runningProfiles.has(acc.gpmProfileId);
                    return (
                      <tr
                        key={acc.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        {/* TikTok Account */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                              {acc.username.slice(0, 1).toUpperCase()}
                            </div>
                            <div>
                              {acc.gpmProfileId ? (
                                <button
                                  type="button"
                                  onClick={() => handleStartProfile(acc.gpmProfileId!)}
                                  disabled={startMutation.isPending}
                                  className="font-bold text-slate-900 dark:text-slate-100 hover:text-cyan-500 flex items-center gap-1.5 transition-colors cursor-pointer text-left group/btn"
                                  title="Mở trình duyệt GPM profile (vào TikTok Studio)"
                                >
                                  <span className="group-hover/btn:underline">@{acc.username}</span>
                                  <Play className="w-3 h-3 text-cyan-500 fill-cyan-500/20 group-hover/btn:scale-110 transition-transform" />
                                </button>
                              ) : (
                                <span
                                  className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1 text-slate-500"
                                  title="Tài khoản chưa gán GPM Profile ID"
                                >
                                  @{acc.username}
                                </span>
                              )}
                              <div className="text-xs text-slate-400">
                                {Number(acc.totalFollowers || 0).toLocaleString()} followers • {acc.totalVideos || 0} videos
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* GPM Profile ID */}
                        <td className="px-4 py-4 font-mono text-xs">
                          {acc.gpmProfileId ? (
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 text-xs font-bold">
                                {acc.gpmProfileId.slice(0, 8)}...{acc.gpmProfileId.slice(-4)}
                              </span>
                              <button
                                onClick={() => handleCopy(acc.gpmProfileId!, acc.id)}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                                title="Sao chép UUID"
                              >
                                {copiedId === acc.id ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-xs">Chưa gán</span>
                          )}
                        </td>

                        {/* Group & Country */}
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold">
                              {acc.country || "US"}
                            </span>
                            <span className="text-slate-600 dark:text-slate-400 truncate max-w-[120px]">
                              {acc.groupName || "Default Fleet"}
                            </span>
                          </div>
                        </td>

                        {/* Assigned User */}
                        <td className="px-4 py-4">
                          {acc.assignedUser ? (
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold">
                                {(acc.assignedUser.name || acc.assignedUser.username || "U")[0].toUpperCase()}
                              </div>
                              <span className="font-medium text-slate-800 dark:text-slate-200">
                                {acc.assignedUser.name || acc.assignedUser.username}
                              </span>
                            </div>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold">
                              Chưa gán
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-4">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider ${
                              acc.status === "ACTIVE"
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                : acc.status === "WARMING"
                                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                : "bg-slate-500/15 text-slate-600 dark:text-slate-400"
                            }`}
                          >
                            {acc.status}
                          </span>
                        </td>

                        {/* Last Synced */}
                        <td className="px-4 py-4 text-slate-500 dark:text-slate-400 text-xs">
                          {acc.lastSyncedAt ? (
                            <span title={new Date(acc.lastSyncedAt).toLocaleString("vi-VN")}>
                              {new Date(acc.lastSyncedAt).toLocaleTimeString("vi-VN", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}{" "}
                              ({new Date(acc.lastSyncedAt).toLocaleDateString("vi-VN")})
                            </span>
                          ) : (
                            <span className="text-slate-400">Chưa sync</span>
                          )}
                        </td>

                        {/* Action Buttons */}
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {acc.gpmProfileId ? (
                              <>
                                {isRunning ? (
                                  <button
                                    onClick={() => handleStopProfile(acc.gpmProfileId!)}
                                    disabled={stopMutation.isPending}
                                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 transition-all cursor-pointer flex items-center gap-1"
                                  >
                                    <Square className="w-3 h-3 fill-current" />
                                    <span>Dừng</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleStartProfile(acc.gpmProfileId!)}
                                    disabled={startMutation.isPending}
                                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-500/10 dark:hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 transition-all cursor-pointer flex items-center gap-1"
                                  >
                                    <Play className="w-3 h-3 fill-current" />
                                    <span>Mở</span>
                                  </button>
                                )}

                                <button
                                  onClick={() => syncAccountMutation.mutate({ accountId: acc.id })}
                                  disabled={syncAccountMutation.isPending}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
                                  title="Đồng bộ số liệu tài khoản"
                                >
                                  <RefreshCw
                                    className={`w-3.5 h-3.5 ${
                                      syncAccountMutation.isPending ? "animate-spin text-cyan-500" : ""
                                    }`}
                                  />
                                </button>
                              </>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Cần Profile ID</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredAccounts.length > 0 && (
            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
              <Pagination
                currentPage={page}
                totalPages={Math.max(1, Math.ceil(filteredAccounts.length / pageSize))}
                totalItems={filteredAccounts.length}
                pageSize={pageSize}
                pageSizeOptions={[10, 25, 50]}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                hasNextPage={page < Math.max(1, Math.ceil(filteredAccounts.length / pageSize))}
                hasPreviousPage={page > 1}
                onPageChange={setPage}
                isLoading={loading}
                itemLabel="profiles"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
