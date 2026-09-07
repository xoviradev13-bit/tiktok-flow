"use client";

import { useState, useEffect } from "react";
import {
  Bot,
  RefreshCw,
  Play,
  Square,
  Zap,
  CheckCircle,
  XCircle,
  Search,
  ExternalLink,
  Shield,
  DownloadCloud,
  Layers,
} from "lucide-react";
import { Pagination } from "@/components/ui/pagination";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { trpc } from "@/lib/trpc";

export default function GpmHubPage() {
  const [scanResult, setScanResult] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const utils = trpc.useUtils();

  useEffect(() => {
    const handleRefresh = () => {
      utils.accounts.list.invalidate();
      utils.gpm.checkStatus.invalidate();
    };
    window.addEventListener("refreshData", handleRefresh);
    return () => window.removeEventListener("refreshData", handleRefresh);
  }, [utils]);

  const { data: gpmStatus, refetch: refetchStatus } = trpc.gpm.checkStatus.useQuery();
  const { data: accountsData, isLoading: loading } = trpc.accounts.list.useQuery();

  const accounts = accountsData?.items || [];

  const scanMutation = trpc.gpm.scanAndImport.useMutation({
    onSuccess: (res) => {
      setScanResult({ success: true, message: res.message });
      utils.accounts.list.invalidate();
    },
    onError: (err) => {
      setScanResult({ success: false, message: err.message });
    },
  });

  const startMutation = trpc.gpm.startProfile.useMutation({
    onSuccess: () => {
      alert(`Đã mở profile thành công`);
    },
    onError: (err) => {
      alert(err.message);
    },
  });

  const handleScanProfiles = () => {
    setScanResult(null);
    scanMutation.mutate({});
  };

  const handleStartProfile = (profileId: string) => {
    startMutation.mutate({ gpmProfileId: profileId });
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Bot className="w-6 h-6 text-cyan-500" />
            GPMLogin Automation & Sync Hub
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Giao tiếp trực tiếp với GPMLogin Local REST API để tự động quét, mở profile ngầm và cào số liệu doanh thu.
          </p>
        </div>

        {/* Scan Button */}
        <button
          onClick={handleScanProfiles}
          disabled={scanMutation.isPending}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-600/20 active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
        >
          <DownloadCloud className={`w-4 h-4 ${scanMutation.isPending ? "animate-bounce" : ""}`} />
          <span>{scanMutation.isPending ? "Đang Quét GPM..." : "⚡ 1-Click Auto Scan & Import từ GPMLogin"}</span>
        </button>
      </div>

      {/* Connection Status Box */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm dark:shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
              gpmStatus?.isOnline
                ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400"
            }`}
          >
            {gpmStatus?.isOnline ? (
              <CheckCircle className="w-6 h-6" />
            ) : (
              <Bot className="w-6 h-6" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                GPMLogin Local HTTP Server
              </h2>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-black ${
                  gpmStatus?.isOnline
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                }`}
              >
                {gpmStatus?.isOnline ? "ONLINE" : "READY (PORT: 9495)"}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
              Endpoint: {gpmStatus?.baseUrl || "http://localhost:9495/api/v1"}
            </p>
          </div>
        </div>

        <button
          onClick={() => refetchStatus()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Kiểm Tra Lại Kết Nối</span>
        </button>
      </div>

      {/* Scan Result Feedback Banner */}
      {scanResult && (
        <div
          className={`p-4 rounded-2xl border text-xs font-medium animate-fadeIn ${
            scanResult.success
              ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300"
              : "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40 text-rose-800 dark:text-rose-300"
          }`}
        >
          <div className="font-bold text-sm mb-1">{scanResult.message}</div>
        </div>
      )}

      {/* Linked Accounts Fleet in GPM */}
      {loading ? (
        <DataTableSkeleton columnCount={6} rowCount={pageSize} />
      ) : (
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm dark:shadow-xl overflow-hidden relative z-0 isolate">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-500" />
              Danh Sách Profile Đã Liên Kết Trong Hệ Thống ({accounts.length})
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-slate-600 dark:text-slate-300 font-semibold text-xs border-b border-slate-200 dark:border-slate-800 normal-case">
                <tr>
                  <th className="px-5 py-3.5">Tài khoản TikTok</th>
                  <th className="px-4 py-3.5">GPM Profile ID</th>
                  <th className="px-4 py-3.5">Nhóm</th>
                  <th className="px-4 py-3.5">Người phụ trách</th>
                  <th className="px-4 py-3.5">Lần đồng bộ gần nhất</th>
                  <th className="px-5 py-3.5 text-right">Điều khiển profile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                {accounts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                      Chưa có tài khoản nào được liên kết với GPMLogin.
                    </td>
                  </tr>
                ) : (
                  accounts
                    .slice((page - 1) * pageSize, page * pageSize)
                    .map((acc: any) => (
                      <tr key={acc.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-5 py-3.5 font-bold text-slate-900 dark:text-slate-100">
                          @{acc.username}
                        </td>

                        <td className="px-4 py-3.5 font-mono text-[11px] text-cyan-600 dark:text-cyan-400">
                          {acc.gpmProfileId || <span className="text-slate-400 dark:text-slate-600">Chưa gán UUID</span>}
                        </td>

                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-400">
                          {acc.groupName || "Default Group"}
                        </td>

                        <td className="px-4 py-3.5 text-slate-800 dark:text-slate-300 font-medium">
                          {acc.assignedUser?.fullName || acc.assignedUser?.name || acc.assignedUser?.username || "Chưa gán"}
                        </td>

                        <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 text-[11px]">
                          {acc.lastSyncedAt
                            ? new Date(acc.lastSyncedAt).toLocaleTimeString("vi-VN") + " (" + new Date(acc.lastSyncedAt).toLocaleDateString("vi-VN") + ")"
                            : "Chưa sync"}
                        </td>

                        <td className="px-5 py-3.5 text-right">
                          {acc.gpmProfileId ? (
                            <button
                              onClick={() => handleStartProfile(acc.gpmProfileId!)}
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-500/10 dark:hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/30 transition-all cursor-pointer"
                            >
                              <Play className="w-3 h-3" /> Mở Profile
                            </button>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-600 text-xs italic">Cần gắn Profile ID</span>
                          )}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          {accounts.length > 0 && (
            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
              <Pagination
                currentPage={page}
                totalPages={Math.max(1, Math.ceil(accounts.length / pageSize))}
                totalItems={accounts.length}
                pageSize={pageSize}
                pageSizeOptions={[10, 25, 50]}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                hasNextPage={page < Math.max(1, Math.ceil(accounts.length / pageSize))}
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
