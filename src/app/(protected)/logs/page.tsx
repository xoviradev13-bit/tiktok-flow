"use client";

import { useState, useMemo } from "react";
import {
  FileText,
  Search,
  Filter,
  Download,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Bug,
  Activity,
  Layers,
  Users,
  Calendar,
  Sparkles,
  Check,
  ExternalLink,
  MessageSquare,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Pagination } from "@/components/ui/pagination";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import BugReportModal from "@/components/bug-report/BugReportModal";
import { toast } from "sonner";
import { useSession } from "next-auth/react";

export default function LogsPage() {
  const { data: session } = useSession();
  const rawRole = (session?.user as any)?.role || (session?.user as any)?.userType || "STAFF";
  const userRole = String(rawRole).toUpperCase();
  const isAdminOrLead = userRole === "ADMIN" || userRole === "LEAD";

  const [activeTab, setActiveTab] = useState<"logs" | "bugs">("logs");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [logTypeFilter, setLogTypeFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isBugModalOpen, setIsBugModalOpen] = useState(false);

  const utils = trpc.useUtils();

  // Query Audit Logs
  const { data: auditData, isLoading: logsLoading, refetch: refetchLogs } =
    trpc.support.getAuditLogs.useQuery({
      page,
      pageSize,
      logType: logTypeFilter,
      search: searchQuery || undefined,
    });

  // Query Bug Reports
  const { data: bugsData, isLoading: bugsLoading, refetch: refetchBugs } =
    trpc.support.listBugReports.useQuery({
      limit: 100,
    });

  // Mutation to update bug report status
  const updateBugMutation = trpc.support.updateBugReportStatus.useMutation({
    onSuccess: () => {
      toast.success("Đã cập nhật trạng thái xử lý sự cố!");
      utils.support.listBugReports.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Không thể cập nhật trạng thái");
    },
  });

  const logs = auditData?.items || [];
  const stats = auditData?.stats || {
    total: 0,
    statusChanges: 0,
    syncEvents: 0,
    alerts: 0,
  };

  const bugReports = bugsData?.items || [];

  // Export logs to CSV
  const handleExportCSV = () => {
    if (logs.length === 0) {
      toast.error("Không có dữ liệu log để xuất.");
      return;
    }

    const headers = ["Thời gian", "Tài khoản", "Loại sự kiện", "Nội dung chi tiết", "Người thực hiện"];
    const rows = logs.map((l: any) => [
      new Date(l.createdAt).toLocaleString("vi-VN"),
      l.account?.username ? `@${l.account.username}` : "Hệ thống",
      l.logType,
      `"${l.message.replace(/"/g, '""')}"`,
      l.actorName || "System",
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `tiktokflow_audit_logs_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Đã xuất file log CSV thành công!");
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-16">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                Nhật Ký Hệ Thống & Giám Sát Hoạt Động
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Theo dõi toàn bộ audit trail, thay đổi trạng thái dàn tài khoản, lịch sử đồng bộ GPM và quản lý báo cáo sự cố kỹ thuật.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất CSV</span>
          </button>

          <button
            type="button"
            onClick={() => setIsBugModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-md shadow-pink-600/20 active:scale-95 transition-all cursor-pointer"
          >
            <Bug className="w-4 h-4" />
            <span>Báo Cáo Sự Cố</span>
          </button>
        </div>
      </div>

      {/* 4 Premium Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Logs */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-xs relative overflow-hidden group hover:border-indigo-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Tổng Bản Ghi Audit
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          {logsLoading ? (
            <div className="h-8 w-20 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse mt-3" />
          ) : (
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-3 tracking-tight">
              {stats.total.toLocaleString()}
            </div>
          )}
          <div className="text-xs text-slate-400 mt-1 flex items-center gap-1 font-medium">
            <span>Sự kiện ghi nhận trên hệ thống</span>
          </div>
        </div>

        {/* Status Changes */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-xs relative overflow-hidden group hover:border-blue-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Thay Đổi Trạng Thái
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
          </div>
          {logsLoading ? (
            <div className="h-8 w-16 bg-blue-100 dark:bg-blue-950/60 rounded-lg animate-pulse mt-3" />
          ) : (
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-3 tracking-tight">
              {stats.statusChanges.toLocaleString()}
            </div>
          )}
          <div className="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1 font-medium">
            <span>Warming, Active, Banned, v.v.</span>
          </div>
        </div>

        {/* Sync & Revenue Events */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-xs relative overflow-hidden group hover:border-emerald-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Đồng Bộ & Quét Số Liệu
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <RefreshCw className="w-5 h-5" />
            </div>
          </div>
          {logsLoading ? (
            <div className="h-8 w-16 bg-emerald-100 dark:bg-emerald-950/60 rounded-lg animate-pulse mt-3" />
          ) : (
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-3 tracking-tight">
              {stats.syncEvents.toLocaleString()}
            </div>
          )}
          <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1 font-medium">
            <span>GPM Fleet & Extension Reports</span>
          </div>
        </div>

        {/* Bug Reports / Alerts */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-xs relative overflow-hidden group hover:border-rose-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Báo Cáo Sự Cố & Cảnh Báo
            </span>
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <Bug className="w-5 h-5" />
            </div>
          </div>
          {bugsLoading ? (
            <div className="h-8 w-14 bg-rose-100 dark:bg-rose-950/60 rounded-lg animate-pulse mt-3" />
          ) : (
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-3 tracking-tight">
              {bugReports.length}
            </div>
          )}
          <div className="text-xs text-rose-600 dark:text-rose-400 mt-1 flex items-center gap-1 font-medium">
            {bugsLoading ? (
              <span className="inline-block w-28 h-3 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
            ) : (
              <span>{bugsData?.openCount || 0} sự cố đang chờ xử lý</span>
            )}
          </div>
        </div>
      </div>

      {/* Modern Navigation Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("logs")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "logs"
              ? "bg-white dark:bg-slate-800 text-pink-600 dark:text-pink-400 shadow-xs border border-slate-200/80 dark:border-slate-700/80"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Nhật Ký Vận Hành (Audit Trail)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("bugs")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "bugs"
              ? "bg-white dark:bg-slate-800 text-pink-600 dark:text-pink-400 shadow-xs border border-slate-200/80 dark:border-slate-700/80"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <Bug className="w-4 h-4" />
          <span>Báo Cáo Sự Cố Kỹ Thuật</span>
          {bugReports.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-xs font-bold bg-pink-500 text-white">
              {bugReports.length}
            </span>
          )}
        </button>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: AUDIT TRAIL LOGS                                    */}
      {/* ========================================================= */}
      {activeTab === "logs" && (
        <div className="space-y-4">
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
                placeholder="Tìm nội dung log, username, actor..."
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-pink-500"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto scrollbar-none">
              <button
                type="button"
                onClick={() => {
                  setLogTypeFilter("ALL");
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  logTypeFilter === "ALL"
                    ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Tất Cả
              </button>

              <button
                type="button"
                onClick={() => {
                  setLogTypeFilter("STATUS_CHANGE");
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  logTypeFilter === "STATUS_CHANGE"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Trạng Thái Tài Khoản
              </button>

              <button
                type="button"
                onClick={() => {
                  setLogTypeFilter("REVENUE_UPDATE");
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  logTypeFilter === "REVENUE_UPDATE"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Doanh Thu & Cào Dữ Liệu
              </button>

              <button
                type="button"
                onClick={() => {
                  setLogTypeFilter("ALERT");
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  logTypeFilter === "ALERT"
                    ? "bg-rose-600 text-white shadow-xs"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Cảnh Báo (Alerts)
              </button>
            </div>
          </div>

          {/* Audit Logs Table */}
          {logsLoading ? (
            <DataTableSkeleton columnCount={5} rowCount={pageSize} />
          ) : (
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                  <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-5 py-4">Thời Gian</th>
                      <th className="px-4 py-4">Tài Khoản TikTok</th>
                      <th className="px-4 py-4">Loại Sự Kiện</th>
                      <th className="px-4 py-4">Nội Dung Chi Tiết</th>
                      <th className="px-5 py-4 text-right">Tác Nhân (Actor)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                          Không có sự kiện audit nào phù hợp.
                        </td>
                      </tr>
                    ) : (
                      logs.map((log: any) => (
                        <tr
                          key={log.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          {/* Timestamp */}
                          <td className="px-5 py-4 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              <span>{new Date(log.createdAt).toLocaleString("vi-VN")}</span>
                            </div>
                          </td>

                          {/* Account */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            {log.account ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-900 dark:text-slate-100">
                                  @{log.account.username}
                                </span>
                                <span className="text-xs font-mono text-slate-400">
                                  ({log.account.country})
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 font-mono">System</span>
                            )}
                          </td>

                          {/* Log Type */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-md text-xs font-black uppercase ${
                                log.logType === "STATUS_CHANGE"
                                  ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                                  : log.logType === "ALERT"
                                  ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                  : log.logType === "REVENUE_UPDATE"
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                  : "bg-slate-500/15 text-slate-600 dark:text-slate-400"
                              }`}
                            >
                              {log.logType}
                            </span>
                          </td>

                          {/* Message */}
                          <td className="px-4 py-4">
                            <div className="text-xs text-slate-800 dark:text-slate-200 max-w-xl font-medium">
                              {log.message}
                            </div>
                            {log.oldStatus && log.newStatus && (
                              <div className="text-xs text-slate-400 mt-0.5 font-mono">
                                Trạng thái: {log.oldStatus} ➔ {log.newStatus}
                              </div>
                            )}
                          </td>

                          {/* Actor */}
                          <td className="px-5 py-4 text-right whitespace-nowrap font-mono text-xs text-slate-600 dark:text-slate-400">
                            {log.actorName || "System"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {auditData && auditData.totalPages > 1 && (
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
                  <span className="text-xs text-slate-500">
                    Trang {page} trên {auditData.totalPages} ({auditData.total} bản ghi)
                  </span>
                  <Pagination
                    currentPage={page}
                    totalPages={auditData.totalPages}
                    onPageChange={(p) => setPage(p)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: BUG REPORTS LIST                                    */}
      {/* ========================================================= */}
      {activeTab === "bugs" && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Bug className="w-4 h-4 text-pink-500" />
                Danh Sách Sự Cố & Phản Hồi Từ Đội Ngũ
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Các sự cố được theo dõi và gán trạng thái xử lý theo quy trình kỹ thuật.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsBugModalOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-xs cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
            >
              <Bug className="w-3.5 h-3.5" />
              <span>Gửi Báo Cáo Mới</span>
            </button>
          </div>

          {bugsLoading ? (
            <DataTableSkeleton columnCount={5} rowCount={5} />
          ) : bugReports.length === 0 ? (
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center text-slate-400">
              <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500/40 mb-3" />
              <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">
                Không có sự cố nào cần xử lý!
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Toàn bộ hệ sinh thái TikTokFlow đang vận hành ổn định.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {bugReports.map((report) => (
                <div
                  key={report.id}
                  className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-md text-xs font-black uppercase ${
                          report.severity === "CRITICAL"
                            ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                            : report.severity === "HIGH"
                            ? "bg-orange-500/15 text-orange-600 dark:text-orange-400"
                            : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {report.severity}
                      </span>

                      <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        {report.category}
                      </span>

                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {report.title}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          report.status === "RESOLVED"
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : report.status === "IN_PROGRESS"
                            ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                            : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {report.status === "RESOLVED"
                          ? "✓ Đã xử lý"
                          : report.status === "IN_PROGRESS"
                          ? "⏳ Đang xử lý"
                          : "• Đang mở"}
                      </span>

                      {/* Admin status update buttons */}
                      {isAdminOrLead && report.status !== "RESOLVED" && (
                        <button
                          type="button"
                          disabled={updateBugMutation.isPending}
                          onClick={() =>
                            updateBugMutation.mutate({
                              id: report.id,
                              status: "RESOLVED",
                              adminNotes: "Đã kiểm tra và khắc phục",
                            })
                          }
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all cursor-pointer"
                        >
                          Đánh dấu đã giải quyết
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {report.description}
                  </p>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                    <div className="flex items-center gap-3">
                      <span>Bởi: <strong>{report.reporterName || report.reporterEmail || "Thành viên"}</strong></span>
                      <span>•</span>
                      <span>{new Date(report.createdAt).toLocaleString("vi-VN")}</span>
                    </div>

                    {report.screenshotUrl && (
                      <a
                        href={report.screenshotUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-pink-600 dark:text-pink-400 font-semibold flex items-center gap-1 hover:underline"
                      >
                        <span>Xem ảnh đính kèm</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Shared Bug Report Modal */}
      <BugReportModal
        isOpen={isBugModalOpen}
        onClose={() => {
          setIsBugModalOpen(false);
          refetchBugs();
        }}
      />
    </div>
  );
}
