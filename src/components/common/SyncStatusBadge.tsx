"use client";

import React, { useMemo } from "react";
import { format, formatDistanceToNow, isToday } from "date-fns";
import { vi } from "date-fns/locale";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  HelpCircle,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Radio,
  Lock,
  RefreshCw,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface AccountSyncDiagnostic {
  state: "HEALTHY" | "STALE" | "NEVER" | "ERROR" | "WARNING";
  code:
    | "ONLINE_SYNCED"
    | "SYNCED"
    | "STALE"
    | "NEVER_SYNCED"
    | "NO_GPM"
    | "CHECKPOINT"
    | "UNAUTHENTICATED"
    | "BANNED"
    | "RESTRICTED"
    | "CREATOR_REWARDS_MISSING"
    | "SYNC_ERROR";
  badgeText: string;
  shortLabel: string;
  detailTime: string;
  relativeTime: string;
  reason: string;
  action: string;
  analyticsAvailability: "FULL" | "PARTIAL" | "BLOCKED" | "NO_DATA";
  analyticsNote: string;
  color: {
    bg: string;
    text: string;
    border: string;
    dot: string;
    badgeCls: string;
  };
}

export function getAccountSyncDiagnostic(
  account?: {
    id?: string;
    username?: string;
    status?: string;
    isOnline?: boolean | null;
    lastSyncedAt?: Date | string | null;
    gpmProfileId?: string | null;
    gpmProfileName?: string | null;
    groupName?: string | null;
    bannedReason?: string | null;
    syncStatus?: string | null;
    metadata?: any;
    alerts?: Array<{ alertType: string; description?: string; severity?: string }>;
  } | null,
  options?: {
    isSyncedToday?: boolean;
    syncedAt?: Date | string | null;
  }
): AccountSyncDiagnostic {
  if (!account) {
    return {
      state: "NEVER",
      code: "NEVER_SYNCED",
      badgeText: "Chưa có dữ liệu",
      shortLabel: "Chưa sync",
      detailTime: "Chưa từng ghi nhận",
      relativeTime: "Chưa từng",
      reason: "Tài khoản chưa được hệ thống ghi nhận dữ liệu.",
      action: "Khởi động GPM Profile hoặc chạy lệnh đồng bộ để nạp tài khoản.",
      analyticsAvailability: "NO_DATA",
      analyticsNote: "Chưa có số liệu Analytics trong hệ thống.",
      color: {
        bg: "bg-slate-50 dark:bg-slate-900/60",
        text: "text-slate-600 dark:text-slate-400",
        border: "border-slate-200 dark:border-slate-800",
        dot: "bg-slate-400 dark:bg-slate-500",
        badgeCls: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700",
      },
    };
  }

  const rawLastSync = options?.syncedAt || account.lastSyncedAt;
  const syncDate = rawLastSync ? new Date(rawLastSync) : null;
  const hasSyncDate = syncDate && !Number.isNaN(syncDate.getTime());

  const detailTime = hasSyncDate
    ? format(syncDate, "HH:mm:ss dd/MM/yyyy")
    : "Chưa từng";

  const relativeTime = hasSyncDate
    ? formatDistanceToNow(syncDate, { addSuffix: true, locale: vi })
    : "Chưa từng";

  const isBanned =
    account.status === "BANNED" ||
    Boolean(account.bannedReason?.toLowerCase().includes("khóa") || account.bannedReason?.toLowerCase().includes("banned"));

  const isRestricted = account.status === "RESTRICTED";

  const hasCheckpointAlert = account.alerts?.some(
    (al) => al.alertType === "CHECKPOINT"
  );

  const hasUnauthAlert = account.alerts?.some(
    (al) => al.alertType === "NOT_LOGGED_IN"
  );

  const isMissingGpm = !account.gpmProfileId;

  const isCreatorRewardsMissing =
    (account.metadata as any)?.creatorRewardsMissing === true ||
    account.alerts?.some((al) => al.alertType === "PROGRAM_DISQUALIFIED");

  const diffHours = hasSyncDate
    ? (Date.now() - syncDate.getTime()) / (1000 * 60 * 60)
    : 9999;

  // 1. Critical Errors
  if (isBanned) {
    return {
      state: "ERROR",
      code: "BANNED",
      badgeText: "Tài khoản bị khóa (Banned)",
      shortLabel: "Banned",
      detailTime,
      relativeTime,
      reason:
        account.bannedReason ||
        "Tài khoản TikTok bị khóa vi phạm tiêu chuẩn cộng đồng hoặc bị ngừng hoàn toàn.",
      action: "Mở ứng dụng TikTok kiểm tra hòm thư kháng nghị hoặc gỡ tài khoản.",
      analyticsAvailability: "BLOCKED",
      analyticsNote: "Không thể lấy số liệu mới vì tài khoản đã bị khóa.",
      color: {
        bg: "bg-rose-50/60 dark:bg-rose-950/40",
        text: "text-rose-700 dark:text-rose-300",
        border: "border-rose-200 dark:border-rose-900/60",
        dot: "bg-rose-500",
        badgeCls: "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800",
      },
    };
  }

  const checkpointAlert = account.alerts?.find((al) => al.alertType === "CHECKPOINT");
  if (hasCheckpointAlert) {
    return {
      state: "ERROR",
      code: "CHECKPOINT",
      badgeText: "Dính Checkpoint / Captcha",
      shortLabel: "Captcha / OTP",
      detailTime,
      relativeTime,
      reason:
        checkpointAlert?.description ||
        "TikTok yêu cầu xác minh bảo mật (kéo mảnh ghép Captcha, nhận mã OTP Email/SĐT).",
      action: "Mở profile trực tiếp trên GPMLogin để kéo Captcha / xác thực bằng tay.",
      analyticsAvailability: "BLOCKED",
      analyticsNote: "Trình duyệt tự động bị chặn ở màn hình xác minh, không vào được Studio.",
      color: {
        bg: "bg-rose-50/60 dark:bg-rose-950/40",
        text: "text-rose-700 dark:text-rose-300",
        border: "border-rose-200 dark:border-rose-900/60",
        dot: "bg-rose-500 animate-pulse",
        badgeCls: "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800",
      },
    };
  }

  if (isMissingGpm) {
    return {
      state: "ERROR",
      code: "NO_GPM",
      badgeText: "Chưa gán GPM Profile",
      shortLabel: "Thiếu GPM",
      detailTime,
      relativeTime,
      reason:
        "Tài khoản chưa được liên kết với ID profile trong GPMLogin.",
      action:
        "Bấm vào tài khoản ➔ Nhập GPM Profile ID tương ứng để hệ thống tự động quét.",
      analyticsAvailability: "BLOCKED",
      analyticsNote: "Client Agent không thể tự động mở hoặc đọc cookie từ profile này.",
      color: {
        bg: "bg-amber-50/60 dark:bg-amber-950/40",
        text: "text-amber-800 dark:text-amber-300",
        border: "border-amber-200 dark:border-amber-800/60",
        dot: "bg-amber-500",
        badgeCls: "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
      },
    };
  }

  const unauthAlert = account.alerts?.find((al) => al.alertType === "NOT_LOGGED_IN");
  if (hasUnauthAlert) {
    return {
      state: "ERROR",
      code: "UNAUTHENTICATED",
      badgeText: "Văng đăng nhập / Hết phiên",
      shortLabel: "Mất phiên",
      detailTime,
      relativeTime,
      reason:
        unauthAlert?.description ||
        "Phiên đăng nhập TikTok trên trình duyệt đã hết hạn hoặc bị đăng xuất.",
      action: "Mở profile GPM và đăng nhập lại vào tài khoản TikTok trên trình duyệt.",
      analyticsAvailability: "BLOCKED",
      analyticsNote: "Không có cookie sessionid hợp lệ để trích xuất dữ liệu kiếm tiền.",
      color: {
        bg: "bg-rose-50/60 dark:bg-rose-950/40",
        text: "text-rose-700 dark:text-rose-300",
        border: "border-rose-200 dark:border-rose-900/60",
        dot: "bg-rose-500",
        badgeCls: "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800",
      },
    };
  }

  const strikeAlert = account.alerts?.find((al) => al.alertType === "VIDEO_STRIKE");
  if (strikeAlert) {
    return {
      state: "WARNING",
      code: "SYNC_ERROR",
      badgeText: "Gậy cảnh cáo video (Strike)",
      shortLabel: "Gậy video",
      detailTime,
      relativeTime,
      reason:
        strikeAlert.description ||
        "Tài khoản có video bị gậy vi phạm chính sách hoặc hủy điều kiện kiếm tiền trong 30 ngày qua.",
      action: "Kiểm tra hòm thư TikTok Studio để kháng nghị hoặc khắc phục video vi phạm.",
      analyticsAvailability: "PARTIAL",
      analyticsNote: "Số liệu có thể bị ảnh hưởng do video bị huỷ quyền kiếm tiền.",
      color: {
        bg: "bg-amber-50/60 dark:bg-amber-950/40",
        text: "text-amber-700 dark:text-amber-300",
        border: "border-amber-200 dark:border-amber-800/60",
        dot: "bg-amber-500",
        badgeCls: "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
      },
    };
  }

  const firstOpenAlert = account.alerts?.[0];
  if (account.syncStatus === "SYNC_ISSUES" || firstOpenAlert) {
    return {
      state: "ERROR",
      code: "SYNC_ERROR",
      badgeText: firstOpenAlert ? `Cảnh báo: ${firstOpenAlert.alertType}` : "Lỗi đồng bộ (Sync Issues)",
      shortLabel: "Lỗi sync",
      detailTime,
      relativeTime,
      reason:
        firstOpenAlert?.description ||
        "Lần đồng bộ gần nhất gặp lỗi hoặc phát hiện bất thường từ hệ thống.",
      action: "Mở profile GPM kiểm tra trạng thái trình duyệt hoặc chạy lại đồng bộ.",
      analyticsAvailability: "BLOCKED",
      analyticsNote: "Dữ liệu chưa được cập nhật đầy đủ do quá trình quét gặp lỗi.",
      color: {
        bg: "bg-rose-50/60 dark:bg-rose-950/40",
        text: "text-rose-700 dark:text-rose-300",
        border: "border-rose-200 dark:border-rose-900/60",
        dot: "bg-rose-500",
        badgeCls: "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800",
      },
    };
  }

  // 2. Warnings
  if (isCreatorRewardsMissing) {
    return {
      state: "WARNING",
      code: "CREATOR_REWARDS_MISSING",
      badgeText: "Mất Quỹ Creator Rewards",
      shortLabel: "Mất Quỹ Beta",
      detailTime,
      relativeTime,
      reason:
        "Tài khoản không tìm thấy chương trình Creator Rewards trên Studio (bị loại quỹ hoặc nick mới chưa bật kiếm tiền).",
      action: "Kiểm tra tab Kiếm tiền trên Studio xem có bị nhận gậy hoặc vi phạm chính sách.",
      analyticsAvailability: "PARTIAL",
      analyticsNote: "Vẫn lấy được View và Follower, nhưng Doanh thu bằng $0.",
      color: {
        bg: "bg-amber-50/60 dark:bg-amber-950/40",
        text: "text-amber-700 dark:text-amber-300",
        border: "border-amber-200 dark:border-amber-800/60",
        dot: "bg-amber-500",
        badgeCls: "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
      },
    };
  }

  if (isRestricted) {
    return {
      state: "WARNING",
      code: "RESTRICTED",
      badgeText: "Bị hạn chế (Restricted)",
      shortLabel: "Hạn chế",
      detailTime,
      relativeTime,
      reason:
        account.bannedReason ||
        "Tài khoản đang bị hạn chế tương tác hoặc bị gậy cảnh cáo vi phạm từ TikTok.",
      action: "Kiểm tra hòm thư TikTok để biết thời gian hết hạn mức hạn chế.",
      analyticsAvailability: "PARTIAL",
      analyticsNote: "Số liệu có thể bị ảnh hưởng do video bị ẩn hoặc cấm tương tác.",
      color: {
        bg: "bg-amber-50/60 dark:bg-amber-950/40",
        text: "text-amber-700 dark:text-amber-300",
        border: "border-amber-200 dark:border-amber-800/60",
        dot: "bg-amber-500",
        badgeCls: "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
      },
    };
  }

  // 3. Stale / Never
  if (!hasSyncDate) {
    return {
      state: "NEVER",
      code: "NEVER_SYNCED",
      badgeText: "Chưa từng đồng bộ",
      shortLabel: "Chưa sync",
      detailTime: "Chưa từng",
      relativeTime: "Chưa từng",
      reason: "Tài khoản đã tạo nhưng chưa có lần cào dữ liệu thành công nào.",
      action: "Mở profile trên GPM hoặc dùng lệnh đồng bộ để nạp số liệu đầu tiên.",
      analyticsAvailability: "NO_DATA",
      analyticsNote: "Toàn bộ số liệu View, Doanh thu hiện đang ở mức mặc định 0.",
      color: {
        bg: "bg-slate-50 dark:bg-slate-900/60",
        text: "text-slate-600 dark:text-slate-400",
        border: "border-slate-200 dark:border-slate-800",
        dot: "bg-slate-400",
        badgeCls: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700",
      },
    };
  }

  if (diffHours >= 24) {
    return {
      state: "STALE",
      code: "STALE",
      badgeText: `Quá hạn (${Math.floor(diffHours)}h trước)`,
      shortLabel: `Chưa sync ${Math.floor(diffHours)}h`,
      detailTime,
      relativeTime,
      reason: `Đã ${Math.floor(diffHours)} giờ trôi qua chưa có lượt quét mới cho tài khoản này.`,
      action: "Kiểm tra xem máy tính chạy Client Agent có đang bật và kết nối mạng không.",
      analyticsAvailability: "FULL",
      analyticsNote: "Số liệu trên màn hình là số liệu của lần sync trước, có thể chưa cập nhật video mới.",
      color: {
        bg: "bg-amber-50/60 dark:bg-amber-950/40",
        text: "text-amber-700 dark:text-amber-300",
        border: "border-amber-200 dark:border-amber-800/60",
        dot: "bg-amber-500",
        badgeCls: "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
      },
    };
  }

  // 4. Healthy Synced
  if (account.isOnline) {
    return {
      state: "HEALTHY",
      code: "ONLINE_SYNCED",
      badgeText: "Online · Vừa sync",
      shortLabel: "Online OK",
      detailTime,
      relativeTime,
      reason: "Trình duyệt đang mở và gửi tín hiệu đồng bộ đều đặn theo thời gian thực.",
      action: "Hệ thống hoạt động tối ưu nhất, không cần can thiệp.",
      analyticsAvailability: "FULL",
      analyticsNote: "Toàn bộ số liệu Doanh thu, RPM, View, Follower được cập nhật liên tục.",
      color: {
        bg: "bg-emerald-50/70 dark:bg-emerald-950/40",
        text: "text-emerald-700 dark:text-emerald-300",
        border: "border-emerald-200 dark:border-emerald-800/60",
        dot: "bg-emerald-500 animate-pulse",
        badgeCls: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
      },
    };
  }

  const isTodaySync = isToday(syncDate);
  const timeStr = format(syncDate, "HH:mm");

  return {
    state: "HEALTHY",
    code: "SYNCED",
    badgeText: isTodaySync ? `Đã sync lúc ${timeStr}` : `Đã sync (${relativeTime})`,
    shortLabel: isTodaySync ? `Sync ${timeStr}` : "Đã sync",
    detailTime,
    relativeTime,
    reason: "Lượt đồng bộ gần nhất diễn ra thành công và hợp lệ.",
    action: "Số liệu ổn định. Hệ thống sẽ tiếp tục cào ngầm theo lịch trình.",
    analyticsAvailability: "FULL",
    analyticsNote: "Toàn bộ số liệu Doanh thu, View, Follower đã được lưu trữ đầy đủ.",
    color: {
      bg: "bg-cyan-50/60 dark:bg-cyan-950/40",
      text: "text-cyan-700 dark:text-cyan-300",
      border: "border-cyan-200 dark:border-cyan-800/60",
      dot: "bg-cyan-500",
      badgeCls: "bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800",
    },
  };
}

