"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  DollarSign,
  Eye,
  Users,
  Video,
  Flame,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Play,
  Square,
  ExternalLink,
  Shield,
  Calendar,
  Sparkles,
  TrendingUp,
  MessageSquare,
  FileText,
  Activity,
  Award,
  Layers,
  Globe,
  UserCheck,
  Send,
  Plus,
  Trash2,
  Check,
  ChevronRight,
  BarChart3,
  Sliders,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
} from "recharts";
import { trpc } from "@/lib/trpc";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export default function AccountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const accountId = (params?.id as string) || "";

  const [activeTab, setActiveTab] = useState<"overview" | "history" | "logs" | "alerts">("overview");
  const [selectedTimeRange, setSelectedTimeRange] = useState<"7d" | "28d" | "60d" | "365d" | "all">("28d");
  
  // Modals & Action States
  const [isAddRevenueOpen, setIsAddRevenueOpen] = useState(false);
  const [newRevDate, setNewRevDate] = useState(new Date().toISOString().split("T")[0]);
  const [newRevViews, setNewRevViews] = useState("");
  const [newRevRpm, setNewRevRpm] = useState("");
  const [newRevAmount, setNewRevAmount] = useState("");
  const [newRevSource, setNewRevSource] = useState("CREATOR_REWARDS");

  const [newLogMessage, setNewLogMessage] = useState("");
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  const utils = trpc.useUtils();

  const showToast = (text: string, type: "success" | "error" | "info" = "success") => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  // 1. Fetch Account Details
  const {
    data: account,
    isLoading,
    isError,
    error,
    refetch,
  } = trpc.accounts.getById.useQuery(
    { id: accountId },
    { enabled: !!accountId }
  );

  // 2. Fetch staff list for reassignment
  const { data: staffList = [] } = trpc.user.listStaff.useQuery();

  // Mutations
  const updateMutation = trpc.accounts.update.useMutation({
    onSuccess: () => {
      showToast("Đã cập nhật thông tin tài khoản thành công!", "success");
      utils.accounts.getById.invalidate({ id: accountId });
      utils.accounts.list.invalidate();
    },
    onError: (err) => showToast(err.message || "Lỗi khi cập nhật", "error"),
  });

  const syncMutation = trpc.accounts.syncAccount.useMutation({
    onSuccess: (data) => {
      if (data?.liveData) {
        showToast(
          `Đã đồng bộ Live từ TikTok Studio: ${Number(data.liveData.totalViews || 0).toLocaleString()} views, ${data.liveData.followersCount?.toLocaleString() || 0} followers!`,
          "success"
        );
      } else {
        showToast("Đã làm mới thông tin tài khoản!", "success");
      }
      utils.accounts.getById.invalidate({ id: accountId });
      utils.accounts.list.invalidate();
    },
    onError: (err) => showToast(err.message || "Lỗi khi đồng bộ", "error"),
  });

  const startGpmMutation = trpc.gpm.startProfile.useMutation({
    onSuccess: (res: any) => {
      if (res?.success === false) {
        showToast(res?.message || "Không thể khởi động profile GPM", "error");
      } else {
        showToast("🚀 Đã mở trình duyệt profile GPM thành công!", "success");
      }
    },
    onError: (err) => showToast(err.message || "Không thể kết nối GPMLogin API", "error"),
  });

  const stopGpmMutation = trpc.gpm.stopProfile.useMutation({
    onSuccess: () => showToast("Đã đóng profile GPM!", "info"),
    onError: (err) => showToast(err.message || "Lỗi khi đóng profile GPM", "error"),
  });

  const resolveAlertMutation = trpc.accounts.resolveAlert.useMutation({
    onSuccess: () => {
      showToast("Đã giải quyết cảnh báo rủi ro!", "success");
      utils.accounts.getById.invalidate({ id: accountId });
    },
    onError: (err) => showToast(err.message || "Lỗi giải quyết cảnh báo", "error"),
  });

  const addLogMutation = trpc.accounts.addLog.useMutation({
    onSuccess: () => {
      setNewLogMessage("");
      showToast("Đã ghi nhật ký / ghi chú mới!", "success");
      utils.accounts.getById.invalidate({ id: accountId });
    },
    onError: (err) => showToast(err.message || "Lỗi ghi nhật ký", "error"),
  });

  const upsertRevenueMutation = trpc.revenue.upsert.useMutation({
    onSuccess: () => {
      setIsAddRevenueOpen(false);
      setNewRevViews("");
      setNewRevRpm("");
      setNewRevAmount("");
      showToast("Đã lưu bản ghi doanh thu!", "success");
      utils.accounts.getById.invalidate({ id: accountId });
      utils.revenue.getOverview.invalidate();
    },
    onError: (err) => showToast(err.message || "Lỗi lưu doanh thu", "error"),
  });

  // Country Flag helper
  const getCountryBadge = (country?: string) => {
    switch (country?.toUpperCase()) {
      case "US":
        return <span className="inline-flex items-center gap-1 text-slate-900 dark:text-slate-100 font-semibold"><span className="text-base">🇺🇸</span> United States (US)</span>;
      case "UK":
        return <span className="inline-flex items-center gap-1 text-slate-900 dark:text-slate-100 font-semibold"><span className="text-base">🇬🇧</span> United Kingdom (UK)</span>;
      case "VN":
        return <span className="inline-flex items-center gap-1 text-slate-900 dark:text-slate-100 font-semibold"><span className="text-base">🇻🇳</span> Việt Nam (VN)</span>;
      case "DE":
        return <span className="inline-flex items-center gap-1 text-slate-900 dark:text-slate-100 font-semibold"><span className="text-base">🇩🇪</span> Germany (DE)</span>;
      case "FR":
        return <span className="inline-flex items-center gap-1 text-slate-900 dark:text-slate-100 font-semibold"><span className="text-base">🇫🇷</span> France (FR)</span>;
      default:
        return <span className="inline-flex items-center gap-1 text-slate-900 dark:text-slate-100 font-semibold"><span className="text-base">🌐</span> {country || "Global"}</span>;
    }
  };

  // Currency symbol helper
  const getCurrencySymbol = (country?: string) => {
    switch (country?.toUpperCase()) {
      case "UK":
        return "£";
      case "DE":
      case "FR":
        return "€";
      case "VN":
        return "₫";
      default:
        return "$";
    }
  };

  const currencySymbol = getCurrencySymbol(account?.country);

  // Status configuration helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle className="w-3.5 h-3.5" /> Hoạt Động (Active)
          </span>
        );
      case "WARMING":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Flame className="w-3.5 h-3.5" /> Đang Nuôi (Warming)
          </span>
        );
      case "RESTRICTED":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
            <AlertTriangle className="w-3.5 h-3.5" /> Hạn Chế (Restricted)
          </span>
        );
      case "BANNED":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5" /> Bị Khóa (Banned)
          </span>
        );
      case "STOPPED":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
            <Clock className="w-3.5 h-3.5" /> Tạm Dừng (Stopped)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20">
            {status}
          </span>
        );
    }
  };

  // Format Daily Revenue Chart Data
  const chartData = useMemo(() => {
    if (!account?.dailyRevenues || account.dailyRevenues.length === 0) {
      return [];
    }
    let revs = [...account.dailyRevenues];
    if (selectedTimeRange === "7d") revs = revs.slice(0, 7);
    else if (selectedTimeRange === "28d") revs = revs.slice(0, 28);
    else if (selectedTimeRange === "60d") revs = revs.slice(0, 60);
    else if (selectedTimeRange === "365d") revs = revs.slice(0, 365);

    return revs
      .reverse()
      .map((r: any) => {
        const dateStr = new Date(r.date).toLocaleDateString("vi-VN", {
          month: "2-digit",
          day: "2-digit",
        });
        return {
          date: dateStr,
          views: Number(r.views || 0),
          revenue: Number(r.revenue || 0),
          rpm: Number(r.rpm || 0),
        };
      });
  }, [account, selectedTimeRange]);

  // Derived Calculations
  const totalViewsNum = Number(account?.totalViews || 0);
  const totalRevNum = Number(account?.totalRevenue || 0);
  const calculatedRpm =
    totalViewsNum > 0
      ? Math.round(((totalRevNum * 1000) / totalViewsNum) * 100) / 100
      : 0;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <RefreshCw className="w-8 h-8 text-pink-500 animate-spin" />
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          Đang tải chi tiết tài khoản TikTok...
        </p>
      </div>
    );
  }

  if (isError || !account) {
    return (
      <div className="p-8 max-w-2xl mx-auto bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/50 rounded-2xl text-center space-y-4 shadow-sm mt-12">
        <div className="w-14 h-14 mx-auto rounded-full bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center text-rose-500">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-black text-slate-900 dark:text-white">
          Không tìm thấy tài khoản
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {error?.message || "Tài khoản không tồn tại hoặc bạn không có quyền truy cập."}
        </p>
        <Link
          href="/accounts"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Quay lại danh sách
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn pb-16">
      {/* Toast Notification */}
      {toastMsg && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-xl border text-xs font-semibold backdrop-blur-md animate-slideUp ${
            toastMsg.type === "success"
              ? "bg-emerald-500/90 text-white border-emerald-400"
              : toastMsg.type === "error"
              ? "bg-rose-500/90 text-white border-rose-400"
              : "bg-slate-900/90 text-white border-slate-700"
          }`}
        >
          {toastMsg.type === "success" && <CheckCircle className="w-4 h-4 shrink-0" />}
          {toastMsg.type === "error" && <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Account Details Header Section (Static / Non-sticky) */}
      <div className="bg-transparent pb-4 border-b border-slate-200/80 dark:border-slate-800/80 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Back Button & Account Title */}
          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/accounts"
                  className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shadow-sm"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Quay lại Quản lý tài khoản
              </TooltipContent>
            </Tooltip>

            {/* Avatar & Title */}
            <div className="flex items-center gap-3.5">
              <div className="relative">
                <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-pink-500 to-rose-400 p-0.5 shadow-md">
                  <div className="w-full h-full rounded-[14px] bg-white dark:bg-slate-900 flex items-center justify-center font-black text-pink-600 dark:text-pink-400 text-lg uppercase">
                    {account.username.slice(0, 2)}
                  </div>
                </div>
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white dark:bg-slate-900 flex items-center justify-center shadow">
                  <span className="text-xs">{account.country === "UK" ? "🇬🇧" : account.country === "VN" ? "🇻🇳" : account.country === "DE" ? "🇩🇪" : "🇺🇸"}</span>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                    @{account.username}
                  </h1>
                  {getStatusBadge(account.status)}
                  {account.groupName && (
                    <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {account.groupName}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1 flex-wrap">
                  <span>ID: <code className="text-[11px] font-mono text-slate-700 dark:text-slate-300">{account.id}</code></span>
                  <span>•</span>
                  <span>Phụ trách: <strong className="text-slate-800 dark:text-slate-200">{account.assignedUser?.fullName || account.assignedUser?.username || "Chưa gán"}</strong></span>
                  <span>•</span>
                  <span>Cập nhật: {account.lastSyncedAt ? new Date(account.lastSyncedAt).toLocaleString("vi-VN") : "Chưa đồng bộ"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Sync Live Button */}
            <button
              onClick={() => syncMutation.mutate({ accountId: account.id })}
              disabled={syncMutation.isPending}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white shadow-sm hover:shadow active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              <span>{syncMutation.isPending ? "Đang đồng bộ..." : "Đồng Bộ TikTok Studio"}</span>
            </button>

            {/* Launch / Stop GPM Profile */}
            {account.gpmProfileId && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => startGpmMutation.mutate({ gpmProfileId: account.gpmProfileId! })}
                  disabled={startGpmMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm hover:shadow active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Mở Profile GPM</span>
                </button>
                <button
                  onClick={() => stopGpmMutation.mutate({ gpmProfileId: account.gpmProfileId! })}
                  disabled={stopGpmMutation.isPending}
                  className="p-2 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all cursor-pointer"
                  title="Đóng trình duyệt GPM"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* External Links */}
            <a
              href={`https://www.tiktok.com/@${account.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all shadow-sm"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>TikTok Web</span>
            </a>

            <a
              href="https://www.tiktok.com/tiktokstudio"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5 text-pink-500" />
              <span>Studio</span>
            </a>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 border-t border-slate-200/60 dark:border-slate-800/60 pt-2.5 overflow-x-auto">
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "overview"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Tổng Quan & Chỉ Số</span>
          </button>

          <button
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "history"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Biểu Đồ & Lịch Sử Doanh Thu</span>
            {account.dailyRevenues?.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-pink-500/20 text-pink-500">
                {account.dailyRevenues.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("alerts")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "alerts"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span>Cảnh Báo & Rủi Ro</span>
            {account.alerts?.filter((a: any) => a.status === "OPEN").length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500 text-white font-bold">
                {account.alerts.filter((a: any) => a.status === "OPEN").length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("logs")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "logs"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Nhật Ký & Audit Trail</span>
            {account.logs?.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                {account.logs.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Top 6 KPI Cards Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Total Views */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Tổng Lượt Xem</span>
            <Eye className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-cyan-600 dark:text-cyan-400 mt-2">
            {totalViewsNum.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-cyan-500" />
            <span>Toàn thời gian (Studio)</span>
          </div>
        </div>

        {/* Total Followers */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Followers</span>
            <Users className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-purple-600 dark:text-purple-400 mt-2">
            {Number(account.totalFollowers || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
            <span>Kênh đạt chuẩn quỹ</span>
          </div>
        </div>

        {/* Total Videos */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Số Video</span>
            <Video className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-2">
            {Number(account.totalVideos || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
            <span>Đã đăng trên kênh</span>
          </div>
        </div>

        {/* Total Revenue */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Tổng Doanh Thu</span>
            <DollarSign className="w-4 h-4 text-pink-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-pink-600 dark:text-pink-400 mt-2">
            {currencySymbol}{totalRevNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
            <span>Creator Rewards</span>
          </div>
        </div>

        {/* Average RPM */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">RPM Trung Bình</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">
            {currencySymbol}{calculatedRpm.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
            <span>/ 1,000 views</span>
          </div>
        </div>

        {/* Fleet / Country Status */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Khu Vực & Tiền Tệ</span>
            <Globe className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-2 flex items-center gap-1.5">
            {getCountryBadge(account.country)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Đơn vị: <strong className="text-slate-700 dark:text-slate-300 font-mono">{currencySymbol} ({account.country})</strong>
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Columns: Views Breakdown & Performance Dashboard */}
          <div className="lg:col-span-2 space-y-6">
            {/* Time-Window Breakdown Box */}
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-pink-500" />
                    Phân Tích Chỉ Số Theo Khung Thời Gian (TikTok Studio)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Số liệu lượt xem và video trích xuất tự động qua API TikTok Studio
                  </p>
                </div>

                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl flex-wrap">
                  {[
                    { id: "7d", label: "7 ngày" },
                    { id: "28d", label: "28 ngày" },
                    { id: "60d", label: "60 ngày" },
                    { id: "365d", label: "365 ngày" },
                    { id: "all", label: "Toàn bộ" },
                  ].map((range) => (
                    <button
                      key={range.id}
                      onClick={() => setSelectedTimeRange(range.id as any)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        selectedTimeRange === range.id
                          ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Metric Comparison Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-3 text-center">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">7 Ngày Qua</div>
                  <div className="text-base sm:text-lg font-black text-cyan-600 dark:text-cyan-400 mt-1">
                    {account.dailyRevenues?.slice(0, 7).reduce((acc: number, r: any) => acc + Number(r.views || 0), 0)?.toLocaleString() || "—"}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Lượt xem (7d)</div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-3 text-center">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">28 Ngày Qua</div>
                  <div className="text-base sm:text-lg font-black text-purple-600 dark:text-purple-400 mt-1">
                    {account.dailyRevenues?.slice(0, 28).reduce((acc: number, r: any) => acc + Number(r.views || 0), 0)?.toLocaleString() || "—"}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Lượt xem (28d)</div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-3 text-center">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">60 Ngày Qua</div>
                  <div className="text-base sm:text-lg font-black text-indigo-600 dark:text-indigo-400 mt-1">
                    {account.dailyRevenues?.slice(0, 60).reduce((acc: number, r: any) => acc + Number(r.views || 0), 0)?.toLocaleString() || "—"}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Lượt xem (60d)</div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-3 text-center">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">365 Ngày (1 Năm)</div>
                  <div className="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400 mt-1">
                    {account.dailyRevenues?.slice(0, 365).reduce((acc: number, r: any) => acc + Number(r.views || 0), 0)?.toLocaleString() || "—"}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Lượt xem (365d)</div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-3 text-center col-span-2 sm:col-span-1">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Toàn Thời Gian</div>
                  <div className="text-base sm:text-lg font-black text-pink-600 dark:text-pink-400 mt-1">
                    {totalViewsNum.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Lifetime Views</div>
                </div>
              </div>

              {/* Progress Summary */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-pink-500/5 via-purple-500/5 to-cyan-500/5 border border-pink-500/10 dark:border-pink-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-pink-500/10 text-pink-600 dark:text-pink-400 flex items-center justify-center font-bold">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      Trạng thái Quỹ Creator Rewards
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Tài khoản đã được liên kết và cập nhật đầy đủ dữ liệu thống kê từ TikTok Studio.
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setIsAddRevenueOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-pink-500 transition-all shadow-sm cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5 text-pink-500" />
                  <span>Nhập doanh thu ngày</span>
                </button>
              </div>
            </div>

            {/* Daily Revenue Chart Preview */}
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    Biểu Đồ Doanh Thu & Lượt Xem Gần Đây
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Theo dõi biến động doanh thu ({currencySymbol}) và lượt xem hàng ngày
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab("history")}
                  className="text-xs font-bold text-pink-600 hover:text-pink-500 dark:text-pink-400 flex items-center gap-1 cursor-pointer"
                >
                  <span>Xem đầy đủ bảng</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {chartData.length > 0 ? (
                <div className="h-64 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: "rgba(15, 23, 42, 0.95)",
                          borderRadius: "12px",
                          border: "1px solid rgba(255, 255, 255, 0.1)",
                          color: "#fff",
                          fontSize: "12px",
                        }}
                      />
                      <Bar dataKey="revenue" name={`Doanh thu (${currencySymbol})`} fill="#ec4899" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400 dark:text-slate-500 space-y-2">
                  <BarChart3 className="w-8 h-8 mx-auto opacity-40" />
                  <p className="text-xs">Chưa có bản ghi doanh thu nào theo ngày.</p>
                  <button
                    onClick={() => setIsAddRevenueOpen(true)}
                    className="text-xs text-pink-600 font-bold hover:underline cursor-pointer"
                  >
                    + Nhập bản ghi đầu tiên
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Operational Controls & GPM Integration */}
          <div className="space-y-6">
            {/* Account Settings & Quick Edit Card */}
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                <Sliders className="w-4 h-4 text-pink-500" />
                Thông Tin Vận Hành & Quản Lý
              </h3>

              {/* Status Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Trạng thái tài khoản
                </label>
                <Select
                  value={account.status}
                  onValueChange={(val: any) =>
                    updateMutation.mutate({ id: account.id, status: val })
                  }
                >
                  <SelectTrigger className="w-full h-9 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-xs font-medium cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
                    <SelectItem value="ACTIVE" className="text-xs cursor-pointer">Active (Hoạt động)</SelectItem>
                    <SelectItem value="WARMING" className="text-xs cursor-pointer">Warming (Nuôi acc)</SelectItem>
                    <SelectItem value="RESTRICTED" className="text-xs cursor-pointer">Restricted (Hạn chế)</SelectItem>
                    <SelectItem value="BANNED" className="text-xs cursor-pointer">Banned (Bị khóa)</SelectItem>
                    <SelectItem value="STOPPED" className="text-xs cursor-pointer">Stopped (Tạm dừng)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Assigned Staff Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Nhân sự phụ trách
                </label>
                <Select
                  value={account.assignedUserId || "UNASSIGNED"}
                  onValueChange={(val) =>
                    updateMutation.mutate({
                      id: account.id,
                      assignedUserId: val === "UNASSIGNED" ? null : val,
                    })
                  }
                >
                  <SelectTrigger className="w-full h-9 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-xs font-medium cursor-pointer">
                    <SelectValue placeholder="-- Chọn nhân sự --">
                      {account.assignedUser ? account.assignedUser.fullName || account.assignedUser.username : "-- Chưa gán --"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-56">
                    <SelectItem value="UNASSIGNED" className="text-xs cursor-pointer text-slate-400">
                      -- Chưa gán --
                    </SelectItem>
                    {staffList.map((s: any) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs cursor-pointer">
                        {s.fullName} ({s.username})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Country Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Quốc gia (Country)
                </label>
                <Select
                  value={account.country}
                  onValueChange={(val) =>
                    updateMutation.mutate({ id: account.id, country: val })
                  }
                >
                  <SelectTrigger className="w-full h-9 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-xs font-medium cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
                    <SelectItem value="US" className="text-xs cursor-pointer">🇺🇸 United States (US - $)</SelectItem>
                    <SelectItem value="UK" className="text-xs cursor-pointer">🇬🇧 United Kingdom (UK - £)</SelectItem>
                    <SelectItem value="VN" className="text-xs cursor-pointer">🇻🇳 Việt Nam (VN - ₫)</SelectItem>
                    <SelectItem value="DE" className="text-xs cursor-pointer">🇩🇪 Germany (DE - €)</SelectItem>
                    <SelectItem value="FR" className="text-xs cursor-pointer">🇫🇷 France (FR - €)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Group Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Tên nhóm / Phân loại
                </label>
                <div className="flex gap-2">
                  <Input
                    defaultValue={account.groupName || ""}
                    placeholder="VD: Team US 01, Niche Funny..."
                    onBlur={(e) => {
                      if (e.target.value !== account.groupName) {
                        updateMutation.mutate({ id: account.id, groupName: e.target.value });
                      }
                    }}
                    className="h-9 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* GPM-Login Integration Card */}
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-500" />
                  GPM-Login Integration
                </h3>
                {account.gpmProfileId ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800">
                    Đã Liên Kết
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">
                    Chưa gắn GPM
                  </span>
                )}
              </div>

              {account.gpmProfileId ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 space-y-1.5">
                    <div className="text-[11px] font-medium text-slate-500">GPM Profile ID</div>
                    <code className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400 break-all block font-bold">
                      {account.gpmProfileId}
                    </code>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => startGpmMutation.mutate({ gpmProfileId: account.gpmProfileId! })}
                      disabled={startGpmMutation.isPending}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Mở GPM</span>
                    </button>

                    <button
                      onClick={() => stopGpmMutation.mutate({ gpmProfileId: account.gpmProfileId! })}
                      disabled={stopGpmMutation.isPending}
                      className="py-2 px-3 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all cursor-pointer"
                    >
                      <Square className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Gắn GPM Profile ID để cho phép tự động mở trình duyệt và đồng bộ TikTok Studio.
                  </p>
                  <Input
                    placeholder="Nhập GPM Profile UUID..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val) updateMutation.mutate({ id: account.id, gpmProfileId: val });
                      }
                    }}
                    className="h-9 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* History & Daily Revenue Tab */}
      {activeTab === "history" && (
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-amber-500" />
                Lịch Sử Doanh Thu & Views Từng Ngày ({currencySymbol})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Bảng ghi chi tiết các ngày đã được ghi nhận hoặc đồng bộ từ TikTok Studio
              </p>
            </div>

            <button
              onClick={() => setIsAddRevenueOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white shadow-sm hover:shadow transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Bản Ghi Mới</span>
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-slate-600 dark:text-slate-300 font-semibold text-xs border-b border-slate-200 dark:border-slate-800 normal-case">
                <tr>
                  <th className="py-3 px-4">Ngày</th>
                  <th className="py-3 px-4">Nguồn thu</th>
                  <th className="py-3 px-4">Lượt xem</th>
                  <th className="py-3 px-4">RPM ({currencySymbol})</th>
                  <th className="py-3 px-4">Doanh thu ({currencySymbol})</th>
                  <th className="py-3 px-4">Thời gian tạo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {account.dailyRevenues && account.dailyRevenues.length > 0 ? (
                  account.dailyRevenues.map((rec: any) => (
                    <tr
                      key={rec.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-slate-100">
                        {new Date(rec.date).toLocaleDateString("vi-VN")}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400 border border-pink-200 dark:border-pink-800">
                          {rec.sourceType || "CREATOR_REWARDS"}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-cyan-600 dark:text-cyan-400">
                        {Number(rec.views || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-semibold text-emerald-600 dark:text-emerald-400">
                        {currencySymbol}{Number(rec.rpm || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 font-black text-pink-600 dark:text-pink-400 text-sm">
                        {currencySymbol}{Number(rec.revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-[11px]">
                        {new Date(rec.createdAt).toLocaleTimeString("vi-VN")}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      Chưa có bản ghi doanh thu nào. Bấm nút <strong>"Thêm Bản Ghi Mới"</strong> để ghi nhận.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Alerts & Warnings Tab */}
      {activeTab === "alerts" && (
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
          <div className="pb-4 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Cảnh Báo & Rủi Ro Tài Khoản
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Theo dõi các cảnh báo vi phạm, mất quỹ, checkpoint hoặc sự cố đăng nhập
            </p>
          </div>

          <div className="space-y-3">
            {account.alerts && account.alerts.length > 0 ? (
              account.alerts.map((alt: any) => (
                <div
                  key={alt.id}
                  className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                    alt.status === "OPEN"
                      ? "bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60"
                      : "bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 opacity-70"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        alt.status === "OPEN"
                          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                          : "bg-slate-200 dark:bg-slate-800 text-slate-500"
                      }`}
                    >
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {alt.alertType}
                        </span>
                        <span
                          className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                            alt.status === "OPEN"
                              ? "bg-rose-500 text-white"
                              : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          {alt.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                        {alt.description}
                      </p>
                      <div className="text-[10px] text-slate-400 mt-1">
                        Tạo lúc: {new Date(alt.createdAt).toLocaleString("vi-VN")}
                      </div>
                    </div>
                  </div>

                  {alt.status === "OPEN" && (
                    <button
                      onClick={() => resolveAlertMutation.mutate({ alertId: alt.id })}
                      disabled={resolveAlertMutation.isPending}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all cursor-pointer whitespace-nowrap self-end sm:self-auto"
                    >
                      <Check className="w-3.5 h-3.5 inline mr-1" />
                      Đánh dấu đã xử lý
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <CheckCircle className="w-8 h-8 mx-auto text-emerald-500 opacity-60" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Tuyệt vời! Không có cảnh báo rủi ro nào trên tài khoản này.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Audit Logs & Notes Tab */}
      {activeTab === "logs" && (
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
          <div className="pb-4 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-500" />
              Nhật Ký & Lịch Sử Hoạt Động (Audit Trail)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Ghi nhận toàn bộ thao tác thay đổi trạng thái, đồng bộ dữ liệu và ghi chú của nhân sự
            </p>
          </div>

          {/* Add Manual Note */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-pink-500" />
              Thêm ghi chú / nhật ký mới
            </label>
            <div className="flex gap-2">
              <Input
                value={newLogMessage}
                onChange={(e) => setNewLogMessage(e.target.value)}
                placeholder="Nhập ghi chú cho tài khoản này (ví dụ: Đã đổi IP proxy, vừa kháng gậy...)"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newLogMessage.trim()) {
                    addLogMutation.mutate({ accountId: account.id, message: newLogMessage.trim() });
                  }
                }}
                className="h-10 text-xs rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
              />
              <button
                onClick={() => {
                  if (newLogMessage.trim()) {
                    addLogMutation.mutate({ accountId: account.id, message: newLogMessage.trim() });
                  }
                }}
                disabled={!newLogMessage.trim() || addLogMutation.isPending}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 shadow-sm transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Gửi</span>
              </button>
            </div>
          </div>

          {/* Timeline */}
          <div className="space-y-4 pt-2">
            {account.logs && account.logs.length > 0 ? (
              account.logs.map((log: any) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3.5 p-3 rounded-2xl bg-slate-50/60 dark:bg-slate-950/30 border border-slate-100 dark:border-slate-800/60"
                >
                  <div className="w-8 h-8 rounded-xl bg-pink-500/10 text-pink-600 dark:text-pink-400 flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">
                    {log.logType === "SYNC" ? "🔄" : log.logType === "STATUS_CHANGE" ? "⚡" : "📝"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        {log.actorName || "System"}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {new Date(log.createdAt).toLocaleString("vi-VN")}
                      </div>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 break-words">
                      {log.message}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-slate-400">
                Chưa có nhật ký hoạt động nào.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Daily Revenue Modal */}
      <Dialog open={isAddRevenueOpen} onOpenChange={setIsAddRevenueOpen}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-pink-500" />
              Nhập Bản Ghi Doanh Thu Ngày
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Ngày ghi nhận
              </label>
              <Input
                type="date"
                value={newRevDate}
                onChange={(e) => setNewRevDate(e.target.value)}
                className="h-9 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Lượt xem (Views)
                </label>
                <Input
                  type="number"
                  placeholder="VD: 50000"
                  value={newRevViews}
                  onChange={(e) => setNewRevViews(e.target.value)}
                  className="h-9 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  RPM ({currencySymbol})
                </label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="VD: 0.85"
                  value={newRevRpm}
                  onChange={(e) => setNewRevRpm(e.target.value)}
                  className="h-9 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Tổng tiền ({currencySymbol})
              </label>
              <Input
                type="number"
                step="0.01"
                placeholder="VD: 42.50 (tự tính nếu bỏ trống)"
                value={newRevAmount}
                onChange={(e) => setNewRevAmount(e.target.value)}
                className="h-9 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Nguồn tiền
              </label>
              <Select value={newRevSource} onValueChange={setNewRevSource}>
                <SelectTrigger className="w-full h-9 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-xs font-medium cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
                  <SelectItem value="CREATOR_REWARDS" className="text-xs cursor-pointer">Creator Rewards Program</SelectItem>
                  <SelectItem value="AFFILIATE" className="text-xs cursor-pointer">TikTok Shop Affiliate</SelectItem>
                  <SelectItem value="SERIES" className="text-xs cursor-pointer">TikTok Series</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <button
              onClick={() => setIsAddRevenueOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              Hủy
            </button>
            <button
              onClick={() => {
                const viewsNum = Number(newRevViews) || 0;
                const rpmNum = Number(newRevRpm) || 0;
                let revNum = Number(newRevAmount) || 0;
                if (!revNum && viewsNum > 0 && rpmNum > 0) {
                  revNum = (viewsNum / 1000) * rpmNum;
                }
                upsertRevenueMutation.mutate({
                  accountId: account.id,
                  date: newRevDate,
                  views: viewsNum,
                  rpm: rpmNum,
                  revenue: revNum,
                  sourceType: newRevSource,
                });
              }}
              disabled={upsertRevenueMutation.isPending}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              {upsertRevenueMutation.isPending ? "Đang lưu..." : "Lưu Bản Ghi"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
