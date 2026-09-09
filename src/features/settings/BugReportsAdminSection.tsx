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
} from "lucide-react";
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

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "CRITICAL":
        return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30";
      case "HIGH":
        return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30";
      case "MEDIUM":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
      default:
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "OPEN":
        return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";
      case "IN_PROGRESS":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
      case "RESOLVED":
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
      case "CLOSED":
        return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
      default:
        return "bg-slate-500/10 text-slate-400 border-slate-500/20";
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
              Email Nhận Thông Báo Báo Cáo Sự Cố (Bug Alert Emails)
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
              Trung Tâm Quản Lý Báo Cáo Sự Cố & Lỗi (Bug Reports Hub)
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
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 overflow-x-auto">
            {(["ALL", "OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === st
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
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm theo tiêu đề, người gửi..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white w-48 sm:w-56 focus:outline-hidden"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 focus:outline-hidden"
            >
              <option value="ALL">Mọi danh mục</option>
              <option value="GPM_SYNC">GPM-Login Sync</option>
              <option value="EXTENSION">Extension</option>
              <option value="CLIENT_AGENT">Client Agent</option>
              <option value="REVENUE_DATA">Doanh Thu & RPM</option>
              <option value="UI_UX">Giao Diện UI/UX</option>
              <option value="SECURITY">Bảo Mật & Phân Quyền</option>
              <option value="OTHER">Vấn Đề Khác</option>
            </select>
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
            filteredReports.map((report) => {
              const currentNotesDraft =
                adminNotesDrafts[report.id] !== undefined
                  ? adminNotesDrafts[report.id]
                  : report.adminNotes || "";

              const screenshots =
                report.screenshotUrls && report.screenshotUrls.length > 0
                  ? report.screenshotUrls
                  : report.screenshotUrl
                  ? [report.screenshotUrl]
                  : [];

              return (
                <div
                  key={report.id}
                  className="p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/90 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 transition-all space-y-4"
                >
                  {/* Top Bar: Title & Tags */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase tracking-wider border ${getSeverityBadge(
                            report.severity
                          )}`}
                        >
                          {report.severity}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                          {report.category}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${getStatusBadge(
                            report.status
                          )}`}
                        >
                          {report.status}
                        </span>
                        <span className="text-xs font-mono text-slate-400">
                          #{report.id.slice(0, 14)}
                        </span>
                      </div>

                      <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                        {report.title}
                      </h4>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                          <User className="w-3.5 h-3.5 text-pink-500" />
                          {report.reporterName || "Thành viên"} ({report.reporterEmail || "Ẩn danh"})
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(report.createdAt).toLocaleString("vi-VN")}
                        </span>
                      </div>
                    </div>

                    {/* Quick Status Select */}
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={report.status}
                        disabled={updatingReportId === report.id}
                        onChange={(e) =>
                          handleUpdateStatus(report.id, e.target.value as any)
                        }
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 cursor-pointer shadow-xs focus:outline-hidden"
                      >
                        <option value="OPEN">Chờ Xử Lý (OPEN)</option>
                        <option value="IN_PROGRESS">Đang Xử Lý (IN_PROGRESS)</option>
                        <option value="RESOLVED">Đã Giải Quyết (RESOLVED)</option>
                        <option value="CLOSED">Đã Đóng (CLOSED)</option>
                      </select>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {report.description}
                  </div>

                  {/* Screenshots Gallery Preview */}
                  {screenshots.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5 text-pink-500" />
                        <span>Ảnh chụp màn hình ({screenshots.length} ảnh):</span>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {screenshots.map((url, imgIdx) => (
                          <div
                            key={imgIdx}
                            onClick={() => setLightboxImage(url)}
                            className="relative group cursor-pointer w-28 h-20 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900"
                          >
                            <img
                              src={url}
                              alt={`Bằng chứng ${imgIdx + 1}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                              <Maximize2 className="w-4 h-4" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* System diagnostics info */}
                  {report.systemInfo && (
                    <div className="text-xs text-slate-400 font-mono bg-slate-100/60 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800/60 flex flex-wrap gap-x-4 gap-y-1">
                      {report.systemInfo.url && <span>URL: {report.systemInfo.url}</span>}
                      {report.systemInfo.screen && <span>Màn hình: {report.systemInfo.screen}</span>}
                      {report.systemInfo.userAgent && (
                        <span className="truncate max-w-md">Trình duyệt: {report.systemInfo.userAgent}</span>
                      )}
                    </div>
                  )}

                  {/* Admin Notes Box */}
                  <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80 flex flex-col sm:flex-row items-end sm:items-center gap-2.5">
                    <div className="relative flex-1 w-full">
                      <MessageSquare className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={currentNotesDraft}
                        onChange={(e) =>
                          setAdminNotesDrafts({
                            ...adminNotesDrafts,
                            [report.id]: e.target.value,
                          })
                        }
                        placeholder="Ghi chú kỹ thuật của Admin (ví dụ: Đã fix trong bản cập nhật v1.2, đang kiểm tra profile GPM...)"
                        className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-hidden"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={updatingReportId === report.id}
                      onClick={() => handleSaveNotes(report.id, report.status)}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 text-white transition-all cursor-pointer whitespace-nowrap shadow-xs"
                    >
                      {updatingReportId === report.id ? "Đang lưu..." : "Lưu Ghi Chú"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

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
