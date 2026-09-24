"use client";

import React, { useState } from "react";
import { format } from "date-fns";
import { SyncStatusBadge } from "@/components/common/SyncStatusBadge";
import { vi } from "date-fns/locale";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  AlertCircle,
  Clock,
  Video,
  RefreshCw,
  FileEdit,
  ExternalLink,
  Play,
  Users,
  Check,
  X,
  ArrowRight,
  Shield,
  ShieldCheck,
  UserCheck,
  MoreHorizontal,
  Zap,
  XCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DayDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  dateStr: string | null;
  checklistsForDate: any[];
  onSwitchToTableView?: (dateStr: string) => void;
  onEditNote?: (item: any, staffName: string) => void;
  onLaunchGpm?: (gpmProfileId: string) => void;
  onSyncAccount?: (accountId: string) => void;
  onViewVideos?: (account: any, dateStr: string) => void;
  isAdmin?: boolean;
  onAdminCheckComplete?: (checklistId: string, fullName: string) => void;
  onAdminCheckHalfDay?: (checklistId: string, fullName: string) => void;
  onAdminCheckZero?: (checklistId: string, fullName: string) => void;
}

export default function DayDetailModal({
  isOpen,
  onClose,
  dateStr,
  checklistsForDate,
  onSwitchToTableView,
  onEditNote,
  onLaunchGpm,
  onSyncAccount,
  onViewVideos,
  isAdmin,
  onAdminCheckComplete,
  onAdminCheckHalfDay,
  onAdminCheckZero,
}: DayDetailModalProps) {
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);

  if (!dateStr) return null;

  const dateObj = new Date(dateStr + "T00:00:00");
  const formattedDateTitle = !isNaN(dateObj.getTime())
    ? format(dateObj, "EEEE, 'ngày' dd 'tháng' MM, yyyy", { locale: vi })
    : dateStr;

  // Aggregate metrics for this day
  const totalStaff = checklistsForDate.length;
  const fullWorkdays = checklistsForDate.filter(
    (c) => Number(c.workdayScore) >= 1.0
  ).length;
  const halfWorkdays = checklistsForDate.filter(
    (c) => Number(c.workdayScore) === 0.5
  ).length;
  const zeroWorkdays = checklistsForDate.filter(
    (c) => Number(c.workdayScore) === 0
  ).length;

  let totalAccounts = 0;
  let totalVideos = 0;
  let totalSynced = 0;

  for (const c of checklistsForDate) {
    totalAccounts += c.items?.length || 0;
    for (const it of c.items || []) {
      if (it.isPosted) totalVideos++;
      if (it.isSynced) totalSynced++;
    }
  }

  const activeChecklist = selectedStaffId
    ? checklistsForDate.find((c) => c.userId === selectedStaffId) ||
      checklistsForDate[0]
    : checklistsForDate[0];

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case "ADMIN":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 shadow-2xs whitespace-nowrap">
            <Shield className="w-3.5 h-3.5 shrink-0" /> Quản trị viên
          </span>
        );
      case "LEAD":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 shadow-2xs whitespace-nowrap">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" /> Trưởng nhóm
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20 shadow-2xs whitespace-nowrap">
            <UserCheck className="w-3.5 h-3.5 shrink-0" /> Nhân viên
          </span>
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="w-[95vw] sm:max-w-4xl md:max-w-5xl lg:max-w-6xl max-h-[88vh] p-0 flex flex-col overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-[150] antialiased subpixel-antialiased transform-gpu"
      >
        {/* Header - Fixed & shrink-0 */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 p-5 sm:p-6 text-white border-b border-slate-800 shrink-0 relative">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-pink-500 to-rose-500 text-white flex items-center justify-center shadow-lg shadow-pink-500/25 shrink-0">
                <CalendarIcon className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base sm:text-lg lg:text-xl font-black capitalize tracking-tight truncate text-white">
                  {formattedDateTitle}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400 mt-0.5 truncate">
                  Chi tiết bảng chấm công & tiến độ vận hành dàn kênh của nhân sự
                </DialogDescription>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
              {onSwitchToTableView && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSwitchToTableView(dateStr);
                  }}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-all cursor-pointer shadow-sm active:scale-95 shrink-0"
                >
                  <span>Mở Bảng Ngày Này</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Quick Aggregate Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-4">
            <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">
              <div className="text-[10px] uppercase font-bold text-slate-400">
                Nhân sự điểm danh
              </div>
              <div className="text-sm font-black text-white mt-0.5">
                {totalStaff} Nhân viên
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">
              <div className="text-[10px] uppercase font-bold text-emerald-400">
                Đạt 1.0 Ngày Công
              </div>
              <div className="text-sm font-black text-emerald-400 mt-0.5">
                {fullWorkdays} / {totalStaff} NV
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">
              <div className="text-[10px] uppercase font-bold text-pink-400">
                Video Đã Đăng
              </div>
              <div className="text-sm font-black text-pink-400 mt-0.5 flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {totalVideos} / {totalAccounts} accs
                </span>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">
              <div className="text-[10px] uppercase font-bold text-cyan-400">
                Đã Đồng Bộ GPM
              </div>
              <div className="text-sm font-black text-cyan-400 mt-0.5 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {totalSynced} / {totalAccounts} accs
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Body Container - Flex-1 & scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-6">
          {checklistsForDate.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              Chưa có dữ liệu chấm công cho ngày này.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Staff Selector Pills if multiple staff */}
              {checklistsForDate.length > 1 && (
                <div>
                  <div className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-pink-500" />
                    <span>Chọn nhân sự ({checklistsForDate.length} thành viên):</span>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {checklistsForDate.map((c) => {
                      const isSelected = activeChecklist?.id === c.id;
                      const score = Number(c.workdayScore || 0);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedStaffId(c.userId)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer border ${
                            isSelected
                              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent shadow-sm"
                              : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750"
                          }`}
                        >
                          <span>{c.user?.fullName || c.user?.username}</span>
                          <span
                            className={`w-2 h-2 rounded-full ${
                              score >= 1.0
                                ? "bg-emerald-500"
                                : score === 0.5
                                ? "bg-amber-500"
                                : "bg-rose-500"
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Active Staff Card */}
              {activeChecklist && (
                <div className="bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
                  {/* Staff Header Info */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-800/80">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-pink-500 text-white font-black text-sm flex items-center justify-center uppercase shrink-0 shadow-xs">
                        {(activeChecklist.user?.fullName || "NV").slice(0, 2)}
                      </div>
                      <div>
                        <div className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                          <span>{activeChecklist.user?.fullName}</span>
                          <span className="text-xs font-mono font-normal text-slate-400">
                            @{activeChecklist.user?.username}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                          <span className="flex items-center gap-1.5">
                            <span className="text-slate-400 font-medium">Vai trò:</span>
                            {getRoleBadge(activeChecklist.user?.role)}
                          </span>
                          <span>•</span>
                          <span>
                            Tiến độ:{" "}
                            <strong className="text-emerald-600 dark:text-emerald-400 font-bold">
                              {activeChecklist.completionRate}%
                            </strong>{" "}
                            ({activeChecklist.completedCount}/
                            {activeChecklist.items?.length || 0} accs đạt KPI)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Workday Badge + Actions */}
                    <div className="self-start sm:self-auto flex items-center gap-2">
                      {Number(activeChecklist.workdayScore) >= 1.0 ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-2xs">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>1.0 Công (Đạt)</span>
                        </span>
                      ) : Number(activeChecklist.workdayScore) === 0.5 ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 shadow-2xs">
                          <Clock className="w-4 h-4" />
                          <span>0.5 Công (Nửa công)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 shadow-2xs">
                          <AlertCircle className="w-4 h-4" />
                          <span>0 Công (Không đạt)</span>
                        </span>
                      )}

                      {/* Thao Tác dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="flex items-center justify-center w-7.5 h-7.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-2xs"
                            title="Thao tác"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 p-1.5 rounded-2xl shadow-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-[200]">
                          {isAdmin ? (
                            <>
                              <DropdownMenuItem
                                onClick={() => onAdminCheckComplete?.(activeChecklist.id, activeChecklist.user?.fullName)}
                                className="flex items-center gap-2.5 px-3 py-2 text-xs font-normal text-emerald-600 dark:text-emerald-400 cursor-pointer rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                              >
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                <span>Check Hoàn Thành (1.0 Công)</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onAdminCheckHalfDay?.(activeChecklist.id, activeChecklist.user?.fullName)}
                                className="flex items-center gap-2.5 px-3 py-2 text-xs font-normal text-amber-600 dark:text-amber-400 cursor-pointer rounded-xl hover:bg-amber-50 dark:hover:bg-amber-950/50"
                              >
                                <CheckCircle2 className="w-4 h-4 text-amber-500" />
                                <span>Check Hoàn Thành (0.5 Công)</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onAdminCheckZero?.(activeChecklist.id, activeChecklist.user?.fullName)}
                                className="flex items-center gap-2.5 px-3 py-2 text-xs font-normal text-rose-600 dark:text-rose-400 cursor-pointer rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/50"
                              >
                                <XCircle className="w-4 h-4 text-rose-500" />
                                <span>Check Không Hoàn Thành (0 Công)</span>
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <div className="px-3 py-1.5 text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5 italic">
                              <Shield className="w-3.5 h-3.5 shrink-0" />
                              <span>Chỉ Admin mới được duyệt công</span>
                            </div>
                          )}
                          <DropdownMenuSeparator className="my-1 bg-slate-100 dark:bg-slate-800" />
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/users/${activeChecklist.user?.id}`}
                              className="flex items-center gap-2.5 px-3 py-2 text-xs font-normal text-slate-600 dark:text-slate-400 cursor-pointer rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              <Users className="w-4 h-4 text-slate-400" />
                              <span>Xem Profile & Dàn Kênh</span>
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Account Items List */}
                  <div className="space-y-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                      <span>Danh sách {activeChecklist.items?.length || 0} kênh TikTok phụ trách:</span>
                      <span className="text-[11px] font-semibold text-slate-500 lowercase">
                        {activeChecklist.items?.filter((i: any) => i.isPosted).length || 0} đã đăng •{" "}
                        {activeChecklist.items?.filter((i: any) => i.isSynced).length || 0} đã sync
                      </span>
                    </div>

                    {(!activeChecklist.items ||
                      activeChecklist.items.length === 0) && (
                      <div className="text-xs text-slate-400 italic py-6 text-center bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                        Chưa gán tài khoản nào cho nhân viên này vào ngày này.
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-2.5">
                      {(activeChecklist.items || []).map((item: any) => {
                        const isKpiAchieved =
                          item.isCompleted || item.isPosted;
                        const isAccountFailed =
                          item.account?.status === "BANNED" ||
                          item.account?.status === "RESTRICTED" ||
                          item.account?.status === "STOPPED";
                        const isGpmMissing = !item.account?.gpmProfileId;
                        return (
                          <div
                            key={item.id}
                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3"
                          >
                            {/* Left: Account Name & Link & Notes */}
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className="w-8 h-8 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-600 dark:text-pink-400 font-black text-xs flex items-center justify-center shrink-0">
                                {item.account.username?.slice(0, 2).toUpperCase() ||
                                  "TK"}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Link
                                    href={`/accounts/${item.account.id}`}
                                    className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white hover:text-pink-500 hover:underline truncate"
                                  >
                                    @{item.account.username}
                                  </Link>
                                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase border border-slate-200 dark:border-slate-700">
                                    {item.account.country || "US"}
                                  </span>
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 flex items-center gap-1.5">
                                  <span>{item.notes || "Chưa có ghi chú vận hành"}</span>
                                </div>
                              </div>
                            </div>

                            {/* Right: Status Indicators & Quick Actions */}
                            <div className="flex items-center justify-between md:justify-end gap-3 sm:gap-4 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800/80">
                              {/* Video Posted Status with Rich Tooltip */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1.5 text-xs font-semibold cursor-help select-none">
                                    <span
                                      className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] shadow-2xs ${
                                        item.isPosted
                                          ? "bg-emerald-500 text-white"
                                          : isAccountFailed
                                          ? "bg-rose-500 text-white"
                                          : "bg-rose-500 text-white"
                                      }`}
                                    >
                                      {item.isPosted ? (
                                        <Check className="w-3 h-3 stroke-[3]" />
                                      ) : isAccountFailed ? (
                                        <AlertCircle className="w-3 h-3 stroke-[2.5]" />
                                      ) : (
                                        <X className="w-3 h-3 stroke-[3]" />
                                      )}
                                    </span>
                                    <span
                                      className={
                                        item.isPosted
                                          ? "text-emerald-600 dark:text-emerald-400 font-bold"
                                          : "text-slate-400"
                                      }
                                    >
                                      Video
                                    </span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs font-normal z-[200] max-w-xs">
                                  {item.isPosted
                                    ? `Đã đăng video${
                                        item.postedAt
                                          ? ` lúc ${format(new Date(item.postedAt), "HH:mm dd/MM/yyyy")}`
                                          : " hôm nay"
                                      }`
                                    : isAccountFailed
                                    ? `Kiểm tra thất bại: Tài khoản bị ${
                                        item.account?.status === "BANNED"
                                          ? "khóa (Banned)"
                                          : item.account?.status === "RESTRICTED"
                                          ? "hạn chế"
                                          : "tạm dừng"
                                      } - Không thể đăng video`
                                    : `Chưa đăng video ngày ${format(
                                        new Date(dateStr + "T00:00:00"),
                                        "dd/MM/yyyy"
                                      )}`}
                                </TooltipContent>
                              </Tooltip>

                              {/* Sync GPM Status with Rich Diagnostic Badge */}
                              <SyncStatusBadge
                                account={item.account}
                                isSyncedToday={item.isSynced}
                                syncedAt={item.syncedAt || item.account?.lastSyncedAt}
                                mode="compact"
                              />

                              {/* KPI Pill with Rich Tooltip */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="cursor-help select-none">
                                    {isKpiAchieved ? (
                                      <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 shadow-2xs inline-flex items-center gap-1">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        <span>Đạt KPI</span>
                                      </span>
                                    ) : (
                                      <span className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 shadow-2xs inline-flex items-center gap-1 whitespace-nowrap">
                                        Chưa đạt
                                      </span>
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs font-normal z-[200]">
                                  {isKpiAchieved
                                    ? "Đạt KPI: Đã đăng video và đồng bộ GPM đầy đủ"
                                    : "Không đạt: Chưa đăng video hoặc chưa đồng bộ GPM ngày này"}
                                </TooltipContent>
                              </Tooltip>

                              {/* Quick Actions Buttons */}
                              <div className="flex items-center gap-1 pl-2 border-l border-slate-200 dark:border-slate-800">
                                {item.account.gpmProfileId && onLaunchGpm && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onLaunchGpm(item.account.gpmProfileId)
                                        }
                                        className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer"
                                      >
                                        <Play className="w-3.5 h-3.5" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">
                                      Mở GPM Profile
                                    </TooltipContent>
                                  </Tooltip>
                                )}

                                {onSyncAccount && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onSyncAccount(item.account.id)
                                        }
                                        className="p-1.5 rounded-lg text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 transition-colors cursor-pointer"
                                      >
                                        <RefreshCw className="w-3.5 h-3.5" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">
                                      Đồng bộ Live
                                    </TooltipContent>
                                  </Tooltip>
                                )}

                                {onViewVideos && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onViewVideos(item.account, dateStr)
                                        }
                                        className="p-1.5 rounded-lg text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-950/40 transition-colors cursor-pointer"
                                      >
                                        <Video className="w-3.5 h-3.5" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">
                                      Đối soát video ({format(new Date(dateStr + "T00:00:00"), "dd/MM")})
                                    </TooltipContent>
                                  </Tooltip>
                                )}

                                {onEditNote && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onEditNote(
                                            item,
                                            activeChecklist.user?.fullName
                                          )
                                        }
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-950/40 transition-colors cursor-pointer"
                                      >
                                        <FileEdit className="w-3.5 h-3.5" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">
                                      Sửa ghi chú
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer - Close button */}
        <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 px-5 sm:px-6 py-3 flex items-center justify-end gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold bg-slate-900 hover:bg-rose-600 dark:bg-slate-800 dark:hover:bg-rose-600 text-white border border-transparent transition-all cursor-pointer shadow-sm active:scale-95"
              >
                <span>Đóng</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs z-[200] font-semibold">
              Đóng (Esc)
            </TooltipContent>
          </Tooltip>
        </div>
      </DialogContent>
    </Dialog>
  );
}
