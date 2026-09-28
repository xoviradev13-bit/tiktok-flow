"use client";

import React from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Video,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  Eye,
  Heart,
  MessageSquare,
  Share2,
  Calendar,
  X,
  ExternalLink,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useCurrency } from "@/contexts/CurrencyContext";

interface VideoCrossCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string | null;
  accountId?: string;
  dateStr: string | null;
  staffName?: string;
  canApprove?: boolean;
  onApproveVideo?: (itemId: string) => void;
  onSyncAccount?: (accountId: string) => void;
}

export default function VideoCrossCheckModal({
  isOpen,
  onClose,
  username,
  accountId,
  dateStr,
  staffName,
  canApprove = false,
  onApproveVideo,
  onSyncAccount,
}: VideoCrossCheckModalProps) {
  const { formatRevenue } = useCurrency();

  const utils = trpc.useUtils();

  const { data, isLoading, refetch, isFetching } = trpc.checklist.getAccountVideos.useQuery(
    {
      username: username || "",
      accountId,
      date: dateStr || "",
    },
    {
      enabled: isOpen && !!username && !!dateStr,
      staleTime: 30000,
    }
  );

  if (!username || !dateStr) return null;

  const dateObj = new Date(dateStr + "T00:00:00");
  const formattedDateTitle = !isNaN(dateObj.getTime())
    ? format(dateObj, "EEEE, 'ngày' dd 'tháng' MM, yyyy", { locale: vi })
    : dateStr;

  const targetVideos = data?.targetDateVideos || [];

  const accountInfo = data?.account;
  const itemStatus = data?.checklistItem;

  const gpmProfileBadge = (name?: string | null) => {
    if (!name) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700">
          Chưa có GPM
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60">
        {name}
      </span>
    );
  };

  const splitDateTime = (raw?: string | null) => {
    if (!raw) return { time: "", date: "" };
    const parts = raw.split(/[•·]/).map((s) => s.trim()).filter(Boolean);
    return { time: parts[0] || "", date: parts[1] || "" };
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="w-[95vw] sm:max-w-4xl md:max-w-5xl lg:max-w-6xl max-h-[90vh] h-[85vh] flex flex-col p-0 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden z-[150]"
      >
        {/* Header */}
        <DialogHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-pink-500/15 via-rose-500/15 to-purple-500/15 border border-pink-500/30 flex items-center justify-center text-pink-600 dark:text-pink-400 font-black text-sm shrink-0 shadow-xs">
                <Video className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <DialogTitle className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
                    Đối Soát Video: @{username}
                  </DialogTitle>
                  {gpmProfileBadge(accountInfo?.gpmProfileName)}
                  {accountInfo?.status && (
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      {accountInfo.status}
                    </span>
                  )}
                </div>
                <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{formattedDateTitle}</span>
                  {staffName && (
                    <>
                      <span>•</span>
                      <span>Nhân sự: <strong>{staffName}</strong></span>
                    </>
                  )}
                </DialogDescription>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              aria-label="Đóng"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Status Bar */}
          <div className="mt-4 grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs">
            <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Video Ngày Này</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1">
                  <Video className="w-3.5 h-3.5 text-pink-500" /> {targetVideos.length} video
                </span>
              </div>
            </div>
            <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Trạng Thái Đăng</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                {itemStatus?.isPosted ? (
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Đã đăng
                  </span>
                ) : (
                  <span className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Chưa đăng
                  </span>
                )}
              </div>
            </div>
            <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Trạng Thái Sync</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                {itemStatus?.isSynced ? (
                  <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Đã sync GPM
                  </span>
                ) : (
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Chưa sync
                  </span>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Body Content: Video List */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3">
          {isLoading ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-8 h-8 rounded-full border-2 border-pink-500 border-t-transparent animate-spin mx-auto" />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Đang tải dữ liệu video từ AccountAnalytics...
              </p>
            </div>
          ) : targetVideos.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                <Video className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {`Không tìm thấy video nào đăng vào ngày ${format(dateObj, "dd/MM/yyyy")}`}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Nhân sự có thể chưa đăng video vào ngày này hoặc Client Agent chưa chạy quét Studio. Hãy bấm &quot;Sync Live Studio&quot; hoặc chạy lại đối soát để cập nhật dữ liệu.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {targetVideos.map((video, idx) => (
                <div
                  key={video.id || idx}
                  className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group ${video.isTargetDate
                    ? "bg-emerald-50/20 dark:bg-emerald-950/15 border-emerald-200/80 dark:border-emerald-900/40 shadow-xs"
                    : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                >
                  {/* Left: Video Cover & Title */}
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    {/* Thumbnail */}
                    <div className="relative w-16 h-20 sm:w-20 sm:h-24 rounded-xl bg-slate-950 overflow-hidden shrink-0 border border-slate-200/60 dark:border-slate-800 shadow-2xs">
                      {video.coverUrl ? (
                        <img
                          src={video.coverUrl}
                          alt={video.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-600">
                          <Video className="w-6 h-6" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/25 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play className="w-5 h-5 text-white fill-white" />
                      </div>
                    </div>

                    {/* Meta */}
                    <div className="min-w-0 flex-1 space-y-1.5">
                      {/* Badge on top, date/time below */}
                      <div className="flex flex-col items-start gap-1 min-w-0">
                        {video.isTargetDate ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 whitespace-nowrap shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Khớp ngày chấm công
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 whitespace-nowrap shrink-0">
                            {video.vnDateStr || video.postDate}
                          </span>
                        )}
                        <div className="flex items-center gap-2.5 text-[11px] font-semibold text-slate-400 whitespace-nowrap">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {splitDateTime(video.formattedTime).time}
                          </span>
                          {splitDateTime(video.formattedTime).date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> {splitDateTime(video.formattedTime).date}
                            </span>
                          )}
                        </div>
                      </div>

                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white line-clamp-2 leading-snug">
                        {video.title}
                      </h4>

                      {/* Engagement Stats Row */}
                      <div className="flex items-center gap-3 pt-1 text-xs text-slate-600 dark:text-slate-400 flex-wrap">
                        <span className="inline-flex items-center gap-1 font-bold text-slate-800 dark:text-slate-200">
                          <Eye className="w-3.5 h-3.5 text-cyan-500" />
                          {video.views.toLocaleString()} <span className="font-normal text-slate-400">views</span>
                        </span>
                        <span className="inline-flex items-center gap-1 font-semibold">
                          <Heart className="w-3.5 h-3.5 text-rose-500" />
                          {video.likes.toLocaleString()}
                        </span>
                        <span className="inline-flex items-center gap-1 font-semibold">
                          <MessageSquare className="w-3.5 h-3.5 text-amber-500" />
                          {video.comments.toLocaleString()}
                        </span>
                        {video.shares > 0 && (
                          <span className="inline-flex items-center gap-1 font-semibold">
                            <Share2 className="w-3.5 h-3.5 text-purple-500" />
                            {video.shares.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                    {video.tiktokUrl ? (
                      <a
                        href={video.tiktokUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-9 px-3.5 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white shadow-sm transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-95"
                      >
                        <span>Xem trên TikTok</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400 italic">Không có link ID</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}