"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Users,
  ArrowLeft,
  Shield,
  ShieldCheck,
  UserCheck,
  Play,
  RefreshCw,
  ExternalLink,
  Eye,
  Search,
  Filter,
  Flame,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Calendar,
  DollarSign,
  TrendingUp,
  Video,
  Activity,
  FileText,
  UserCog,
  Check,
  X,
  SlidersHorizontal,
  ChevronRight,
  Globe,
  Ban,
  CheckCircle2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { UserDetailSkeleton } from "@/components/skeletons/PageSkeletons";
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
import { Input } from "@/components/ui/input";

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params?.id as string;
  const { data: session } = useSession();

  const [activeTab, setActiveTab] = useState<"accounts" | "checklists" | "profile">("accounts");
  const [days, setDays] = useState(28);
  const [accountSearch, setAccountSearch] = useState("");
  const [accountStatusFilter, setAccountStatusFilter] = useState("ALL");
  const [accountCountryFilter, setAccountCountryFilter] = useState("ALL");
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  const utils = trpc.useUtils();

  const showToast = (text: string, type: "success" | "error" | "info" = "success") => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const { data: userDetail, isLoading: loading, error } = trpc.user.getById.useQuery(
    { id: userId, days },
    { enabled: !!userId }
  );

  // GPM Launch mutation
  const startGpmMutation = trpc.gpm.startProfile.useMutation({
    onSuccess: () => showToast("Đã khởi chạy profile GPMLogin!", "success"),
    onError: (err) => showToast(err.message || "Lỗi khởi chạy GPM", "error"),
  });

  // Role update mutation (ADMIN)
  const updateRoleMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      showToast("Đã cập nhật vai trò nhân sự!", "success");
      utils.user.getById.invalidate({ id: userId });
      utils.admin.listUsers.invalidate();
    },
    onError: (err) => showToast(err.message || "Lỗi cập nhật vai trò", "error"),
  });

  // Status toggle mutation (ADMIN)
  const toggleStatusMutation = trpc.admin.toggleUserStatus.useMutation({
    onSuccess: () => {
      showToast("Đã thay đổi trạng thái hoạt động!", "success");
      utils.user.getById.invalidate({ id: userId });
      utils.admin.listUsers.invalidate();
    },
    onError: (err) => showToast(err.message || "Lỗi đổi trạng thái", "error"),
  });

  // Sync account mutation
  const syncMutation = trpc.accounts.syncAccount.useMutation({
    onSuccess: (data) => {
      showToast(`Đã đồng bộ tài khoản @${data.account.username}!`, "success");
      utils.user.getById.invalidate({ id: userId });
    },
    onError: (err) => showToast(err.message || "Lỗi đồng bộ tài khoản", "error"),
  });

  // Country badge helper
  const getCountryBadge = (country?: string) => {
    const code = (country || "US").toUpperCase();
    switch (code) {
      case "US":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
            <span className="text-xs">🇺🇸</span> US
          </span>
        );
      case "UK":
      case "GB":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50">
            <span className="text-xs">🇬🇧</span> UK
          </span>
        );
      case "VN":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300 border border-red-200 dark:border-red-800/50">
            <span className="text-xs">🇻🇳</span> VN
          </span>
        );
      case "DE":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
            <span className="text-xs">🇩🇪</span> DE
          </span>
        );
      case "FR":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 border border-sky-200 dark:border-sky-800/50">
            <span className="text-xs">🇫🇷</span> FR
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <Globe className="w-3 h-3 text-slate-500" /> {code}
          </span>
        );
    }
  };

  // Status badge helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle className="w-3 h-3" /> Hoạt Động
          </span>
        );
      case "WARMING":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Flame className="w-3 h-3" /> Đang Nuôi
          </span>
        );
      case "RESTRICTED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
            <AlertTriangle className="w-3 h-3" /> Hạn Chế
          </span>
        );
      case "BANNED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" /> Bị Khóa
          </span>
        );
      case "STOPPED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
            <Clock className="w-3 h-3" /> Tạm Dừng
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20">
            {status}
          </span>
        );
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "ADMIN":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60">
            <ShieldCheck className="w-3.5 h-3.5" /> Quản Trị Viên (Admin)
          </span>
        );
      case "LEAD":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-pink-50 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800/60">
            <Shield className="w-3.5 h-3.5" /> Trưởng Nhóm (Lead)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <UserCheck className="w-3.5 h-3.5 text-slate-500" /> Nhân Viên (Staff)
          </span>
        );
    }
  };

  // Filter accounts
  const filteredAccounts = useMemo(() => {
    if (!userDetail?.tiktokAccounts) return [];
    return userDetail.tiktokAccounts.filter((acc: any) => {
      const matchSearch =
        !accountSearch ||
        acc.username.toLowerCase().includes(accountSearch.toLowerCase()) ||
        (acc.gpmProfileId && acc.gpmProfileId.toLowerCase().includes(accountSearch.toLowerCase())) ||
        (acc.groupName && acc.groupName.toLowerCase().includes(accountSearch.toLowerCase()));

      const matchStatus = accountStatusFilter === "ALL" || acc.status === accountStatusFilter;
      const matchCountry = accountCountryFilter === "ALL" || (acc.country || "US").toUpperCase() === accountCountryFilter;

      return matchSearch && matchStatus && matchCountry;
    });
  }, [userDetail?.tiktokAccounts, accountSearch, accountStatusFilter, accountCountryFilter]);

  if (loading) {
    return <UserDetailSkeleton />;
  }

  if (error || !userDetail) {
    return (
      <div className="text-center py-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 space-y-4 max-w-lg mx-auto">
        <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <XCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Không tìm thấy nhân sự</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {error?.message || "Tài khoản nhân viên này không tồn tại hoặc bạn không có quyền truy cập."}
        </p>
        <Link
          href="/users"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Quay lại danh sách nhân sự
        </Link>
      </div>
    );
  }

  const { user, stats, dailyChecklists } = userDetail;
  const isAdmin = (session?.user as any)?.role === "ADMIN";

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

      {/* Header Section */}
      <div className="bg-transparent pb-4 border-b border-slate-200/80 dark:border-slate-800/80 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Back & Profile Info */}
          <div className="flex items-center gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/users"
                  className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shadow-sm shrink-0"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Quay lại Quản lý nhân sự
              </TooltipContent>
            </Tooltip>

            {/* Avatar & Names */}
            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 via-pink-500 to-rose-400 p-0.5 shadow-md shrink-0">
                <div className="w-full h-full rounded-[14px] bg-white dark:bg-slate-900 flex items-center justify-center font-black text-purple-600 dark:text-purple-400 text-xl uppercase">
                  {user.fullName.slice(0, 2)}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                    {user.fullName}
                  </h1>
                  {getRoleBadge(user.role)}
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold ${
                      user.isActive
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50"
                        : "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${user.isActive ? "bg-emerald-500" : "bg-rose-500"}`} />
                    {user.isActive ? "Đang Hoạt Động" : "Tạm Khóa"}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1 flex-wrap font-mono">
                  <span>@{user.username}</span>
                  <span>•</span>
                  <span>{user.email}</span>
                  {user.phone && (
                    <>
                      <span>•</span>
                      <span>SĐT: {user.phone}</span>
                    </>
                  )}
                  <span>•</span>
                  <span>Gia nhập: {new Date(user.createdAt).toLocaleDateString("vi-VN")}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Direct Checklist link */}
            <Link
              href={`/checklist?date=${new Date().toISOString().split("T")[0]}`}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm hover:shadow transition-all"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Xem Checklist Hôm Nay</span>
            </Link>

            {/* Admin Role Change / Toggle Status */}
            {isAdmin && session?.user?.id !== user.id && (
              <>
                <Select
                  value={user.role}
                  onValueChange={(val: any) => updateRoleMutation.mutate({ userId: user.id, role: val })}
                >
                  <SelectTrigger className="h-9 w-36 text-xs font-semibold rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 cursor-pointer">
                    <SelectValue placeholder="Đổi vai trò" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="STAFF">Nhân Viên (Staff)</SelectItem>
                    <SelectItem value="LEAD">Trưởng Nhóm (Lead)</SelectItem>
                    <SelectItem value="ADMIN">Quản Trị Viên (Admin)</SelectItem>
                  </SelectContent>
                </Select>

                <button
                  onClick={() => {
                    const confirmMsg = user.isActive
                      ? `Xác nhận CHẶN QUYỀN TRUY CẬP của nhân sự ${user.fullName || user.username}?\n\nNhân sự này sẽ bị ngắt phiên làm việc và không thể đăng nhập vào hệ thống!`
                      : `Xác nhận MỞ LẠI QUYỀN TRUY CẬP cho nhân sự ${user.fullName || user.username}?`;
                    if (confirm(confirmMsg)) {
                      toggleStatusMutation.mutate({ userId: user.id, isActive: !user.isActive });
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    user.isActive
                      ? "bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900"
                      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
                  }`}
                >
                  {user.isActive ? (
                    <>
                      <Ban className="w-3.5 h-3.5 text-rose-500" />
                      <span>Chặn quyền truy cập</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Mở chặn quyền truy cập</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Navigation Tabs & Time Range Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-200/60 dark:border-slate-800/60 pt-2.5">
          <div className="flex items-center gap-1 overflow-x-auto">
            <button
              onClick={() => setActiveTab("accounts")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "accounts"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"
              }`}
            >
              <Users className="w-3.5 h-3.5 text-pink-500" />
              <span>Tài Khoản Phụ Trách ({stats.totalAssigned})</span>
            </button>

            <button
              onClick={() => setActiveTab("checklists")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "checklists"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-emerald-500" />
              <span>Lịch Sử Chấm Công ({dailyChecklists.length})</span>
            </button>

            <button
              onClick={() => setActiveTab("profile")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "profile"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"
              }`}
            >
              <UserCog className="w-3.5 h-3.5 text-purple-500" />
              <span>Thông Tin Chi Tiết</span>
            </button>
          </div>

          {/* Time Range Filter Chips */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 self-start sm:self-auto overflow-x-auto">
            {[
              { value: 7, label: "7 Ngày" },
              { value: 28, label: "28 Ngày" },
              { value: 60, label: "60 Ngày" },
              { value: 365, label: "365 Ngày" },
              { value: 0, label: "Toàn Bộ" },
            ].map((p) => (
              <button
                key={p.value}
                onClick={() => setDays(p.value)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  days === p.value
                    ? "bg-amber-500 text-slate-950 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Top 6 KPI Cards Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Total Assigned Accounts */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Account Giao Việc</span>
            <Users className="w-4 h-4 text-pink-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-pink-600 dark:text-pink-400 mt-2">
            {stats.totalAssigned}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            <span>{stats.activeAccounts} hoạt động • {stats.warmingAccounts} nuôi</span>
          </div>
        </div>

        {/* Total Views across fleet */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">
              Views ({days === 0 ? "Toàn bộ" : `${days}d`})
            </span>
            <Eye className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-cyan-600 dark:text-cyan-400 mt-2">
            {Number(stats.totalViews).toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            <span>{days === 0 ? "Toàn thời gian (Studio)" : `Dàn kênh ${days} ngày qua`}</span>
          </div>
        </div>

        {/* Total Followers */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Tổng Followers</span>
            <UserCheck className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-purple-600 dark:text-purple-400 mt-2">
            {Number(stats.totalFollowers).toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            <span>Người theo dõi tích lũy</span>
          </div>
        </div>

        {/* Total Revenue */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">
              Doanh Thu ({days === 0 ? "Toàn bộ" : `${days}d`})
            </span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">
            ${Number(stats.totalRevenue).toFixed(2)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            <span>{days === 0 ? "Creator Rewards (Lũy kế)" : `Thu nhập ${days} ngày qua`}</span>
          </div>
        </div>

        {/* Workday Score */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">
              Ngày Công ({days === 0 ? "Toàn bộ" : `${days}d`})
            </span>
            <Calendar className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 mt-2">
            {Number(stats.monthlyWorkdays)} Công
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            <span>Chốt theo mốc 10:00 AM</span>
          </div>
        </div>

        {/* Average Completion Rate */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">
              KPI TB ({days === 0 ? "Toàn bộ" : `${days}d`})
            </span>
            <TrendingUp className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-2">
            {stats.avgCompletionRate}%
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            <span>Tỷ lệ hoàn thành nhiệm vụ</span>
          </div>
        </div>
      </div>

      {/* TAB 1: Assigned Accounts */}
      {activeTab === "accounts" && (
        <div className="space-y-4">
          {/* Filters & Search Toolbar */}
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Tìm username, profile ID, group..."
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                className="pl-9 h-9 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Select value={accountStatusFilter} onValueChange={setAccountStatusFilter}>
                <SelectTrigger className="h-9 w-36 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                  <SelectValue placeholder="Trạng thái" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
                  <SelectItem value="ACTIVE">Hoạt Động (Active)</SelectItem>
                  <SelectItem value="WARMING">Đang Nuôi (Warming)</SelectItem>
                  <SelectItem value="RESTRICTED">Hạn Chế</SelectItem>
                  <SelectItem value="BANNED">Bị Khóa (Banned)</SelectItem>
                  <SelectItem value="STOPPED">Tạm Dừng</SelectItem>
                </SelectContent>
              </Select>

              <Select value={accountCountryFilter} onValueChange={setAccountCountryFilter}>
                <SelectTrigger className="h-9 w-32 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                  <SelectValue placeholder="Quốc gia" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="ALL">Tất cả quốc gia</SelectItem>
                  <SelectItem value="US">🇺🇸 US</SelectItem>
                  <SelectItem value="UK">🇬🇧 UK</SelectItem>
                  <SelectItem value="VN">🇻🇳 VN</SelectItem>
                  <SelectItem value="DE">🇩🇪 DE</SelectItem>
                  <SelectItem value="FR">🇫🇷 FR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Accounts Table */}
          {filteredAccounts.length === 0 ? (
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center space-y-3">
              <Users className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Không có tài khoản TikTok nào phù hợp
              </h3>
              <p className="text-xs text-slate-400">
                Nhân viên này chưa được gán tài khoản hoặc các tài khoản không khớp bộ lọc tìm kiếm.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden relative z-0 isolate">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-slate-600 dark:text-slate-300 font-semibold text-xs border-b border-slate-200 dark:border-slate-800 normal-case">
                    <tr>
                      <th className="py-3.5 px-4">Tài khoản TikTok & GPM</th>
                      <th className="py-3.5 px-4">Quốc gia</th>
                      <th className="py-3.5 px-4">Trạng thái</th>
                      <th className="py-3.5 px-4">Lượt xem</th>
                      <th className="py-3.5 px-4">Followers</th>
                      <th className="py-3.5 px-4">Số video</th>
                      <th className="py-3.5 px-4">Doanh thu</th>
                      <th className="py-3.5 px-4">Đồng bộ lần cuối</th>
                      <th className="py-3.5 px-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {filteredAccounts.map((acc: any) => (
                      <tr
                        key={acc.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        {/* Username & GPM Profile */}
                        <td className="py-3.5 px-4">
                          <div>
                            <Link
                              href={`/accounts/${acc.id}`}
                              className="font-bold text-slate-900 dark:text-white hover:text-pink-600 dark:hover:text-pink-400 flex items-center gap-1.5 transition-colors"
                            >
                              <span>@{acc.username}</span>
                              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                            </Link>
                            <div className="text-xs text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                              {acc.gpmProfileId ? (
                                <span className="text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/60 px-1 py-0.2 rounded border border-cyan-200 dark:border-cyan-800/40">
                                  {acc.gpmProfileId.slice(0, 8)}...
                                </span>
                              ) : (
                                <span className="text-slate-400">Chưa gắn GPM</span>
                              )}
                              {acc.groupName && <span>• {acc.groupName}</span>}
                            </div>
                          </div>
                        </td>

                        {/* Country */}
                        <td className="py-3.5 px-4">
                          {getCountryBadge(acc.country)}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          {getStatusBadge(acc.status)}
                        </td>

                        {/* Views */}
                        <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                          {Number(acc.totalViews || 0).toLocaleString()}
                        </td>

                        {/* Followers */}
                        <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                          {Number(acc.totalFollowers || 0).toLocaleString()}
                        </td>

                        {/* Videos */}
                        <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                          {Number(acc.totalVideos || 0).toLocaleString()}
                        </td>

                        {/* Revenue */}
                        <td className="py-3.5 px-4 font-bold text-emerald-600 dark:text-emerald-400">
                          ${Number(acc.totalRevenue || 0).toFixed(2)}
                        </td>

                        {/* Last Synced */}
                        <td className="py-3.5 px-4 text-xs text-slate-500 dark:text-slate-400">
                          {acc.lastSyncedAt
                            ? new Date(acc.lastSyncedAt).toLocaleString("vi-VN", {
                                hour: "2-digit",
                                minute: "2-digit",
                                day: "2-digit",
                                month: "2-digit",
                              })
                            : "Chưa sync"}
                        </td>

                        {/* Action Buttons */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Sync Button */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => syncMutation.mutate({ accountId: acc.id })}
                                  disabled={syncMutation.isPending}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-950/40 transition-colors cursor-pointer"
                                >
                                  <RefreshCw className={`w-3.5 h-3.5 ${syncMutation.isPending ? "animate-spin text-pink-600" : ""}`} />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                Đồng bộ TikTok Studio
                              </TooltipContent>
                            </Tooltip>

                            {/* Launch GPM */}
                            {acc.gpmProfileId && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => startGpmMutation.mutate({ gpmProfileId: acc.gpmProfileId })}
                                    disabled={startGpmMutation.isPending}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 transition-colors cursor-pointer"
                                  >
                                    <Play className="w-3.5 h-3.5 fill-current" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  Mở trình duyệt GPM
                                </TooltipContent>
                              </Tooltip>
                            )}

                            {/* View Account Detail */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Link
                                  href={`/accounts/${acc.id}`}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Link>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                Xem chi tiết tài khoản
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Daily Checklists History */}
      {activeTab === "checklists" && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-500" />
                Lịch Sử Chấm Công 30 Ngày Gần Nhất
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Điểm ngày công tự động chốt theo mốc 10:00 AM mỗi ngày
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 block font-semibold">Tổng công tháng này</span>
              <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                {Number(stats.monthlyWorkdays)} Ngày Công
              </span>
            </div>
          </div>

          {dailyChecklists.length === 0 ? (
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center space-y-3">
              <Calendar className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Chưa có dữ liệu chấm công
              </h3>
              <p className="text-xs text-slate-400">
                Nhân viên này chưa có bản ghi checklist nào được tạo.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden relative z-0 isolate">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-slate-600 dark:text-slate-300 font-semibold text-xs border-b border-slate-200 dark:border-slate-800 normal-case">
                    <tr>
                      <th className="py-3.5 px-4">Ngày làm việc</th>
                      <th className="py-3.5 px-4">Số acc phụ trách</th>
                      <th className="py-3.5 px-4">Tài khoản hoàn thành</th>
                      <th className="py-3.5 px-4">Tỷ lệ hoàn thành (%)</th>
                      <th className="py-3.5 px-4">Điểm ngày công chốt</th>
                      <th className="py-3.5 px-4">Trạng thái chốt 10:00 AM</th>
                      <th className="py-3.5 px-4 text-right">Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {dailyChecklists.map((c: any) => {
                      const score = Number(c.workdayScore || 0);
                      const rate = Number(c.completionRate || 0);
                      const dateFormatted = new Date(c.date).toLocaleDateString("vi-VN", {
                        weekday: "short",
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      });

                      return (
                        <tr
                          key={c.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                            {dateFormatted}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-700 dark:text-slate-300">
                            {c.totalAssigned} accounts
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                            {c.completedCount} / {c.totalAssigned}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <span className="font-bold">{rate}%</span>
                              <div className="w-16 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${
                                    rate >= 85
                                      ? "bg-emerald-500"
                                      : rate >= 50
                                      ? "bg-amber-500"
                                      : "bg-rose-500"
                                  }`}
                                  style={{ width: `${Math.min(rate, 100)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`px-2.5 py-1 rounded-lg text-xs font-black ${
                                score >= 1.0
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                                  : score >= 0.5
                                  ? "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                                  : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                              }`}
                            >
                              {score} Ngày Công
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            {c.isLocked ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                                <Clock className="w-3.5 h-3.5 text-slate-400" /> Đã chốt (Locked)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                <Flame className="w-3.5 h-3.5 text-emerald-500" /> Đang chạy (Open)
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <Link
                              href={`/checklist?date=${new Date(c.date).toISOString().split("T")[0]}`}
                              className="inline-flex items-center gap-1 text-xs font-bold text-pink-600 dark:text-pink-400 hover:underline"
                            >
                              <span>Mở Checklist</span>
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Profile Details & System Roles */}
      {activeTab === "profile" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-pink-500" />
              Thông Tin Định Danh Nhân Sự
            </h3>
            <div className="space-y-3 text-xs divide-y divide-slate-100 dark:divide-slate-800/80">
              <div className="pt-2 flex justify-between">
                <span className="text-slate-500">Mã Nhân Sự (ID):</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{user.id}</span>
              </div>
              <div className="pt-2 flex justify-between">
                <span className="text-slate-500">Họ và Tên:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{user.fullName}</span>
              </div>
              <div className="pt-2 flex justify-between">
                <span className="text-slate-500">Tên Đăng Nhập:</span>
                <span className="font-mono text-slate-800 dark:text-slate-200">@{user.username}</span>
              </div>
              <div className="pt-2 flex justify-between">
                <span className="text-slate-500">Địa Chỉ Email:</span>
                <span className="text-slate-800 dark:text-slate-200">{user.email}</span>
              </div>
              <div className="pt-2 flex justify-between">
                <span className="text-slate-500">Số Điện Thoại:</span>
                <span className="text-slate-800 dark:text-slate-200">{user.phone || "Chưa cập nhật"}</span>
              </div>
              <div className="pt-2 flex justify-between">
                <span className="text-slate-500">Ngày Tạo Tài Khoản:</span>
                <span className="text-slate-800 dark:text-slate-200">{new Date(user.createdAt).toLocaleString("vi-VN")}</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-purple-500" />
              Phân Quyền & Vận Hành Fleet
            </h3>
            <div className="space-y-3 text-xs divide-y divide-slate-100 dark:divide-slate-800/80">
              <div className="pt-2 flex justify-between items-center">
                <span className="text-slate-500">Cấp Bậc (Role):</span>
                <span>{getRoleBadge(user.role)}</span>
              </div>
              <div className="pt-2 flex justify-between items-center">
                <span className="text-slate-500">Trạng Thái Hệ Thống:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {user.isActive ? "Được phép đăng nhập" : "Đã bị khóa"}
                </span>
              </div>
              <div className="pt-2 flex justify-between">
                <span className="text-slate-500">Quyền Chấm Công:</span>
                <span className="text-slate-800 dark:text-slate-200">
                  {user.role === "STAFF" ? "Tự chấm công dàn account được giao" : "Quản lý & chốt công toàn đội"}
                </span>
              </div>
              <div className="pt-2 flex justify-between">
                <span className="text-slate-500">Quyền GPM-Login:</span>
                <span className="text-slate-800 dark:text-slate-200">Mở và đồng bộ các profile được phân quyền</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
