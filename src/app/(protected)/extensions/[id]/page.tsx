"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Puzzle,
  Download,
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Terminal,
  ShieldCheck,
  Zap,
  FolderArchive,
  Layers,
  Sparkles,
  ExternalLink,
  Laptop,
  HelpCircle,
  Ban,
  Bot,
  Monitor,
  KeyRound,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ImageLightbox, ZoomableImage } from "@/app/docs/_components/ImageLightbox";
import { useConfirmDialog } from "@/components/ui/confirm-modal";
import { StaffRequestModals } from "@/components/access-requests/StaffRequestModals";
import { toast } from "sonner";
import { downloadPackage } from "@/lib/download-package";

export default function ExtensionDetailPage() {
  const params = useParams();
  const idOrSlug = params?.id as string;
  const [zoomImage, setZoomImage] = useState<{ src: string; alt?: string } | null>(null);
  const { confirm, confirmDialog } = useConfirmDialog();

  const [isTokenRevealed, setIsTokenRevealed] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [machineModalOpen, setMachineModalOpen] = useState(false);
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);

  const utils = trpc.useUtils();

  const { data: meProfile } = trpc.user.me.useQuery(undefined, { staleTime: 60_000 });
  const { data: pendingMachineChange, refetch: refetchMachineChange } =
    trpc.user.myMachineChangeRequest.useQuery(undefined, {
      enabled: !!meProfile?.boundMachineId,
    });
  const { data: pendingExtensionAccess, refetch: refetchExtensionAccess } =
    trpc.user.myExtensionAccessRequest.useQuery(undefined, {
      enabled: meProfile?.extensionAccessEnabled === false,
    });

  const {
    data: ext,
    isLoading,
    refetch,
  } = trpc.extension.getById.useQuery(
    { idOrSlug },
    { enabled: !!idOrSlug }
  );

  const regenerateTokenMutation = trpc.extension.regenerateMyToken.useMutation({
    onSuccess: (res) => {
      refetch();
      setActionMsg("🔑 Đã thu hồi và cấp lại Token cá nhân mới thành công!");
      setTimeout(() => setActionMsg(null), 5000);
    },
    onError: (err: any) => {
      toast.error(err.message || "Lỗi tạo lại token");
    },
  });

  if (isLoading) {
    return (
      <div className="w-full space-y-6 pb-24">
        <DataTableSkeleton columns={3} rows={4} />
      </div>
    );
  }

  if (!ext) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Không tìm thấy tiện ích mở rộng
        </h2>
        <p className="text-xs text-slate-500">
          Tiện ích bạn đang tìm không tồn tại hoặc đã bị gỡ bỏ khỏi hệ thống.
        </p>
        <Link
          href="/extensions"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 transition-opacity"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Về danh sách Extension</span>
        </Link>
      </div>
    );
  }

  const isAccessRevoked = ext.accessEnabled === false;
  const isClientAgent =
    ext.slug === "tiktokflow-client-agent" ||
    ext.folderPath === "client-agent" ||
    ext.category === "SCRAPER";

  return (
    <div className="w-full space-y-6 pb-28 animate-fadeIn">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center justify-between text-xs gap-3 flex-wrap">
        <Link
          href="/extensions"
          className="flex items-center gap-1.5 font-bold text-slate-500 hover:text-pink-600 dark:hover:text-pink-400 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Tất cả Tiện Ích & Công Cụ (Extensions & Agents)</span>
        </Link>
        <div className="flex items-center gap-2">
          {meProfile?.boundMachineId && (
            <button
              type="button"
              disabled={!!pendingMachineChange}
              onClick={() => setMachineModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
            >
              <Monitor className="w-3.5 h-3.5 text-amber-500" />
              {pendingMachineChange ? "Đã gửi yêu cầu đổi máy" : "Yêu cầu đổi máy"}
            </button>
          )}
          {meProfile?.extensionAccessEnabled === false && (
            <button
              type="button"
              disabled={!!pendingExtensionAccess}
              onClick={() => setExtensionModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/60 disabled:opacity-50 cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              {pendingExtensionAccess ? "Đã gửi yêu cầu kích hoạt" : "Yêu cầu kích hoạt Extension"}
            </button>
          )}
        </div>
      </div>

      {actionMsg && (
        <div className="p-3.5 rounded-2xl bg-cyan-50 dark:bg-slate-900 border border-cyan-200 dark:border-slate-800 text-xs font-bold text-center text-cyan-800 dark:text-cyan-300 shadow-sm animate-in fade-in">
          {actionMsg}
        </div>
      )}

      {/* Hero Banner Card */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className={`absolute top-0 right-0 w-80 h-80 ${isClientAgent ? "bg-indigo-500/10" : "bg-pink-500/5"} rounded-full blur-3xl pointer-events-none`} />

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-3xl ${isClientAgent ? "bg-gradient-to-tr from-indigo-500 via-purple-500 to-cyan-500 shadow-indigo-500/20" : "bg-gradient-to-tr from-pink-500 via-purple-500 to-cyan-500 shadow-pink-500/20"} p-0.5 shadow-xl shrink-0`}>
              <div className="w-full h-full bg-slate-950 rounded-[22px] flex items-center justify-center">
                {isClientAgent ? (
                  <Bot className="w-8 h-8 sm:w-10 sm:h-10 text-indigo-400" />
                ) : (
                  <Puzzle className="w-8 h-8 sm:w-10 sm:h-10 text-pink-400" />
                )}
              </div>
            </div>

            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-none self-center">
                  {ext.name}
                </h1>
                <span className="inline-flex h-6 items-center justify-center px-2.5 rounded-lg text-xs font-mono font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 leading-none shrink-0 self-center">
                  v{ext.version}
                </span>
                <span className="inline-flex h-6 items-center justify-center px-2.5 rounded-lg text-xs font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 leading-none shrink-0 self-center">
                  {ext.category}
                </span>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                Phát triển bởi <span className="font-semibold text-slate-700 dark:text-slate-300">{ext.author}</span> • Hỗ trợ {ext.supportedBrowsers?.join(", ") || (isClientAgent ? "Windows 10/11, GPMLogin, Chrome" : "Chrome, GPMLogin Chromium")}
              </p>

              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 pt-1 leading-relaxed max-w-2xl">
                {ext.shortDesc || ext.description}
              </p>
            </div>
          </div>

          {/* Download Action Box */}
          <div className="flex flex-col gap-2.5 shrink-0 sm:w-72">
            {isAccessRevoked ? (
              <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-center space-y-1.5">
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400">
                  <Ban className="w-4 h-4" />
                  <span>Quyền đã bị khóa</span>
                </div>
                <p className="text-xs text-rose-700/80 dark:text-rose-300/80 leading-normal">
                  Quản trị viên đã vô hiệu hóa quyền sử dụng tiện ích của bạn.
                </p>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const url = isClientAgent
                      ? "/api/client-agent/download"
                      : "/api/extension/download";
                    downloadPackage(
                      url,
                      isClientAgent
                        ? "TikTokFlow-ClientAgent.zip"
                        : "TikTokFlow-Extension.zip"
                    );
                  }}
                  className={`flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl text-xs sm:text-sm font-bold ${isClientAgent
                    ? "bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 shadow-indigo-600/25"
                    : "bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 shadow-pink-600/25"
                    } text-white shadow-lg active:scale-95 transition-all cursor-pointer text-center`}
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>{isClientAgent ? "Tải Client Agent (.zip cá nhân)" : "Tải Extension (ZIP cá nhân)"}</span>
                </button>

                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-1.5 text-center">
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {isClientAgent
                      ? "Gói ZIP tự động gán tài khoản khi chạy lần đầu (mã có hạn ~24 giờ)."
                      : "Gói ZIP tự động gán tài khoản khi mở lần đầu (mã có hạn ~24 giờ)."}
                  </p>
                  <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400 flex items-center justify-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>Không chia sẻ file ZIP & Personal Token</span>
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Diagnostics & Personal Token Card */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-500" />
              <span>Token Xác Thực Cá Nhân & Chẩn Đoán Kết Nối</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Mã cá nhân của bạn trên máy này.{" "}
              <span className="font-bold text-rose-600 dark:text-rose-400">Tuyệt đối không chia sẻ công khai</span>.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isAccessRevoked ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                <Ban className="w-3.5 h-3.5" />
                <span>Quyền Đã Bị Vô Hiệu Hóa</span>
              </span>
            ) : ext.userToken ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Đã kích hoạt & sẵn sàng</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <span>Chưa kích hoạt</span>
              </span>
            )}
          </div>
        </div>

        {/* Token Input & Copy */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <label className="font-semibold text-slate-700 dark:text-slate-300">
              Personal Sync Token:
            </label>
            <span className="text-xs text-slate-400">
              (Tuyệt đối không chia sẻ công khai Personal Token)
            </span>
          </div>

          <div className="relative flex items-center">
            <input
              type={isTokenRevealed ? "text" : "password"}
              readOnly
              value={isAccessRevoked ? "QUYỀN EXTENSION ĐÃ BỊ ADMIN KHÓA" : ext.userToken || "Đang tạo token..."}
              className={`w-full bg-slate-50 dark:bg-slate-950 border rounded-2xl px-4 py-3 text-xs font-mono pr-24 focus:outline-none ${isAccessRevoked
                ? "border-rose-300 dark:border-rose-900/60 text-rose-500 font-bold"
                : "border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                }`}
            />
            <div className="absolute right-2.5 flex items-center gap-1">
              {!isAccessRevoked && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setIsTokenRevealed(!isTokenRevealed)}
                        className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                      >
                        {isTokenRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {isTokenRevealed ? "Ẩn Token" : "Hiện Token"}
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => {
                          if (ext.userToken) {
                            navigator.clipboard.writeText(ext.userToken);
                            setCopiedToken(true);
                            setTimeout(() => setCopiedToken(false), 2500);
                          }
                        }}
                        className="p-2 text-slate-400 hover:text-pink-600 dark:hover:text-pink-400 rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                      >
                        {copiedToken ? (
                          <Check className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {copiedToken ? "Đã sao chép!" : "Sao chép Token"}
                    </TooltipContent>
                  </Tooltip>
                </>
              )}
            </div>
          </div>
          {copiedToken && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              ✓ Đã sao chép token vào bộ nhớ tạm!
            </p>
          )}
        </div>

        {/* Action button to roll token */}
        <div className="pt-2 flex items-center justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Nếu nghi ngờ bị lộ hoặc đổi máy, bạn có thể tạo lại Token mới (Extension/Agent cũ sẽ ngừng hoạt động cho đến khi cập nhật token).
          </p>
          <button
            type="button"
            disabled={isAccessRevoked || regenerateTokenMutation.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: "Tạo Token mới",
                description:
                  "Xác nhận tạo Token mới? Extension và Client Agent đang chạy sẽ cần cập nhật Token mới để tiếp tục hoạt động!",
                confirmLabel: "Xác nhận tạo mới",
                variant: "amber",
              });
              if (ok) {
                regenerateTokenMutation.mutate();
              }
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-all cursor-pointer disabled:opacity-50 shrink-0"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${regenerateTokenMutation.isPending ? "animate-spin" : ""}`}
            />
            <span>
              {regenerateTokenMutation.isPending ? "Đang tạo..." : "Thu hồi & Cấp Token mới"}
            </span>
          </button>
        </div>
      </div>

      {/* Visual 3-Step Setup Guide */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-pink-500" />
            <span>
              {isClientAgent
                ? "Hướng Dẫn Cài Đặt & Chạy Client Agent (Chỉ mất 1 phút)"
                : "Hướng Dẫn Cài Đặt 3 Bước (Chỉ mất 30 giây)"}
            </span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isClientAgent
              ? "Mỗi máy chỉ mở một Agent (Windows). Tải ZIP, giải nén, chạy setup-agent.bat phím 1 trước khi dùng Extension. Nếu mã liên kết hết hạn, lấy Personal Token ở Cài đặt rồi chạy setup-agent.bat phím 3."
              : "Cài Client Agent trước (setup-agent.bat phím 1), rồi nạp Extension vào GPMLogin. Extension nhận biết tài khoản đang đăng nhập; Agent cập nhật số liệu."}
          </p>
        </div>

        {isClientAgent ? (
          <div className="space-y-6">
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
              <strong className="font-bold">Lưu ý:</strong> Nếu Agent đang chạy rồi mà bạn mở thêm lần nữa, hệ thống sẽ báo đang bận.
              Hãy chạy file <code className="font-mono bg-amber-100 dark:bg-amber-950/50 px-1 rounded">stop-agent.bat</code> để dừng, rồi mới mở lại.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Step 1 for Client Agent */}
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800 space-y-3 relative flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-black text-sm flex items-center justify-center shadow-md shadow-indigo-600/20">
                    1
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                    Tải Gói Đóng Gói Sẵn
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Bấm nút <span className="font-semibold text-indigo-600 dark:text-indigo-400">Tải Client Agent (.zip)</span> ở trên. Gói đã được <strong>đóng gói sẵn Portable Runtime</strong>, bạn <span className="font-bold text-emerald-600 dark:text-emerald-400">hoàn toàn KHÔNG CẦN cài đặt Node.js</span> hay gõ lệnh gì cả!
                  </p>
                </div>
              </div>

              {/* Step 2 for Client Agent (Prioritized) */}
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800 space-y-3 relative flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="w-8 h-8 rounded-xl bg-cyan-600 text-white font-black text-sm flex items-center justify-center shadow-md shadow-cyan-600/20">
                    2
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                    Chạy Ngầm Cùng Windows
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Nhấp đúp <code className="bg-cyan-50 dark:bg-cyan-950/50 text-cyan-600 dark:text-cyan-400 px-1.5 py-0.5 rounded text-xs font-mono font-bold border border-cyan-200 dark:border-cyan-800">setup-agent.bat</code> ➔ phím <span className="font-bold text-cyan-600 dark:text-cyan-400">1</span> (Cho phép UAC nếu được hỏi). Agent chạy ngầm mỗi khi mở máy. Làm bước này <strong>trước</strong> khi nạp Extension.
                  </p>
                </div>
              </div>

              {/* Step 3 for Client Agent */}
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800 space-y-3 relative flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="w-8 h-8 rounded-xl bg-purple-600 text-white font-black text-sm flex items-center justify-center shadow-md shadow-purple-600/20">
                    3
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                    Quét ngay hoặc dừng an toàn
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Muốn lấy số liệu ngay: mở <code className="bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded text-xs font-mono font-bold border border-purple-200 dark:border-purple-800">run-agent.bat</code>.
                    Muốn dừng Agent: mở <code className="bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 rounded text-xs font-mono font-bold border border-rose-200 dark:border-rose-800">stop-agent.bat</code>.
                  </p>
                </div>
              </div>
            </div>

            {/* Screenshots Showcase for Client Agent */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="space-y-2">
                <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black shadow-lg">
                  <div className="bg-slate-950 px-3.5 py-2 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-slate-200">1. Menu thiết lập tự động</span>
                    <span className="text-xs text-cyan-400 font-mono">setup-agent.bat</span>
                  </div>
                  <ZoomableImage
                    src="/images/docs/clientagent/anh-1.png"
                    alt="Menu cài đặt chạy ngầm setup-agent.bat"
                    onZoom={(src, alt) => setZoomImage({ src, alt })}
                  />
                </div>
                <p className="text-xs text-slate-500 text-center italic">
                  Hình 1: Cửa sổ setup-agent.bat thiết lập tự khởi động và cập nhật Token
                </p>
              </div>

              <div className="space-y-2">
                <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black shadow-lg">
                  <div className="bg-slate-950 px-3.5 py-2 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-slate-200">2. Cào quét Studio</span>
                    <span className="text-xs text-emerald-400 font-mono">run-agent.bat</span>
                  </div>
                  <ZoomableImage
                    src="/images/docs/clientagent/anh-4.png"
                    alt="Tiến trình cào quét dữ liệu TikTok Studio của run-agent.bat"
                    onZoom={(src, alt) => setZoomImage({ src, alt })}
                  />
                </div>
                <p className="text-xs text-slate-500 text-center italic">
                  Hình 2: Cửa sổ run-agent.bat quét và đẩy số liệu Studio lên máy chủ
                </p>
              </div>

              <div className="space-y-2">
                <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black shadow-lg">
                  <div className="bg-slate-950 px-3.5 py-2 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-slate-200">3. Dừng tiến trình ngầm</span>
                    <span className="text-xs text-rose-400 font-mono">stop-agent.bat</span>
                  </div>
                  <ZoomableImage
                    src="/images/docs/clientagent/anh-2.png"
                    alt="Giao diện dừng tiến trình stop-agent.bat"
                    onZoom={(src, alt) => setZoomImage({ src, alt })}
                  />
                </div>
                <p className="text-xs text-slate-500 text-center italic">
                  Hình 3: Cửa sổ stop-agent.bat dừng tiến trình ngầm và giải phóng bộ nhớ
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="p-4 rounded-2xl bg-pink-50 dark:bg-pink-500/10 border border-pink-200 dark:border-pink-500/30 text-xs text-pink-900 dark:text-pink-100 leading-relaxed">
              <strong className="font-bold">Thứ tự:</strong> Cài và chạy Client Agent trước (
              <code className="font-mono bg-pink-100 dark:bg-pink-950/50 px-1 rounded">setup-agent.bat</code> phím 1), rồi mới nạp Extension.
              Extension nhận biết tài khoản đang đăng nhập; Agent cập nhật số liệu (lượt xem, doanh thu…).
              <span className="font-bold text-rose-700 dark:text-rose-300"> Tuyệt đối không chia sẻ công khai</span> file ZIP hoặc Personal Token.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Step 1 */}
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800 space-y-3 relative flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="w-8 h-8 rounded-xl bg-pink-500 text-white font-black text-sm flex items-center justify-center shadow-md shadow-pink-500/20">
                    1
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                    Tải Về Trực Tiếp Gói .ZIP
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Bấm nút tải phía trên để lưu file <code className="bg-pink-50 dark:bg-pink-950/50 text-pink-600 dark:text-pink-400 px-1.5 py-0.5 rounded text-xs font-mono font-bold border border-pink-200 dark:border-pink-800">extension.zip</code> về máy. Zip có mã pairing (~24 giờ). Bạn <strong>KHÔNG CẦN</strong> giải nén.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800 space-y-3 relative flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="w-8 h-8 rounded-xl bg-purple-600 text-white font-black text-sm flex items-center justify-center shadow-md shadow-purple-600/20">
                    2
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                    Nạp Vào GPMLogin Extensions
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Mở GPMLogin ➔ Menu <strong>Extensions (Tiện ích)</strong> ➔ <strong>+ Thêm extension</strong> ➔ Chọn dòng <strong>Từ thiết bị (.crx, .zip)</strong> ➔ Chọn file zip vừa tải và gạt sang <strong>On</strong>.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800 space-y-3 relative flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="w-8 h-8 rounded-xl bg-cyan-600 text-white font-black text-sm flex items-center justify-center shadow-md shadow-cyan-600/20">
                    3
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                    Mở TikTok và kiểm tra
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Mở profile GPM và đăng nhập TikTok. Extension tự nhận diện khi Agent đang chạy trên máy.
                    Nếu cần, dán Personal Token từ Cài đặt vào cửa sổ Extension. Số liệu chi tiết do Client Agent cập nhật.
                  </p>
                </div>
              </div>
            </div>

            {/* Screenshots Showcase for Extension */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="space-y-2">
                <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 shadow-lg">
                  <div className="bg-slate-950 px-3 py-1.5 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-slate-200">1. Chọn Thêm từ .zip</span>
                    <span className="text-xs text-pink-400 font-mono">GPMLogin</span>
                  </div>
                  <ZoomableImage
                    src="/images/docs/extensions/anh-1.png"
                    alt="Menu GPMLogin thêm tiện ích từ file zip"
                    onZoom={(src, alt) => setZoomImage({ src, alt })}
                  />
                </div>
                <p className="text-xs text-slate-500 text-center italic">
                  Hình 1: Thêm tiện ích từ thiết bị (.crx, .zip)
                </p>
              </div>

              <div className="space-y-2">
                <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 shadow-lg">
                  <div className="bg-slate-950 px-3 py-1.5 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-slate-200">2. Bật công tắc On</span>
                    <span className="text-xs text-emerald-400 font-mono">Kích hoạt</span>
                  </div>
                  <ZoomableImage
                    src="/images/docs/extensions/anh-2.png"
                    alt="Tiện ích TikTokFlow Companion bật On"
                    onZoom={(src, alt) => setZoomImage({ src, alt })}
                  />
                </div>
                <p className="text-xs text-slate-500 text-center italic">
                  Hình 2: TikTokFlow Companion đã bật On
                </p>
              </div>

              <div className="space-y-2">
                <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 shadow-lg">
                  <div className="bg-slate-950 px-3 py-1.5 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-slate-200">3. Popup Extension</span>
                    <span className="text-xs text-cyan-400 font-mono">Profile</span>
                  </div>
                  <ZoomableImage
                    src="/images/docs/extensions/anh-3.png"
                    alt="Popup Extension trên trình duyệt profile"
                    onZoom={(src, alt) => setZoomImage({ src, alt })}
                  />
                </div>
                <p className="text-xs text-slate-500 text-center italic">
                  Hình 3: Giao diện popup trên trình duyệt
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Permissions & Changelog Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card: Permissions */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>
              {isClientAgent
                ? "Cam Kết An Toàn Tệp Tin & Bảo Mật (Safety Guarantees)"
                : "Quyền Hạn & Bảo Mật (Permissions)"}
            </span>
          </h3>

          {isClientAgent ? (
            <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                <span>
                  <strong className="text-slate-800 dark:text-slate-200">Một Agent trên một máy:</strong> Không mở hai Agent cùng lúc. Muốn chạy lại thì dừng Agent cũ trước (file stop-agent.bat).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5" />
                <span>
                  <strong className="text-slate-800 dark:text-slate-200">An toàn với GPM:</strong> Chỉ đọc dữ liệu cần thiết, không sửa hay xóa thư mục profile GPM của bạn.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0 mt-1.5" />
                <span>
                  <strong className="text-slate-800 dark:text-slate-200">Chạy riêng biệt:</strong> Làm việc trên bản sao tạm, không làm treo trình duyệt GPM đang mở.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0 mt-1.5" />
                <span>
                  <strong className="text-slate-800 dark:text-slate-200">Tự dọn sạch:</strong> Khi dừng, Agent tự xóa file tạm của mình, không đụng file khác trên máy.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0 mt-1.5" />
                <span>
                  <strong className="text-slate-800 dark:text-slate-200">Nhẹ máy:</strong> Chạy êm, tiết kiệm bộ nhớ và mạng; tắt là giải phóng sạch sẽ.
                </span>
              </li>
            </ul>
          ) : (
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-pink-500 shrink-0" />
                <span><strong className="text-slate-800 dark:text-slate-200">Việc của Extension:</strong> Nhận biết tài khoản đang đăng nhập và hỗ trợ gắn / bàn giao tài khoản.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span><strong className="text-slate-800 dark:text-slate-200">Lưu cấu hình:</strong> Nhớ token và địa chỉ máy chủ trên trình duyệt của bạn.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span><strong className="text-slate-800 dark:text-slate-200">Kiểm tra đăng nhập:</strong> Biết tài khoản TikTok còn phiên hay đã thoát.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span><strong className="text-slate-800 dark:text-slate-200">Đồng bộ GPM:</strong> Cập nhật danh sách profile trên máy; cửa sổ Extension cũng cho biết Agent đang chạy hay chưa.</span>
              </li>
            </ul>
          )}
        </div>

        {/* Card: Changelog */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Terminal className="w-4 h-4 text-purple-500" />
            <span>Nhật Ký Phiên Bản (Changelog)</span>
          </h3>
          <div className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-line leading-relaxed font-mono bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 max-h-48 overflow-y-auto">
            {ext.changelog || "Chưa có thông tin nhật ký cho phiên bản này."}
          </div>
        </div>
      </div>

      {/* Lightbox for zooming screenshots */}
      <ImageLightbox
        src={zoomImage?.src || null}
        alt={zoomImage?.alt}
        onClose={() => setZoomImage(null)}
      />
      {confirmDialog}

      <StaffRequestModals
        machineModalOpen={machineModalOpen}
        onMachineModalOpenChange={setMachineModalOpen}
        extensionModalOpen={extensionModalOpen}
        onExtensionModalOpenChange={setExtensionModalOpen}
        boundMachineName={meProfile?.boundMachineName}
        boundMachineId={meProfile?.boundMachineId}
        boundOsUser={meProfile?.boundOsUser}
        onMachineSuccess={() => {
          refetchMachineChange();
          toast.success("Đã gửi yêu cầu đổi máy. Chờ admin duyệt.");
        }}
        onExtensionSuccess={() => {
          refetchExtensionAccess();
          toast.success("Đã gửi yêu cầu kích hoạt Extension. Chờ admin duyệt.");
        }}
      />
    </div>
  );
}
