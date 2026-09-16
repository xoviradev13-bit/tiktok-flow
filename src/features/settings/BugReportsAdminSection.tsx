"use client";

import React, { useState, useMemo } from "react";
import {
  Bug,
  Mail,
  RefreshCw,
  Check,
  AlertTriangle,
  Clock,
  User,
  ExternalLink,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Eye,
  X,
  MessageSquare,
  ShieldAlert,
  Laptop,
  Maximize2,
  Download,
  Calendar,
  ArrowRight,
  Save,
  Copy,
  Trash2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { BugReportItem } from "@/trpc/routers/support";

export default function BugReportsAdminSection() {
  const utils = trpc.useUtils();

  // 1. Email Alert Configuration States
  const { data: alertEmailsData, isLoading: loadingEmails } =
    trpc.support.getAlertEmails.useQuery();
  const setAlertEmailsMutation = trpc.support.setAlertEmails.useMutation();

  const [emailInput, setEmailInput] = useState("");
  const [emailsList, setEmailsList] = useState<string[]>([]);
  const [emailsInitialized, setEmailsInitialized] = useState(false);
  const [savingEmails, setSavingEmails] = useState(false);

  // Sync loaded emails into local state
  React.useEffect(() => {
    if (alertEmailsData && !emailsInitialized) {
      setEmailsList(alertEmailsData);
      setEmailInput(alertEmailsData.join(", "));
      setEmailsInitialized(true);
    }
  }, [alertEmailsData, emailsInitialized]);

  const handleSaveEmails = async () => {
    setSavingEmails(true);
    try {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const parsedEmails = emailInput
        .split(/[,;\s]+/)
        .map((e) => e.trim())
        .filter((e) => e.length > 0);

      const invalidEmails = parsedEmails.filter((e) => !emailRegex.test(e));
      if (invalidEmails.length > 0) {
        toast.error(`Email không hợp lệ: ${invalidEmails.join(", ")}`);
        setSavingEmails(false);
        return;
      }

      await setAlertEmailsMutation.mutateAsync({ emails: parsedEmails });
      setEmailsList(parsedEmails);
      utils.support.getAlertEmails.invalidate();
      toast.success("Đã lưu danh sách email nhận cảnh báo sự cố!");
    } catch (err: any) {
      toast.error(err.message || "Lỗi lưu cấu hình email.");
    } finally {
      setSavingEmails(false);
    }
  };

  // 2. Bug Reports List States & Filters
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED"
  >("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const {
    data: reportsData,
    isLoading: loadingReports,
    refetch: refetchReports,
    isFetching: fetchingReports,
  } = trpc.support.listBugReports.useQuery({
    status: statusFilter,
    category: categoryFilter !== "ALL" ? categoryFilter : undefined,
    severity: severityFilter !== "ALL" ? severityFilter : undefined,
    limit: 100,
  });

  const updateStatusMutation = trpc.support.updateBugReportStatus.useMutation();

  // Admin notes draft state mapped by report ID
  const [adminNotesDrafts, setAdminNotesDrafts] = useState<Record<string, string>>({});
  const [updatingReportId, setUpdatingReportId] = useState<string | null>(null);

  // Lightbox Image Viewer State
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [selectedDetailReport, setSelectedDetailReport] = useState<BugReportItem | null>(null);

  // Filtered reports
  const filteredReports = useMemo(() => {
    if (!reportsData?.items) return [];
    if (!searchQuery.trim()) return reportsData.items;

    const query = searchQuery.toLowerCase();
    return reportsData.items.filter((item) => {
      const matchTitle = item.title.toLowerCase().includes(query);
      const matchDesc = item.description.toLowerCase().includes(query);
      const matchReporter = item.reporterEmail?.toLowerCase().includes(query) ||
        item.reporterName?.toLowerCase().includes(query);
      return matchTitle || matchDesc || matchReporter;
    });
  }, [reportsData?.items, searchQuery]);

  // Handle status update
  const handleUpdateStatus = async (
    reportId: string,
    newStatus: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED"
  ) => {
    setUpdatingReportId(reportId);
    try {
      const notes = adminNotesDrafts[reportId];
      await updateStatusMutation.mutateAsync({
        id: reportId,
        status: newStatus,
        adminNotes: notes,
      });
      utils.support.listBugReports.invalidate();
      toast.success(`Đã chuyển trạng thái sang ${newStatus}`);
    } catch (err: any) {
      toast.error(err.message || "Lỗi cập nhật trạng thái");
    } finally {
      setUpdatingReportId(null);
    }
  };

  // Handle saving notes
  const handleSaveNotes = async (reportId: string, currentStatus: any) => {
    setUpdatingReportId(reportId);
    try {
      const notes = adminNotesDrafts[reportId];
      await updateStatusMutation.mutateAsync({
        id: reportId,
        status: currentStatus,
        adminNotes: notes,
      });
      utils.support.listBugReports.invalidate();
      toast.success("Đã cập nhật ghi chú kỹ thuật");
    } catch (err: any) {
      toast.error(err.message || "Lỗi lưu ghi chú");
    } finally {
      setUpdatingReportId(null);
    }
  };

  // Delete Bug Report (Admin)
  const deleteMutation = trpc.support.deleteBugReport.useMutation({
    onSuccess: () => {
      toast.success("Đã xóa báo cáo sự cố thành công!");
      utils.support.listBugReports.invalidate();
      if (selectedDetailReport) {
        setSelectedDetailReport(null);
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "Không thể xóa báo cáo sự cố.");
    },
  });

  const handleDeleteReport = (reportId: string) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa báo cáo sự cố này không? Thao tác này không thể hoàn tác.")) {
      deleteMutation.mutate({ id: reportId });
    }
  };



  return (
    <div className="space-y-6">
      {/* SECTION 1: EMAIL ALERT CONFIGURATION */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Mail className="w-5 h-5 text-pink-500" />
              Email Nhận Thông Báo Báo Cáo Sự Cố
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Khi người dùng gửi báo cáo sự cố, hệ thống sẽ tự động gửi email chi tiết kèm ảnh chụp màn hình và thông tin kỹ thuật tới danh sách email quản trị viên bên dưới.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="admin@company.com, techlead@studio.com (phân cách bằng dấu phẩy)"
              className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-hidden focus:ring-2 focus:ring-pink-500"
            />
          </div>

          <button
            type="button"
            onClick={handleSaveEmails}
            disabled={savingEmails}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-md shadow-pink-600/20 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
          >
            {savingEmails ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Đang lưu...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Lưu Cấu Hình Email</span>
              </>
            )}
          </button>
        </div>

        {/* Active email pills */}
        {emailsList.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Email đang kích hoạt:</span>
            {emailsList.map((email, i) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded-lg text-xs font-mono bg-pink-50 dark:bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-200 dark:border-pink-500/20"
              >
                {email}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 2: BUG REPORTS HUB & LIST */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-6">
        {/* Header with Stats */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Bug className="w-5 h-5 text-rose-500" />
              Trung Tâm Quản Lý Báo Cáo Sự Cố & Lỗi
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Dữ liệu được lưu trữ trên Database. Quản trị viên có thể theo dõi tiến độ, xem ảnh lỗi đính kèm và cập nhật trạng thái xử lý.
            </p>
          </div>

          <button
            type="button"
            onClick={() => refetchReports()}
            disabled={fetchingReports}
            className="self-start lg:self-auto px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-2 cursor-pointer shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${fetchingReports ? "animate-spin" : ""}`} />
            <span>Làm Mới</span>
          </button>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Tổng Báo Cáo</div>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {reportsData?.total || 0}
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40">
            <div className="text-xs text-rose-600 dark:text-rose-400 font-medium">Chờ Xử Lý (Open)</div>
            <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
              {reportsData?.openCount || 0}
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40">
            <div className="text-xs text-amber-600 dark:text-amber-400 font-medium">Đang Xử Lý</div>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
              {reportsData?.inProgressCount || 0}
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40">
            <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Đã Giải Quyết</div>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {reportsData?.resolvedCount || 0}
            </div>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-2">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 p-1 h-9 rounded-xl bg-slate-100 dark:bg-slate-800/80 overflow-x-auto shrink-0">
            {(["ALL", "OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`h-7 px-3 flex items-center justify-center rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${statusFilter === st
                  ? "bg-white dark:bg-slate-900 text-pink-600 dark:text-pink-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
              >
                {st === "ALL"
                  ? "Tất Cả"
                  : st === "OPEN"
                    ? "Mới Mở"
                    : st === "IN_PROGRESS"
                      ? "Đang Sửa"
                      : st === "RESOLVED"
                        ? "Đã Xong"
                        : "Đã Đóng"}
              </button>
            ))}
          </div>

          {/* Search and Category Filter */}
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm theo tiêu đề, người gửi..."
                className="w-48 sm:w-56 h-9 pl-8 pr-8 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden transition-colors"
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
                value={categoryFilter}
                onValueChange={(val) => setCategoryFilter(val)}
              >
                <SelectTrigger
                  className={`w-40 h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 cursor-pointer shadow-none transition-colors ${
                    categoryFilter !== "ALL"
                      ? "pr-8 border-pink-200 dark:border-pink-900/60 bg-pink-50/40 dark:bg-pink-950/25 text-pink-700 dark:text-pink-300 [&_svg]:hidden"
                      : ""
                  }`}
                >
                  <SelectValue placeholder="Mọi danh mục" />
                </SelectTrigger>
                <SelectContent align="end" className="rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl">
                  <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">Mọi danh mục</SelectItem>
                  <SelectItem value="EXTENSION" className="text-xs font-normal cursor-pointer">Extension</SelectItem>
                  <SelectItem value="CLIENT_AGENT" className="text-xs font-normal cursor-pointer">Client Agent</SelectItem>
                  <SelectItem value="REVENUE_DATA" className="text-xs font-normal cursor-pointer">Doanh Thu & RPM</SelectItem>
                  <SelectItem value="UI_UX" className="text-xs font-normal cursor-pointer">Giao Diện UI/UX</SelectItem>
                  <SelectItem value="SECURITY" className="text-xs font-normal cursor-pointer">Bảo Mật & Phân Quyền</SelectItem>
                  <SelectItem value="OTHER" className="text-xs font-normal cursor-pointer">Vấn Đề Khác</SelectItem>
                </SelectContent>
              </Select>
              {categoryFilter !== "ALL" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setCategoryFilter("ALL");
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200/90 hover:bg-rose-500 hover:text-white dark:bg-slate-800 dark:hover:bg-rose-500 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all z-10 cursor-pointer shadow-2xs hover:scale-110"
                      aria-label="Xóa chọn danh mục"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Xóa chọn danh mục</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>

        {/* Reports List */}
        <div className="space-y-4">
          {loadingReports ? (
            <div className="p-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-pink-500" />
              <span>Đang tải danh sách báo cáo sự cố...</span>
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="p-12 rounded-3xl bg-slate-50 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-800 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
              <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Không có báo cáo sự cố nào
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Tất cả các sự cố đã được xử lý hoặc không có phản hồi nào khớp với bộ lọc hiện tại.
              </p>
            </div>
          ) : (
            filteredReports.map((report) => (
              <div
                key={report.id}
                onClick={() => setSelectedDetailReport(report)}
                className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs hover:border-pink-400 dark:hover:border-pink-800 transition-all space-y-3 cursor-pointer group"
              >
                {/* Top Bar: Title, Badges & Action Dropdown */}
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

                  {/* Quick Status Select & Delete Button - aligned with title */}
                  <div className="flex items-center gap-1.5 shrink-0 self-start" onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={report.status}
                      disabled={updatingReportId === report.id}
                      onValueChange={(val: any) => handleUpdateStatus(report.id, val)}
                    >
                      <SelectTrigger className="h-8.5 px-3 rounded-xl text-xs font-normal bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 shadow-xs cursor-pointer min-w-[155px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="end" className="rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl z-50">
                        <SelectItem value="OPEN" className="text-xs font-normal cursor-pointer">
                          <span className="flex items-center gap-2 font-normal">
                            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                            <span>Chờ Xử Lý (OPEN)</span>
                          </span>
                        </SelectItem>
                        <SelectItem value="IN_PROGRESS" className="text-xs font-normal cursor-pointer">
                          <span className="flex items-center gap-2 font-normal">
                            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                            <span>Đang Xử Lý (IN_PROGRESS)</span>
                          </span>
                        </SelectItem>
                        <SelectItem value="RESOLVED" className="text-xs font-normal cursor-pointer">
                          <span className="flex items-center gap-2 font-normal">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                            <span>Đã Giải Quyết (RESOLVED)</span>
                          </span>
                        </SelectItem>
                        <SelectItem value="CLOSED" className="text-xs font-normal cursor-pointer">
                          <span className="flex items-center gap-2 font-normal">
                            <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                            <span>Đã Đóng (CLOSED)</span>
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Delete button with Tooltip for Admin */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          disabled={deleteMutation.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteReport(report.id);
                          }}
                          className="p-2 rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer disabled:opacity-50"
                          aria-label="Xóa báo cáo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        Xóa báo cáo sự cố
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {report.description}
                </p>

                {/* Bottom info bar */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                  <div className="flex items-center gap-3">
                    <span>
                      Bởi: <strong className="text-slate-700 dark:text-slate-200">{report.reporterName || report.reporterEmail || "Thành viên"}</strong>
                    </span>
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
            ))
          )}
        </div>
      </div>

      {/* Bug Report Detail Modal */}
      {selectedDetailReport && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setSelectedDetailReport(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="space-y-1.5 flex-1">
                {/* Prefix ID on top with quick copy */}
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 font-medium">
                  <span>#{selectedDetailReport.id}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedDetailReport.id);
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
                  {selectedDetailReport.title}
                </h3>

                {/* Row 2: Badges below title with hover tooltips */}
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-black uppercase cursor-help ${selectedDetailReport.severity === "CRITICAL"
                          ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                          : selectedDetailReport.severity === "HIGH"
                            ? "bg-orange-500/15 text-orange-600 dark:text-orange-400"
                            : selectedDetailReport.severity === "MEDIUM"
                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                              : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                          }`}
                      >
                        {selectedDetailReport.severity}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Mức độ: {selectedDetailReport.severity === "CRITICAL" ? "Khẩn cấp" : selectedDetailReport.severity === "HIGH" ? "Cao" : selectedDetailReport.severity === "MEDIUM" ? "Trung bình" : "Thấp"} ({selectedDetailReport.severity})
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 cursor-help">
                        {selectedDetailReport.category}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Danh mục: {selectedDetailReport.category}
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold cursor-help ${selectedDetailReport.status === "RESOLVED"
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : selectedDetailReport.status === "IN_PROGRESS"
                            ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                            : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          }`}
                      >
                        {selectedDetailReport.status === "RESOLVED"
                          ? "✓ Đã xử lý"
                          : selectedDetailReport.status === "IN_PROGRESS"
                            ? "⏳ Đang xử lý"
                            : "• Đang mở"}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Trạng thái: {selectedDetailReport.status === "RESOLVED" ? "Đã giải quyết" : selectedDetailReport.status === "IN_PROGRESS" ? "Đang xử lý" : selectedDetailReport.status === "CLOSED" ? "Đã đóng" : "Đang mở"}
                    </TooltipContent>
                  </Tooltip>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 pt-0.5">
                  <span>
                    Bởi: <strong className="font-medium text-slate-700 dark:text-slate-200">{selectedDetailReport.reporterName || "Thành viên"} ({selectedDetailReport.reporterEmail || "Ẩn danh"})</strong>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{new Date(selectedDetailReport.createdAt).toLocaleString("vi-VN")}</span>
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDetailReport(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <div className="text-xs font-bold tracking-wider text-slate-400">
                Nội dung chi tiết
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                {selectedDetailReport.description}
              </div>
            </div>

            {/* Screenshots Gallery with Zoom */}
            {((selectedDetailReport.screenshotUrls && selectedDetailReport.screenshotUrls.length > 0)
              ? selectedDetailReport.screenshotUrls
              : selectedDetailReport.screenshotUrl ? [selectedDetailReport.screenshotUrl] : []).length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold tracking-wider text-slate-400">
                    Hình ảnh bằng chứng (Bấm vào ảnh để phóng to)
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {((selectedDetailReport.screenshotUrls && selectedDetailReport.screenshotUrls.length > 0)
                      ? selectedDetailReport.screenshotUrls
                      : selectedDetailReport.screenshotUrl ? [selectedDetailReport.screenshotUrl] : []).map((url, i) => (
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
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-pink-500" />
                  <span>Ghi chú kỹ thuật</span>
                </div>

                <button
                  type="button"
                  disabled={updatingReportId === selectedDetailReport.id}
                  onClick={async () => {
                    await handleSaveNotes(selectedDetailReport.id, selectedDetailReport.status);
                    setSelectedDetailReport({
                      ...selectedDetailReport,
                      adminNotes:
                        adminNotesDrafts[selectedDetailReport.id] !== undefined
                          ? adminNotesDrafts[selectedDetailReport.id]
                          : selectedDetailReport.adminNotes,
                    });
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-pink-600 dark:hover:bg-pink-500 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  {updatingReportId === selectedDetailReport.id ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Lưu ghi chú</span>
                </button>
              </div>

              <textarea
                rows={3}
                value={
                  adminNotesDrafts[selectedDetailReport.id] !== undefined
                    ? adminNotesDrafts[selectedDetailReport.id]
                    : selectedDetailReport.adminNotes || ""
                }
                onChange={(e) =>
                  setAdminNotesDrafts({
                    ...adminNotesDrafts,
                    [selectedDetailReport.id]: e.target.value,
                  })
                }
                placeholder="Ghi chú kỹ thuật của Admin (ví dụ: Đã fix trong bản cập nhật v1.2, đang kiểm tra profile GPM...)"
                className="w-full p-3 text-xs rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-pink-500/30 leading-relaxed resize-y min-h-[75px]"
              />
            </div>

            {/* Admin actions inside modal */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">
                  Trạng thái:
                </span>
                <Select
                  value={selectedDetailReport.status}
                  disabled={updatingReportId === selectedDetailReport.id}
                  onValueChange={async (val: any) => {
                    await handleUpdateStatus(selectedDetailReport.id, val);
                    setSelectedDetailReport({ ...selectedDetailReport, status: val });
                  }}
                >
                  <SelectTrigger className="h-8.5 px-3 rounded-xl text-xs font-normal bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 shadow-xs cursor-pointer min-w-[165px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start" className="rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl z-50">
                    <SelectItem value="OPEN" className="text-xs font-normal cursor-pointer">
                      <span className="flex items-center gap-2 font-normal">
                        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                        <span>Chờ Xử Lý (OPEN)</span>
                      </span>
                    </SelectItem>
                    <SelectItem value="IN_PROGRESS" className="text-xs font-normal cursor-pointer">
                      <span className="flex items-center gap-2 font-normal">
                        <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                        <span>Đang Xử Lý (IN_PROGRESS)</span>
                      </span>
                    </SelectItem>
                    <SelectItem value="RESOLVED" className="text-xs font-normal cursor-pointer">
                      <span className="flex items-center gap-2 font-normal">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <span>Đã Giải Quyết (RESOLVED)</span>
                      </span>
                    </SelectItem>
                    <SelectItem value="CLOSED" className="text-xs font-normal cursor-pointer">
                      <span className="flex items-center gap-2 font-normal">
                        <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                        <span>Đã Đóng (CLOSED)</span>
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={deleteMutation.isPending}
                  onClick={() => handleDeleteReport(selectedDetailReport.id)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa báo cáo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedDetailReport(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  Đóng
                </button>
              </div>
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
            {/* Lightbox Bar */}
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

            {/* Lightbox Image */}
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
    </div>
  );
}