export function hasAccountSyncIssue(account: any): boolean {
  if (account?.syncStatus === "SYNC_ISSUES") return true;
  if (account?.syncStatus === "SYNC_OK") return false;
  const diag = getAccountSyncDiagnostic(account);
  return diag.state === "ERROR" || diag.state === "STALE" || diag.state === "NEVER";
}

export interface SyncStatusBadgeProps {
  account: any;
  mode?: "full" | "compact" | "badge-only";
  className?: string;
  textClassName?: string;
  maxTextWidth?: string;
  isSyncedToday?: boolean;
  syncedAt?: Date | string | null;
}

export function SyncStatusBadge({
  account,
  mode = "full",
  className,
  textClassName,
  maxTextWidth,
  isSyncedToday,
  syncedAt,
}: SyncStatusBadgeProps) {
  const diag = useMemo(
    () => getAccountSyncDiagnostic(account, { isSyncedToday, syncedAt }),
    [account, isSyncedToday, syncedAt]
  );

  const StatusIcon = useMemo(() => {
    switch (diag.code) {
      case "ONLINE_SYNCED":
        return Radio;
      case "SYNCED":
        return CheckCircle2;
      case "STALE":
        return Clock;
      case "NO_GPM":
        return AlertTriangle;
      case "CHECKPOINT":
        return AlertTriangle;
      case "UNAUTHENTICATED":
        return XCircle;
      case "BANNED":
        return Lock;
      case "RESTRICTED":
      case "CREATOR_REWARDS_MISSING":
        return AlertTriangle;
      case "NEVER_SYNCED":
      default:
        return RefreshCw;
    }
  }, [diag.code]);

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "group inline-flex items-center gap-1.5 transition-all cursor-pointer font-medium select-none shrink-0 max-w-full",
                mode === "full" &&
                  "px-2.5 py-1 rounded-xl text-xs border shadow-2xs hover:opacity-90",
                mode === "compact" &&
                  "px-2 py-0.5 rounded-lg text-[11px] border shadow-2xs hover:opacity-90 font-semibold",
                mode === "badge-only" &&
                  "w-6 h-6 rounded-full items-center justify-center border shadow-2xs hover:scale-105",
                diag.color.badgeCls,
                className
              )}
            >
              <span className="relative flex h-2 w-2 shrink-0">
                {diag.state === "HEALTHY" && diag.code === "ONLINE_SYNCED" && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={cn("relative inline-flex rounded-full h-2 w-2", diag.color.dot)}
                />
              </span>

              {mode !== "badge-only" && (
                <span
                  className={cn(
                    "truncate",
                    maxTextWidth || (mode === "compact" ? "max-w-[85px] sm:max-w-[105px]" : "max-w-[140px] sm:max-w-[170px]"),
                    textClassName
                  )}
                >
                  {mode === "compact" ? diag.shortLabel : diag.badgeText}
                </span>
              )}

              <StatusIcon className="w-3 h-3 opacity-60 group-hover:opacity-100 shrink-0 transition-opacity" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs font-medium max-w-xs">
          <div className="space-y-0.5">
            <p className="font-semibold">{diag.badgeText}</p>
            <p className="text-[11px] text-slate-400">{diag.reason}</p>
          </div>
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-84 sm:w-96 p-0 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs overflow-hidden z-50 animate-in fade-in zoom-in-95"
      >
        {/* Header */}
        <div
          className={cn(
            "p-3.5 border-b flex items-start gap-2.5",
            diag.color.bg,
            diag.color.border
          )}
        >
          <div
            className={cn(
              "w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 shadow-2xs",
              diag.color.bg,
              diag.color.border,
              diag.color.text
            )}
          >
            <StatusIcon className="w-4.5 h-4.5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={cn("font-bold text-sm", diag.color.text)}>
                {diag.badgeText}
              </span>
              <span
                className={cn(
                  "text-[10px] font-bold px-1.5 py-0.2 rounded-md uppercase tracking-wider",
                  diag.state === "HEALTHY"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300"
                    : diag.state === "STALE"
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300"
                    : "bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300"
                )}
              >
                {diag.state}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              Tài khoản: @{account?.username || "N/A"}
              {account?.gpmProfileName ? ` · ${account.gpmProfileName}` : ""}
            </p>
          </div>
        </div>

        {/* Diagnostic Details */}
        <div className="p-3.5 space-y-3">
          {/* Analytics Availability Block */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                Khả năng trích xuất Analytics:
              </span>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-0.5 block">
                {diag.analyticsNote}
              </span>
            </div>
            <div>
              {diag.analyticsAvailability === "FULL" ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" /> Sẵn sàng
                </span>
              ) : diag.analyticsAvailability === "PARTIAL" ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  <AlertTriangle className="w-3 h-3 text-amber-600" /> Một phần
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                  <ShieldAlert className="w-3 h-3 text-rose-600" /> Bị gián đoạn
                </span>
              )}
            </div>
          </div>

          {/* Time & Environment Metadata */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60">
              <span className="text-slate-400 block mb-0.5">Lần sync cuối:</span>
              <span className="font-semibold text-slate-700 dark:text-slate-200 block truncate" title={diag.detailTime}>
                {diag.detailTime}
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                ({diag.relativeTime})
              </span>
            </div>

            <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60">
              <span className="text-slate-400 block mb-0.5">GPM Profile ID:</span>
              <span
                className="font-mono font-semibold text-cyan-700 dark:text-cyan-300 block truncate"
                title={account?.gpmProfileId || "Chưa có"}
              >
                {account?.gpmProfileId ? account.gpmProfileId.slice(0, 12) + "..." : "Chưa gán"}
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
                Nhóm: {account?.groupName || "--"}
              </span>
            </div>
          </div>

          {/* Diagnostic Root Cause */}
          <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Chẩn đoán nguyên nhân:
            </span>
            <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-normal">
              {diag.reason}
            </p>
          </div>

          {/* Actionable Solution */}
          <div className="p-2.5 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 block mb-1">
              Hướng dẫn khắc phục:
            </span>
            <p className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed font-medium">
              💡 {diag.action}
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default SyncStatusBadge;
