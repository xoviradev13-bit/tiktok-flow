"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useUrlParams } from "@/hooks/useUrlState";
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
  Maximize2,
  X,
  ArrowRight,
  Copy,
  Pencil,
  Trash2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Pagination } from "@/components/ui/pagination";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import BugReportModal from "@/components/bug-report/BugReportModal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useConfirmDialog } from "@/components/ui/confirm-modal";
import { useDebounce } from "@/hooks/useDebounce";
import { smartSearchMatch } from "@/utils/search";

function LogsPageContent() {
  const { data: session } = useSession();
  const rawRole = (session?.user as any)?.role || (session?.user as any)?.userType || "STAFF";
  const userRole = String(rawRole).toUpperCase();
  const isAdminOrLead = userRole === "ADMIN" || userRole === "LEAD";
  const { confirm, confirmDialog } = useConfirmDialog();

  // SaaS URL Query State Synchronization
  const { searchParams, updateUrlParams } = useUrlParams();

  const paramTab = searchParams?.get("tab");
  const initialTab = paramTab === "bugs" ? "bugs" : "logs";
  const [activeTab, setActiveTab] = useState<"logs" | "bugs">(initialTab);

  const initialPage = Number(searchParams?.get("p") || searchParams?.get("page")) || 1;
  const initialPageSize = Number(searchParams?.get("ps") || searchParams?.get("pageSize")) || 20;
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const initialType = searchParams?.get("type") || "ALL";
  const [logTypeFilter, setLogTypeFilter] = useState(initialType);

  const initialSearch = searchParams?.get("q") || searchParams?.get("search") || "";
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const [isBugModalOpen, setIsBugModalOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<any | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const paramBugStatus = searchParams?.get("bStatus") as any;
  const initialBugStatus = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(paramBugStatus) ? paramBugStatus : "ALL";
  const [bugStatusFilter, setBugStatusFilter] = useState<"ALL" | "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED">(initialBugStatus);

  // Auto sync active state to URL
  useEffect(() => {
    updateUrlParams(
      {
        tab: activeTab,
        p: page,
        ps: pageSize,
        type: logTypeFilter,
        q: searchQuery,
        bStatus: bugStatusFilter,
      },
      {
        p: 1,
        ps: 20,
        type: "ALL",
        q: "",
        bStatus: "ALL",
      }
    );
  }, [
    activeTab,
    page,
    pageSize,
    logTypeFilter,
    searchQuery,
    bugStatusFilter,
    updateUrlParams,
  ]);

  const utils = trpc.useUtils();

  // Query Audit Logs
  const { data: auditData, isLoading: logsLoading, refetch: refetchLogs } =
    trpc.support.getAuditLogs.useQuery({
      page,
      pageSize,
      logType: logTypeFilter,
      search: debouncedSearchQuery || undefined,
    });

  // Query Bug Reports
  const { data: bugsData, isLoading: bugsLoading, refetch: refetchBugs } =
    trpc.support.listBugReports.useQuery({
      limit: 100,
      status: bugStatusFilter,
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

  // Mutation to delete bug report
  const deleteBugMutation = trpc.support.deleteBugReport.useMutation({
    onSuccess: () => {
      toast.success("Đã xóa báo cáo sự cố thành công!");
      utils.support.listBugReports.invalidate();
      setSelectedBugReport(null);
    },
    onError: (err) => {
      toast.error(err.message || "Không thể xóa báo cáo sự cố.");
    },
  });

  const [selectedBugReport, setSelectedBugReport] = useState<any | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const logs = auditData?.items || [];
  const stats = auditData?.stats || {
    total: 0,
    statusChanges: 0,
    syncEvents: 0,
    alerts: 0,
  };

  const bugReports = bugsData?.items || [];

  const filteredBugReports = useMemo(() => {
    if (!searchQuery.trim()) return bugReports;
    return bugReports.filter((report: any) =>
      smartSearchMatch(
        searchQuery,
        report.title,
        report.description,
        report.category,
        report.severity,
        report.status,
        report.reporterName,
        report.reporterEmail
      )
    );
  }, [bugReports, searchQuery]);

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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5 min-w-0">
            <Activity className="w-6 h-6 text-indigo-500 shrink-0" />
            <span className="truncate">Nhật Ký Hệ Thống & Giám Sát Hoạt Động</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
            Theo dõi toàn bộ audit trail, thay đổi trạng thái dàn tài khoản, lịch sử đồng bộ GPM và quản lý báo cáo sự cố kỹ thuật.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleExportCSV}
                className="h-10 flex items-center gap-2 px-3.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Xuất CSV</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs font-semibold">
              Tải xuống toàn bộ bản ghi audit log dạng CSV
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setIsBugModalOpen(true)}
                className="h-10 flex items-center gap-2 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-md shadow-pink-600/20 active:scale-95 transition-all cursor-pointer whitespace-nowrap shrink-0"
              >
                <Bug className="w-4 h-4 shrink-0" />
                <span className="truncate">Báo Cáo Sự Cố</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs font-semibold">
              Gửi phản hồi hoặc báo cáo lỗi kỹ thuật
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* 4 Premium Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Logs */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-xs relative overflow-hidden group hover:border-indigo-500/40 transition-all min-w-0">
          <div className="flex items-center justify-between min-w-0">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate whitespace-nowrap" title="Tổng Bản Ghi Audit">
              Tổng Bản Ghi Audit
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          {logsLoading ? (
            <div className="h-8 w-20 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse mt-3" />
          ) : (
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-3 tracking-tight truncate">
              {stats.total.toLocaleString()}
            </div>
          )}
          <div className="text-xs text-slate-400 mt-1 flex items-center gap-1 font-medium truncate">
            <span className="truncate">Sự kiện ghi nhận trên hệ thống</span>
          </div>
        </div>

        {/* Status Changes */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-xs relative overflow-hidden group hover:border-blue-500/40 transition-all min-w-0">
          <div className="flex items-center justify-between min-w-0">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate whitespace-nowrap" title="Thay Đổi Trạng Thái">
              Thay Đổi Trạng Thái
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
          </div>
          {logsLoading ? (
            <div className="h-8 w-16 bg-blue-100 dark:bg-blue-950/60 rounded-lg animate-pulse mt-3" />
          ) : (
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-3 tracking-tight truncate">
              {stats.statusChanges.toLocaleString()}
            </div>
          )}
          <div className="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1 font-medium truncate">
            <span className="truncate">Warming, Active, Banned, v.v.</span>
          </div>
        </div>

        {/* Sync & Revenue Events */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-xs relative overflow-hidden group hover:border-emerald-500/40 transition-all min-w-0">
          <div className="flex items-center justify-between min-w-0">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate whitespace-nowrap" title="Đồng Bộ & Quét Số Liệu">
              Đồng Bộ & Quét Số Liệu
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <RefreshCw className="w-5 h-5" />
            </div>
          </div>
          {logsLoading ? (
            <div className="h-8 w-16 bg-emerald-100 dark:bg-emerald-950/60 rounded-lg animate-pulse mt-3" />
          ) : (
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-3 tracking-tight truncate">
              {stats.syncEvents.toLocaleString()}
            </div>
          )}
          <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1 font-medium truncate">
            <span className="truncate">GPM Fleet & Extension Reports</span>
          </div>
        </div>

        {/* Bug Reports / Alerts */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-xs relative overflow-hidden group hover:border-rose-500/40 transition-all min-w-0">
          <div className="flex items-center justify-between min-w-0">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate whitespace-nowrap" title="Báo Cáo Sự Cố & Cảnh Báo">
              Báo Cáo Sự Cố & Cảnh Báo
            </span>
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <Bug className="w-5 h-5" />
            </div>
          </div>
          {bugsLoading ? (
            <div className="h-8 w-14 bg-rose-100 dark:bg-rose-950/60 rounded-lg animate-pulse mt-3" />
          ) : (
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-3 tracking-tight truncate">
              {bugReports.length}
            </div>
          )}
          <div className="text-xs text-rose-600 dark:text-rose-400 mt-1 flex items-center gap-1 font-medium truncate">
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
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === "logs"
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
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === "bugs"
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
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Tìm nội dung log, username, actor..."
                className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-pink-500"
              />
              {searchQuery && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        setPage(1);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200/90 hover:bg-rose-500 hover:text-white dark:bg-slate-800 dark:hover:bg-rose-500 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all cursor-pointer shadow-2xs hover:scale-110"
                      aria-label="Xóa tìm kiếm"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Xóa tìm kiếm</TooltipContent>
                </Tooltip>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto scrollbar-none">
              <button
                type="button"
                onClick={() => {
                  setLogTypeFilter("ALL");
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${logTypeFilter === "ALL"
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
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${logTypeFilter === "STATUS_CHANGE"
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
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${logTypeFilter === "REVENUE_UPDATE"
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
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${logTypeFilter === "ALERT"
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
                <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300 table-fixed min-w-[900px]">
                  <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-5 py-4 w-[160px]">Thời Gian</th>
                      <th className="px-4 py-4 w-[180px]">Tài Khoản TikTok</th>
                      <th className="px-4 py-4 w-[140px]">Loại Sự Kiện</th>
                      <th className="px-4 py-4">Nội Dung Chi Tiết</th>
                      <th className="px-5 py-4 text-right w-[160px]">Người Thực Hiện</th>
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
                          <td className="px-5 py-4 font-mono text-xs text-slate-500 dark:text-slate-400 overflow-hidden">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">{new Date(log.createdAt).toLocaleString("vi-VN")}</span>
                            </div>
                          </td>

                          {/* Account */}
                          <td className="px-4 py-4 overflow-hidden">
                            {log.account ? (
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-bold text-slate-900 dark:text-slate-100 truncate" title={`@${log.account.username}`}>
                                  @{log.account.username}
                                </span>
                                <span className="text-xs font-mono text-slate-400 shrink-0">
                                  ({log.account.country})
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 font-mono">System</span>
                            )}
                          </td>

                          {/* Log Type */}
                          <td className="px-4 py-4 overflow-hidden">
                            <span
                              className={`inline-block max-w-full truncate px-2 py-0.5 rounded-md text-xs font-black uppercase ${log.logType === "STATUS_CHANGE"
                                ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                                : log.logType === "ALERT"
                                  ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                  : log.logType === "REVENUE_UPDATE"
                                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                    : "bg-slate-500/15 text-slate-600 dark:text-slate-400"
                                }`}
                              title={log.logType}
                            >
                              {log.logType}
                            </span>
                          </td>

                          {/* Message */}
                          <td className="px-4 py-4 overflow-hidden">
                            <div className="text-xs text-slate-800 dark:text-slate-200 font-medium truncate" title={log.message}>
                              {log.message}
                            </div>
                            {log.oldStatus && log.newStatus && (
                              <div className="text-xs text-slate-400 mt-0.5 font-mono truncate">
                                Trạng thái: {log.oldStatus} ➔ {log.newStatus}
                              </div>
                            )}
                          </td>

                          {/* Actor */}
                          <td className="px-5 py-4 text-right font-mono text-xs text-slate-600 dark:text-slate-400 overflow-hidden">
                            <span className="truncate block" title={log.actorName || "System"}>{log.actorName || "System"}</span>
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
                Danh Sách Sự Cố
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Các sự cố sẽ được theo dõi và cập nhật trạng thái xử lý trong quá trình hỗ trợ.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto w-full sm:w-auto">
              <div className="relative w-full sm:w-60">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm sự cố, mô tả, người gửi..."
                  className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-pink-500"
                />
                {searchQuery && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200/90 hover:bg-rose-500 hover:text-white dark:bg-slate-800 dark:hover:bg-rose-500 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all cursor-pointer shadow-2xs hover:scale-110"
                        aria-label="Xóa tìm kiếm"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Xóa tìm kiếm</TooltipContent>
                  </Tooltip>
                )}
              </div>

              <div className="relative shrink-0">
                <Select
                  value={bugStatusFilter}
                  onValueChange={(val: any) => setBugStatusFilter(val)}
                >
                  <SelectTrigger
                    className={`w-38 sm:w-40 h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 cursor-pointer shadow-none transition-colors ${
                      bugStatusFilter !== "ALL"
                        ? "pr-8 border-pink-200 dark:border-pink-900/60 bg-pink-50/40 dark:bg-pink-950/25 text-pink-700 dark:text-pink-300 [&_svg]:hidden"
                        : ""
                    }`}
                  >
                    <SelectValue placeholder="Mọi trạng thái" />
                  </SelectTrigger>
                  <SelectContent align="end" className="rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl">
                    <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">Mọi trạng thái</SelectItem>
                    <SelectItem value="OPEN" className="text-xs font-normal cursor-pointer">Đang mở</SelectItem>
                    <SelectItem value="IN_PROGRESS" className="text-xs font-normal cursor-pointer">Đang xử lý</SelectItem>
                    <SelectItem value="RESOLVED" className="text-xs font-normal cursor-pointer">Đã xử lý</SelectItem>
                    <SelectItem value="CLOSED" className="text-xs font-normal cursor-pointer">Đã đóng</SelectItem>
                  </SelectContent>
                </Select>
                {bugStatusFilter !== "ALL" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setBugStatusFilter("ALL");
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200/90 hover:bg-rose-500 hover:text-white dark:bg-slate-800 dark:hover:bg-rose-500 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all z-10 cursor-pointer shadow-2xs hover:scale-110"
                        aria-label="Xóa chọn trạng thái"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Xóa chọn trạng thái</TooltipContent>
                  </Tooltip>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsBugModalOpen(true)}
                className="h-9 px-3.5 rounded-xl text-xs font-bold bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-xs cursor-pointer flex items-center gap-1.5 whitespace-nowrap hover:opacity-95 transition-opacity"
              >
                <Bug className="w-3.5 h-3.5" />
                <span>Gửi Báo Cáo Mới</span>
              </button>
            </div>
          </div>

          {bugsLoading ? (
            <DataTableSkeleton columnCount={5} rowCount={5} />
          ) : filteredBugReports.length === 0 ? (
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
              {filteredBugReports.map((report) => {
                const isOwner =
                  (session?.user?.id && report.reporterId === session.user.id) ||
                  (session?.user?.email && report.reporterEmail === session.user.email);
                const canModify = isOwner || isAdminOrLead;

                return (
                  <div
                    key={report.id}
                    onClick={() => setSelectedBugReport(report)}
                    className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs hover:border-pink-400 dark:hover:border-pink-800 transition-all space-y-3 cursor-pointer group"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-2 flex-1">
                        {/* Row 1: Title first */}
                        <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-snug">
                          {report.title}
                        </h3>

                        {/* Row 2: Badges below title with hover tooltips */}
                        <div className="flex flex-wrap items-center gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-black uppercase cursor-help ${report.severity === "CRITICAL"
                                  ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                  : report.severity === "HIGH"
                                    ? "bg-orange-500/15 text-orange-600 dark:text-orange-400"
                                    : report.severity === "MEDIUM"
                                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                      : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                                  }`}
                              >
                                {report.severity}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              Mức độ: {report.severity === "CRITICAL" ? "Khẩn cấp" : report.severity === "HIGH" ? "Cao" : report.severity === "MEDIUM" ? "Trung bình" : "Thấp"} ({report.severity})
                            </TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 cursor-help">
                                {report.category}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              Danh mục: {report.category}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-center" onClick={(e) => e.stopPropagation()}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold cursor-help ${report.status === "RESOLVED"
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
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            Trạng thái: {report.status === "RESOLVED" ? "Đã giải quyết" : report.status === "IN_PROGRESS" ? "Đang xử lý" : "Đang mở"}
                          </TooltipContent>
                        </Tooltip>

                        {/* Admin status update buttons */}
                        {isAdminOrLead && report.status !== "RESOLVED" && (
                          <button
                            type="button"
                            disabled={updateBugMutation.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateBugMutation.mutate({
                                id: report.id,
                                status: "RESOLVED",
                                adminNotes: "Đã kiểm tra và khắc phục",
                              });
                            }}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all cursor-pointer shadow-xs"
                          >
                            Đánh dấu đã giải quyết
                          </button>
                        )}

                        {/* Edit Button for Owner or Admin */}
                        {canModify && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingReport(report);
                                  setIsEditModalOpen(true);
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-all cursor-pointer"
                                aria-label="Chỉnh sửa sự cố"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              Chỉnh sửa sự cố
                            </TooltipContent>
                          </Tooltip>
                        )}

                        {/* Delete Button for Owner or Admin */}
                        {canModify && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                disabled={deleteBugMutation.isPending}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const ok = await confirm({
                                    title: "Xóa báo cáo sự cố",
                                    description: "Bạn có chắc chắn muốn xóa báo cáo sự cố này?",
                                    confirmLabel: "Xác nhận xóa",
                                    variant: "danger",
                                  });
                                  if (ok) {
                                    deleteBugMutation.mutate({ id: report.id });
                                  }
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer disabled:opacity-50"
                                aria-label="Xóa báo cáo"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              Xóa báo cáo
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {report.description}
                    </p>

                    {/* Admin Notes / Ghi chú phản hồi từ Admin */}
                    {report.adminNotes && (
                      <div className="p-3 rounded-2xl bg-pink-50/70 dark:bg-pink-950/25 border border-pink-100 dark:border-pink-900/40 flex items-start gap-2.5 text-xs">
                        <MessageSquare className="w-4 h-4 text-pink-500 shrink-0 mt-0.5" />
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <div className="font-bold text-pink-700 dark:text-pink-300 text-[11px] uppercase tracking-wider">
                            Phản Hồi Từ Đội Ngũ Kỹ Thuật:
                          </div>
                          <p className="text-slate-700 dark:text-slate-200 leading-relaxed break-words whitespace-pre-wrap">
                            {report.adminNotes}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                      <div className="flex items-center gap-3">
                        <span>Bởi: <strong>{report.reporterName || report.reporterEmail || "Thành viên"}</strong></span>
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{new Date(report.createdAt).toLocaleString("vi-VN")}</span>
                        </span>
                      </div>

                      <div className="opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center gap-1 font-bold text-pink-600 dark:text-pink-400 shrink-0">
                        <span>Hiển thị chi tiết</span>
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Bug Report Detail Modal */}
      {selectedBugReport && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setSelectedBugReport(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="space-y-1.5 flex-1">
                {/* Prefix ID on top with quick copy */}
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 font-medium">
                  <span>#{selectedBugReport.id}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedBugReport.id);
                          toast.success("Đã sao chép mã sự cố!");
                        }}
                        className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs font-medium">
                      Sao chép mã sự cố
                    </TooltipContent>
                  </Tooltip>
                </div>

                {/* Title */}
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug">
                  {selectedBugReport.title}
                </h3>

                {/* Row 2: Badges below title with hover tooltips */}
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-black uppercase cursor-help ${selectedBugReport.severity === "CRITICAL"
                          ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                          : selectedBugReport.severity === "HIGH"
                            ? "bg-orange-500/15 text-orange-600 dark:text-orange-400"
                            : selectedBugReport.severity === "MEDIUM"
                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                              : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                          }`}
                      >
                        {selectedBugReport.severity}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Mức độ: {selectedBugReport.severity === "CRITICAL" ? "Khẩn cấp" : selectedBugReport.severity === "HIGH" ? "Cao" : selectedBugReport.severity === "MEDIUM" ? "Trung bình" : "Thấp"} ({selectedBugReport.severity})
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 cursor-help">
                        {selectedBugReport.category}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Danh mục: {selectedBugReport.category}
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold cursor-help ${selectedBugReport.status === "RESOLVED"
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : selectedBugReport.status === "IN_PROGRESS"
                            ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                            : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          }`}
                      >
                        {selectedBugReport.status === "RESOLVED"
                          ? "✓ Đã xử lý"
                          : selectedBugReport.status === "IN_PROGRESS"
                            ? "⏳ Đang xử lý"
                            : "• Đang mở"}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Trạng thái: {selectedBugReport.status === "RESOLVED" ? "Đã giải quyết" : selectedBugReport.status === "IN_PROGRESS" ? "Đang xử lý" : "Đang mở"}
                    </TooltipContent>
                  </Tooltip>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 pt-0.5">
                  <span>
                    Bởi: <strong className="font-medium text-slate-700 dark:text-slate-200">{selectedBugReport.reporterName || "Thành viên"} ({selectedBugReport.reporterEmail || "Ẩn danh"})</strong>
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{new Date(selectedBugReport.createdAt).toLocaleString("vi-VN")}</span>
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedBugReport(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <div className="text-xs font-bold tracking-wider text-slate-400">
                Nội dung chi tiết sự cố
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                {selectedBugReport.description}
              </div>
            </div>

            {/* Screenshots Gallery with Zoom */}
            {((selectedBugReport.screenshotUrls && selectedBugReport.screenshotUrls.length > 0)
              ? selectedBugReport.screenshotUrls
              : selectedBugReport.screenshotUrl ? [selectedBugReport.screenshotUrl] : []).length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold tracking-wider text-slate-400">
                    Hình ảnh bằng chứng (Bấm vào ảnh để phóng to)
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {((selectedBugReport.screenshotUrls && selectedBugReport.screenshotUrls.length > 0)
                      ? selectedBugReport.screenshotUrls
                      : selectedBugReport.screenshotUrl ? [selectedBugReport.screenshotUrl] : []).map((url: string, i: number) => (
                        <div
                          key={i}
                          onClick={() => setLightboxImage(url)}
                          className="relative group cursor-zoom-in rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 aspect-video shadow-xs"
                        >
                          <img src={url} alt={`Ảnh ${i + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                            <Maximize2 className="w-5 h-5" />
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

            {/* Admin Notes Section inside Modal */}
            {selectedBugReport.adminNotes && (
              <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="text-xs font-bold tracking-wider text-pink-600 dark:text-pink-400 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Phản Hồi Từ Đội Ngũ Kỹ Thuật</span>
                </div>
                <div className="p-4 rounded-2xl bg-pink-50/60 dark:bg-pink-950/25 border border-pink-100 dark:border-pink-900/40 text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {selectedBugReport.adminNotes}
                </div>
              </div>
            )}

            {/* Actions inside modal */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {isAdminOrLead && selectedBugReport.status !== "RESOLVED" && (
                  <button
                    type="button"
                    disabled={updateBugMutation.isPending}
                    onClick={() => {
                      updateBugMutation.mutate(
                        {
                          id: selectedBugReport.id,
                          status: "RESOLVED",
                          adminNotes: "Đã kiểm tra và khắc phục",
                        },
                        {
                          onSuccess: () => {
                            setSelectedBugReport({ ...selectedBugReport, status: "RESOLVED" });
                          },
                        }
                      );
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer shadow-xs"
                  >
                    Đánh dấu đã giải quyết
                  </button>
                )}

                {/* Edit & Delete in modal for owner or admin */}
                {((session?.user?.id && selectedBugReport.reporterId === session.user.id) ||
                  (session?.user?.email && selectedBugReport.reporterEmail === session.user.email) ||
                  isAdminOrLead) && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingReport(selectedBugReport);
                          setSelectedBugReport(null);
                          setIsEditModalOpen(true);
                        }}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Chỉnh sửa sự cố</span>
                      </button>

                      <button
                        type="button"
                        disabled={deleteBugMutation.isPending}
                        onClick={async () => {
                          const ok = await confirm({
                            title: "Xóa báo cáo sự cố",
                            description: "Bạn có chắc chắn muốn xóa báo cáo sự cố này?",
                            confirmLabel: "Xác nhận xóa",
                            variant: "danger",
                          });
                          if (ok) {
                            deleteBugMutation.mutate({ id: selectedBugReport.id });
                          }
                        }}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa báo cáo</span>
                      </button>
                    </>
                  )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedBugReport(null)}
                className="ml-auto px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal for Full-Resolution Image Viewing */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-w-5xl max-h-[90vh] bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden p-2 shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 text-white">
              <span className="text-xs font-mono text-slate-400">Xem ảnh bằng chứng lỗi</span>
              <div className="flex items-center gap-2">
                <a
                  href={lightboxImage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                  title="Mở trong tab mới"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setLightboxImage(null)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto flex items-center justify-center p-2">
              <img
                src={lightboxImage}
                alt="Screenshot Full"
                className="max-w-full max-h-[80vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* Shared Bug Report Modal (Create or Edit) */}
      <BugReportModal
        isOpen={isBugModalOpen || isEditModalOpen}
        editingReport={editingReport}
        onClose={() => {
          setIsBugModalOpen(false);
          setIsEditModalOpen(false);
          setEditingReport(null);
          refetchBugs();
        }}
      />
      {confirmDialog}
    </div>
  );
}

export default function LogsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400 text-xs">Đang tải nhật ký hệ thống...</div>}>
      <LogsPageContent />
    </Suspense>
  );
}
