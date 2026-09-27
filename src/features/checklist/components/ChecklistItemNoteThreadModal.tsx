"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  MessageSquare,
  Send,
  User as UserIcon,
  Shield,
  ExternalLink,
  Loader2,
  Clock,
  Sparkles,
  Calendar,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { trpc } from "@/trpc/client";
import { useQueryClient } from "@tanstack/react-query";

interface ChecklistItemNoteThreadModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemId: string | null;
  accountUsername?: string;
  country?: string;
  staffName?: string;
  dateFormatted?: string;
  onNoteAdded?: (latestNote: string) => void;
}

export default function ChecklistItemNoteThreadModal({
  isOpen,
  onClose,
  itemId,
  accountUsername,
  country,
  staffName,
  dateFormatted,
  onNoteAdded,
}: ChecklistItemNoteThreadModalProps) {
  const { data: session } = useSession();
  const currentUserId = (session?.user as any)?.id;
  const currentUserRole = (session?.user as any)?.role;

  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const utils = trpc.useUtils();
  const queryClient = useQueryClient();

  // Fetch thread messages
  const {
    data: threadData,
    isLoading,
    refetch,
  } = trpc.checklist.getItemNotes.useQuery(
    { itemId: itemId || "" },
    {
      enabled: isOpen && !!itemId,
      refetchOnWindowFocus: false,
    }
  );

  // Mutation to add a message to thread with instant optimistic UI update
  const addMessageMutation = trpc.checklist.addNoteMessage.useMutation({
    onMutate: async (newMsg) => {
      // 1. Cancel ongoing queries so they don't overwrite optimistic data
      await utils.checklist.getItemNotes.cancel({ itemId: itemId || "" });

      // 2. Snapshot current thread data
      const previousThread = utils.checklist.getItemNotes.getData({ itemId: itemId || "" });

      // 3. Create optimistic message
      const optimisticMsg = {
        id: "temp-" + Date.now(),
        itemId: newMsg.itemId,
        userId: currentUserId || "",
        content: newMsg.content,
        createdAt: new Date(),
        user: {
          id: currentUserId || "",
          name: session?.user?.name || "",
          fullName: (session?.user as any)?.fullName || session?.user?.name || "Tôi",
          avatar: (session?.user as any)?.avatar || session?.user?.image || null,
          role: currentUserRole || "STAFF",
        },
      };

      // 4. Update thread query cache immediately (0ms reflex)
      if (previousThread) {
        utils.checklist.getItemNotes.setData(
          { itemId: itemId || "" },
          {
            ...previousThread,
            messages: [...(previousThread.messages || []), optimisticMsg],
            item: {
              ...previousThread.item,
              notes: newMsg.content,
            },
          }
        );
      }

      // 5. Update parent table query cache (getByDate) immediately (0ms reflex)
      queryClient.setQueriesData(
        { queryKey: [["checklist", "getByDate"]] },
        (oldData: any) => {
          if (!oldData?.checklists || !Array.isArray(oldData.checklists)) return oldData;
          return {
            ...oldData,
            checklists: oldData.checklists.map((chk: any) => {
              if (!chk.items) return chk;
              return {
                ...chk,
                items: chk.items.map((it: any) => {
                  if (it.id === newMsg.itemId) {
                    return {
                      ...it,
                      notes: newMsg.content,
                      _count: {
                        ...(it._count || {}),
                        notesList: ((it._count?.notesList || 0) + 1),
                      },
                    };
                  }
                  return it;
                }),
              };
            }),
          };
        }
      );

      // 6. Clear input box immediately & scroll down
      setInputText("");
      if (onNoteAdded) {
        onNoteAdded(newMsg.content);
      }
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);

      return { previousThread };
    },
    onError: (err, newMsg, context) => {
      // Rollback on error
      if (context?.previousThread) {
        utils.checklist.getItemNotes.setData(
          { itemId: itemId || "" },
          context.previousThread
        );
      }
    },
    onSettled: () => {
      // Always sync in background with server
      utils.checklist.getItemNotes.invalidate({ itemId: itemId || "" });
      utils.checklist.getByDate.invalidate();
      utils.checklist.getToday.invalidate();
    },
  });

  // Auto scroll to bottom when opened or messages change
  useEffect(() => {
    if (isOpen && threadData?.messages) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 150);
    }
  }, [isOpen, threadData?.messages?.length]);

  // Focus textarea when modal opens
  useEffect(() => {
    if (isOpen && threadData?.canPost) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 200);
    }
  }, [isOpen, threadData?.canPost]);

  const handleSend = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || !itemId || addMessageMutation.isPending) return;

    await addMessageMutation.mutateAsync({
      itemId,
      content: trimmed,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case "ADMIN":
        return (
          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/80">
            Admin
          </span>
        );
      case "LEAD":
        return (
          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/80">
            Leader
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80">
            Nhân sự
          </span>
        );
    }
  };

  // Helper to render URLs as clickable links
  const renderMessageContent = (content: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = content.split(urlRegex);

    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-pink-600 dark:text-pink-400 hover:text-pink-700 hover:underline break-all mx-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <span>{part}</span>
            <ExternalLink className="w-3 h-3 inline shrink-0" />
          </a>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  const quickPresets = [
    "✅ Đã đăng video hôm nay",
    "❌ Link video 404 / không truy cập được",
    "⚠️ Bị checkpoint / cần đổi proxy",
    "🎬 Đã cập nhật link video mới",
    "📌 Xin duyệt bù video",
    "👍 Đã kiểm tra đạt yêu cầu",
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl sm:max-w-2xl w-[92vw] h-[84vh] max-h-[720px] p-0 flex flex-col rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-slate-100 dark:border-slate-800/90 bg-slate-50/80 dark:bg-slate-950/60 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-pink-500/20">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Trao đổi & Ghi chú vận hành</span>
                  {threadData?.messages && threadData.messages.length > 0 && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300">
                      {threadData.messages.length}
                    </span>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    @{accountUsername || threadData?.item?.account?.username || "—"}
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <span>
                    Nhân sự: <strong className="text-slate-700 dark:text-slate-300 font-semibold">{staffName || threadData?.item?.operator?.fullName || "—"}</strong>
                  </span>
                  {dateFormatted && (
                    <>
                      <span className="text-slate-300 dark:text-slate-700">•</span>
                      <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                        <Calendar className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                        <span>{dateFormatted}</span>
                      </span>
                    </>
                  )}
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Message Thread Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 bg-slate-50/40 dark:bg-slate-950/30">
          {isLoading ? (
            <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-pink-500" />
              <span className="text-xs">Đang tải cuộc trao đổi...</span>
            </div>
          ) : !threadData?.messages || threadData.messages.length === 0 ? (
            <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-white/60 dark:bg-slate-900/60">
              <div className="w-12 h-12 rounded-2xl bg-pink-50 dark:bg-pink-950/40 text-pink-500 flex items-center justify-center mb-3">
                <Sparkles className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Chưa có trao đổi nào
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                Nhân sự hoặc Quản lý (Lead / Admin) có thể gửi tin nhắn phản hồi, dán link video, ghi chú lỗi kênh trực tiếp tại đây.
              </p>
            </div>
          ) : (
            threadData.messages.map((msg: any) => {
              const isMe = msg.userId === currentUserId;
              const formattedTime = msg.createdAt
                ? format(new Date(msg.createdAt), "HH:mm • dd/MM", { locale: vi })
                : "";

              const userAvatar = isMe
                ? (session?.user as any)?.avatar || session?.user?.image || msg.user?.avatar
                : msg.user?.avatar;

              const displayName = isMe
                ? "Tôi"
                : msg.user?.fullName || msg.user?.name || "Người dùng";

              const fallbackInitial = (isMe ? (session?.user?.name || "T") : displayName)
                .charAt(0)
                .toUpperCase();

              const renderAvatarWithTooltip = (isOwn: boolean) => (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="cursor-pointer shrink-0 transition-transform hover:scale-105 active:scale-95">
                      <Avatar className={`w-8 h-8 rounded-full border shadow-2xs ${
                        isOwn ? "border-pink-200 dark:border-pink-900/60" : "border-slate-200/80 dark:border-slate-700"
                      }`}>
                        {userAvatar && <AvatarImage src={userAvatar} alt={displayName} className="object-cover" />}
                        <AvatarFallback className={`text-xs font-bold ${
                          isOwn
                            ? "bg-pink-100 dark:bg-pink-950/70 text-pink-700 dark:text-pink-300"
                            : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                        }`}>
                          {fallbackInitial || <UserIcon className="w-3.5 h-3.5" />}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-slate-900 dark:bg-slate-800 text-white rounded-xl shadow-lg border border-slate-800 dark:border-slate-700">
                    <span className="font-semibold">{displayName}</span>
                    {getRoleBadge(msg.user?.role || (isOwn ? currentUserRole : undefined))}
                  </TooltipContent>
                </Tooltip>
              );

              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 ${isMe ? "justify-end" : "justify-start"}`}
                >
                  {/* Receiver Avatar (Left) */}
                  {!isMe && renderAvatarWithTooltip(false)}

                  <div className={`flex flex-col max-w-[80%] sm:max-w-[75%] ${isMe ? "items-end" : "items-start"}`}>
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-xs whitespace-pre-wrap ${isMe
                          ? "bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-pink-500/10"
                          : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700/80 shadow-slate-200/50 dark:shadow-none"
                        }`}
                    >
                      {isMe ? (
                        // Render white links for own messages
                        <div className="break-words">
                          {msg.content.split(/(https?:\/\/[^\s]+)/g).map((part: string, idx: number) => {
                            if (part.match(/(https?:\/\/[^\s]+)/g)) {
                              return (
                                <a
                                  key={idx}
                                  href={part}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline font-bold text-white hover:text-pink-100 break-all inline-flex items-center gap-0.5 mx-0.5"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span>{part}</span>
                                  <ExternalLink className="w-3 h-3 inline shrink-0" />
                                </a>
                              );
                            }
                            return <span key={idx}>{part}</span>;
                          })}
                        </div>
                      ) : (
                        renderMessageContent(msg.content)
                      )}
                    </div>

                    {/* Timestamp at bottom left of message item */}
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 px-1 flex items-center gap-1 self-start">
                      <Clock className="w-2.5 h-2.5" />
                      {formattedTime}
                    </span>
                  </div>

                  {/* Sender Avatar (Right) */}
                  {isMe && renderAvatarWithTooltip(true)}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input & Composer Footer Area */}
        <div className="p-4 border-t border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
          {threadData?.canPost ? (
            <div className="space-y-2.5">
              {/* Quick Suggestion Chips - comfortable spacing with sleek visible scrollbar and wheel support */}
              <div
                onWheel={(e) => {
                  if (e.deltaY !== 0) {
                    e.currentTarget.scrollLeft += e.deltaY;
                  }
                }}
                className="flex items-center gap-2 overflow-x-auto pt-1 pb-2.5 px-0.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-slate-100 dark:[&::-webkit-scrollbar-track]:bg-slate-800/60 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-pink-400 cursor-grab active:cursor-grabbing"
              >
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 shrink-0 uppercase tracking-wider flex items-center gap-1 mr-0.5 select-none">
                  <Sparkles className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                  Gợi ý:
                </span>
                {quickPresets.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      setInputText((prev) => (prev ? `${prev} • ${tag}` : tag));
                      textareaRef.current?.focus();
                    }}
                    className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800/90 hover:bg-pink-50 dark:hover:bg-pink-950/50 text-slate-600 dark:text-slate-300 hover:text-pink-600 dark:hover:text-pink-400 border border-slate-200/80 dark:border-slate-700/80 hover:border-pink-300 dark:hover:border-pink-800 transition-all cursor-pointer shadow-2xs active:scale-95"
                  >
                    {tag}
                  </button>
                ))}
              </div>

              {/* Composer Box */}
              <div className="flex items-center gap-2.5 bg-slate-50/90 dark:bg-slate-950/80 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-1.5 sm:p-2 focus-within:border-pink-500/80 dark:focus-within:border-pink-500/80 focus-within:ring-2 focus-within:ring-pink-500/10 transition-all">
                <textarea
                  ref={textareaRef}
                  rows={2}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Nhập nội dung phản hồi, dán link video TikTok, báo lỗi (Nhấn Enter để gửi)..."
                  className="flex-1 min-h-[48px] max-h-[120px] p-2 text-xs bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none resize-none leading-relaxed"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!inputText.trim() || addMessageMutation.isPending}
                  className="h-10 px-4 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 active:scale-95 text-white font-bold text-xs shadow-md shadow-pink-500/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  {addMessageMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline font-semibold">Gửi</span>
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 px-1 pt-0.5">
                <span className="flex items-center gap-1">
                  Nhấn <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-600 dark:text-slate-400">Enter</kbd> để gửi, <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-600 dark:text-slate-400">Shift + Enter</kbd> xuống dòng
                </span>
                <span className="hidden md:inline">Admin, Leader và nhân sự phụ trách được gửi tin</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-500 text-xs">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Bạn đang ở chế độ chỉ xem (chỉ Quản lý hoặc nhân sự phụ trách mới có quyền gửi tin nhắn).</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
              >
                Đóng
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
