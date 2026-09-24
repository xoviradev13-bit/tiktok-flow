"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import ThemeToggle from "./ThemeToggle";
import { trpc } from "@/lib/trpc";
import {
  Clock,
  RefreshCw,
  Zap,
  User,
  Settings,
  LogOut,
  ChevronDown,
  ShieldCheck,
  CheckSquare,
  Users,
  Download,
  Menu,
  Bug,
  BookOpen,
  Code2,
  Activity,
  FileText,
  Square,
  KeyRound,
  Monitor,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { parseSyncSummary } from "@/lib/insights-ui";
import { useSidebar } from "@/components/providers/SidebarProvider";
import BugReportModal from "@/components/bug-report/BugReportModal";
import { StaffRequestModals } from "@/components/access-requests/StaffRequestModals";
import { toast } from "sonner";

export default function Header() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { toggleMobile } = useSidebar();
  const [mounted, setMounted] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [isBugModalOpen, setIsBugModalOpen] = useState(false);
  const [machineModalOpen, setMachineModalOpen] = useState(false);
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: meProfile } = trpc.user.me.useQuery(undefined, {
    enabled: !!session?.user?.id,
    staleTime: 60_000,
  });
  const { data: pendingMachineChange } = trpc.user.myMachineChangeRequest.useQuery(undefined, {
    enabled: !!session?.user?.id && !!meProfile?.boundMachineId,
  });
  const { data: pendingExtensionAccess } = trpc.user.myExtensionAccessRequest.useQuery(undefined, {
    enabled: !!session?.user?.id && meProfile?.extensionAccessEnabled === false,
  });

  // Poll sync schedule config for live sync freshness indicator
  const { data: configData, refetch: refetchConfig } = trpc.settings.getAll.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const rawSchedule = (configData as any)?.["sync_schedule"];
  const lastRunDate = rawSchedule?.lastRunAt ? new Date(rawSchedule.lastRunAt) : null;
  const isSyncFresh = Boolean(
    lastRunDate &&
    !isNaN(lastRunDate.getTime()) &&
    new Date().toDateString() === lastRunDate.toDateString()
  );
  const lastSyncTimeStr = lastRunDate && !isNaN(lastRunDate.getTime())
    ? lastRunDate.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : null;

  const rawScoring = (configData as any)?.["scoring_rules"];
  const cutOffHour = typeof rawScoring?.cutOffHour === "number" ? rawScoring.cutOffHour : 22;
  const cutOffMinute = typeof rawScoring?.cutOffMinute === "number" ? rawScoring.cutOffMinute : 0;
  const cutoffTimeStr = `${String(cutOffHour).padStart(2, "0")}:${String(cutOffMinute).padStart(2, "0")}`;

  const [timeInfo, setTimeInfo] = useState({
    time: "--:--:--",
    remaining: "--:--:--",
    remainingNext: "--:--:--",
    isPast: false,
  });

  const pageTitles: Record<string, { title: string; subtitle: string }> = {
    "/": {
      title: "Bảng Điều Khiển Tổng Quan",
      subtitle: "Giám sát tiến độ dàn tài khoản, chấm công & doanh thu tự động",
    },
    "/accounts": {
      title: "Quản Lý Dàn Tài Khoản",
      subtitle: "Danh sách tài khoản TikTok, trạng thái GPM, phân công nhân sự",
    },
    "/checklist": {
      title: "Checklist Chấm Công Hàng Ngày",
      subtitle: `Hệ thống tự động chấm công tại mốc ${cutoffTimeStr} theo KPI hoàn thành`,
    },
    "/revenue": {
      title: "Báo Cáo & Phân Tích Doanh Thu",
      subtitle: "Creator Rewards, RPM, biến động dòng tiền theo tài khoản & nhân sự",
    },
    "/revenue/details": {
      title: "Chi Tiết Doanh Thu Từng Account",
      subtitle: "Tra cứu bản ghi doanh thu hàng ngày, xuất nhập Excel & bộ lọc nâng cao",
    },
    "/users": {
      title: "Quản Lý Nhân Sự & Phân Quyền",
      subtitle: "Danh sách thành viên, phân quyền Admin/Lead/Staff và tài khoản phụ trách",
    },
    "/leaderboard": {
      title: "Bảng Xếp Hạng Hiệu Suất",
      subtitle: "Vinh danh nhân sự xuất sắc, thống kê ngày công & doanh thu",
    },
    "/gpm": {
      title: "GPMLogin Fleet & Automation Hub",
      subtitle: "Quản trị dàn profile GPMLogin, kiểm kê tự động & điều khiển trình duyệt ngầm",
    },
    "/settings": {
      title: "Cài Đặt & Cá Nhân Hóa",
      subtitle: "Hồ sơ cá nhân, bảo mật tài khoản, token tích hợp & cấu hình hệ thống",
    },
  };

  const currentInfo = pageTitles[pathname] || {
    title: "TikTok Operations Suite",
    subtitle: "Quản trị dàn tài khoản & tự động hóa",
  };

  useEffect(() => {
    setMounted(true);
    const updateTime = () => {
      const now = new Date();
      const vnString = now.toLocaleString("en-US", {
        timeZone: "Asia/Ho_Chi_Minh",
      });
      const vnDate = new Date(vnString);

      const cutoff = new Date(vnDate);
      cutoff.setHours(cutOffHour, cutOffMinute, 0, 0);

      const isPast = vnDate.getTime() >= cutoff.getTime();
      let remaining = "00:00:00";
      let remainingNext = "00:00:00";

      if (!isPast) {
        const diffMs = cutoff.getTime() - vnDate.getTime();
        const h = Math.floor(diffMs / (1000 * 60 * 60));
        const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diffMs % (1000 * 60)) / 1000);
        remaining = `${String(h).padStart(2, "0")}:${String(m).padStart(
          2,
          "0"
        )}:${String(s).padStart(2, "0")}`;
      } else {
        const cutoffTomorrow = new Date(cutoff);
        cutoffTomorrow.setDate(cutoffTomorrow.getDate() + 1);
        const diffNextMs = Math.max(0, cutoffTomorrow.getTime() - vnDate.getTime());
        const nh = Math.floor(diffNextMs / (1000 * 60 * 60));
        const nm = Math.floor((diffNextMs % (1000 * 60 * 60)) / (1000 * 60));
        const ns = Math.floor((diffNextMs % (1000 * 60)) / 1000);
        remainingNext = `${String(nh).padStart(2, "0")}:${String(nm).padStart(
          2,
          "0"
        )}:${String(ns).padStart(2, "0")}`;
      }

      setTimeInfo({
        time: vnDate.toLocaleTimeString("vi-VN", { hour12: false }),
        remaining,
        remainingNext,
        isPast,
      });
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [cutOffHour, cutOffMinute]);

  // Close user dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close dropdown on route change
  useEffect(() => {
    setUserDropdownOpen(false);
  }, [pathname]);

  // Sync Queue status tracking & live polling
  const prevSyncingRef = useRef(false);

  const checkSyncStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/gpm/sync");
      if (res.ok) {
        const data = await res.json();
        const isRunning = Boolean(data.isSyncing);
        setActiveJobId(data.activeJob?.id || null);
        const hint = data.agentHint as
          | { ready?: boolean; code?: string; message?: string | null }
          | null
          | undefined;

        if (isRunning) {
          setSyncing(true);
          if (data.activeJob?.status === "PROCESSING") {
            setSyncMessage(`⏳ Agent (${data.activeJob.machineName || "máy trạm"}) đang quét GPMLogin...`);
          } else if (hint && hint.ready === false && hint.message) {
            // PENDING but agent cannot claim — surface binding / offline early
            setSyncMessage(`⚠️ ${hint.message}`);
          } else {
            setSyncMessage("⏳ Đang chờ Client Agent nhận lệnh...");
          }
        } else if (prevSyncingRef.current && !isRunning) {
          // Sync finished
          setSyncing(false);
          setActiveJobId(null);
          const finished = data.lastFinishedJob;
          if (finished?.status === "CANCELLED") {
            // User explicitly stopped — don't overwrite the stop message if already set
            setSyncMessage((prev) => prev?.startsWith("🛑") ? prev : "🛑 Đã dừng đồng bộ thành công.");
            setTimeout(() => setSyncMessage(null), 4000);
          } else if (finished?.status === "TIMED_OUT" || finished?.status === "FAILED") {
            const tip =
              hint && hint.ready === false && hint.message
                ? ` — ${hint.message}`
                : "";
            setSyncMessage(
              `❌ ${finished.errorMessage || "Đồng bộ không thành công"}${tip}`
            );
            setTimeout(() => setSyncMessage(null), 12000);
          } else if (finished?.status === "COMPLETED" || data.lastCompletedJob) {
            const rawSummary =
              finished?.resultSummary ||
              data.lastCompletedJob?.resultSummary ||
              null;
            const s = parseSyncSummary(rawSummary);
            let msg: string;
            let dismissMs = 6000;
            if (s) {
              const handles = (arr: any[]) =>
                (Array.isArray(arr) ? arr : [])
                  .slice(0, 3)
                  .map((a) => `@${a.username}`)
                  .join(", ");
              const dbv = s.dbVerify;
              const missingAnalytics = Number(dbv?.missingAnalytics || 0);
              const staleAnalytics = Number(dbv?.staleAnalytics || 0);
              const partial =
                Number(s.relogin_needed || 0) +
                Number(s.incomplete_insights || 0) +
                Number(s.incomplete_rewards || 0) >
                0;
              if (missingAnalytics > 0) {
                const miss = (Array.isArray(dbv.missingUsernames) ? dbv.missingUsernames : [])
                  .slice(0, 3)
                  .map((u: string) => `@${u}`)
                  .join(", ");
                msg = `⚠️ Agent xong nhưng DB thiếu AccountAnalytics cho ${missingAnalytics} account${miss ? ` (${miss})` : ""} — xem tmp/sync-flow-debug.jsonl`;
                dismissMs = 14000;
              } else if (staleAnalytics > 0) {
                msg = `⚠️ Đồng bộ xong — ${staleAnalytics} account analytics chưa được làm mới trong job này`;
                dismissMs = 12000;
              } else if (Number(s.relogin_needed || 0) > 0) {
                msg = `⚠️ ${s.relogin_needed} account cần đăng nhập lại TikTok / qua captcha (${handles(s.reloginNeeded)})`;
                dismissMs = 10000;
              } else if (Number(s.incomplete_insights || 0) > 0) {
                msg = `⚠️ Đồng bộ xong — ${s.incomplete_insights} account chưa lấy được Insights (thử lại ở lần sync sau): ${handles(s.incompleteInsights)}`;
                dismissMs = 10000;
              } else if (Number(s.failed || 0) > 0) {
                msg = `⚠️ Đồng bộ xong với lỗi (${s.failed} thất bại)`;
                dismissMs = 8000;
              } else if (partial) {
                msg = `⚠️ Đồng bộ xong — một số account thiếu Rewards (lần sync sau sẽ thử lại)`;
                dismissMs = 8000;
              } else {
                const verified = dbv
                  ? ` · DB ${dbv.withAnalytics}/${dbv.accountsInScope} analytics`
                  : "";
                msg = `✅ Đồng bộ hoàn tất! (${s.ok ?? s.processedCount ?? "ok"} account${verified})`;
              }
            } else {
              const summary = rawSummary || "Dữ liệu đã cập nhật";
              msg = `✅ Đồng bộ hoàn tất! (${summary})`;
            }
            setSyncMessage(msg);
            window.dispatchEvent(new Event("refreshData"));
            refetchConfig();
            setTimeout(() => setSyncMessage(null), dismissMs);
          } else {
            setSyncMessage("✅ Đồng bộ hoàn tất!");
            window.dispatchEvent(new Event("refreshData"));
            refetchConfig();
            setTimeout(() => setSyncMessage(null), 6000);
          }
        }
        prevSyncingRef.current = isRunning;
      }
    } catch {
      /* ignore transient network issues */
    }
  }, [refetchConfig]);

  useEffect(() => {
    checkSyncStatus();
    const interval = setInterval(() => {
      checkSyncStatus();
    }, syncing ? 2500 : 12000);
    return () => clearInterval(interval);
  }, [checkSyncStatus, syncing]);

  const handleGlobalSync = async () => {
    if (syncing) return; // Prevent spamming while sync is already active

    try {
      setSyncing(true);
      setSyncMessage("Đang đưa lệnh vào hàng đợi đồng bộ...");

      // Enqueue job on server via POST /api/gpm/sync
      const res = await fetch("/api/gpm/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncAll: true }),
      });
      const json = await res.json();
      if (json.success) {
        if (json.jobId) setActiveJobId(json.jobId);
        // Machine binding / agent offline — tell the user immediately
        if (json.agentBlocked && json.warning) {
          setSyncMessage(`⚠️ ${json.warning}`);
        } else if (json.warning) {
          setSyncMessage(`⏳ ${json.message} — ${json.warning}`);
        } else {
          setSyncMessage(`⏳ ${json.message}`);
        }
        // Button stays disabled; checkSyncStatus polling will automatically detect completion!
      } else {
        if (json.inProgress) {
          if (json.agentHint?.message && json.agentHint?.ready === false) {
            setSyncMessage(`⚠️ ${json.agentHint.message}`);
          } else {
            setSyncMessage(`⏳ ${json.message}`);
          }
        } else {
          setSyncMessage(`❌ ${json.error || json.message || "Lỗi đồng bộ"}`);
          setSyncing(false);
          setTimeout(() => setSyncMessage(null), 5000);
        }
      }
    } catch (err: any) {
      setSyncMessage(`❌ ${err.message}`);
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const handleStopSync = async () => {
    try {
      setSyncMessage("Đang gửi lệnh dừng đồng bộ...");
      // NOTE: intentionally omit jobId — syncAll creates N jobs (one per user scope),
      // sending a specific jobId would only cancel one. Without jobId the server
      // runs updateMany and cancels ALL PENDING/PROCESSING jobs for this requester.
      const res = await fetch("/api/gpm/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      const json = await res.json();
      if (json.success) {
        setSyncMessage("🛑 Đã gửi lệnh dừng đồng bộ.");
        setSyncing(false);
        prevSyncingRef.current = false; // prevent next poll from re-entering the "finished" branch
        setActiveJobId(null);
        setTimeout(() => setSyncMessage(null), 4000);
      } else {
        setSyncMessage(`❌ ${json.message || "Không thể dừng đồng bộ"}`);
        setTimeout(() => setSyncMessage(null), 4000);
      }
    } catch (err: any) {
      setSyncMessage(`❌ Lỗi: ${err.message}`);
      setTimeout(() => setSyncMessage(null), 4000);
    }
  };

  const userEmail = session?.user?.email || "";
  const userName =
    session?.user?.name ||
    (userEmail ? userEmail.split("@")[0] : "Admin");
  const rawRole = (session?.user as any)?.role || (session?.user as any)?.userType || "ADMIN";
  const userRole = String(rawRole).toUpperCase();
  const userInitials =
    userName
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "AD";

  const getRoleLabel = (role: string) => {
    if (role === "ADMIN") return "Quản Trị Viên (Admin)";
    if (role === "LEAD") return "Trưởng Nhóm (Lead)";
    return "Nhân Viên (Staff)";
  };

  const handleLogout = () => {
    signOut({ callbackUrl: "/signin" });
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors shadow-xs">
        <div className="max-w-[1850px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Page Title & Breadcrumb + Mobile Menu Toggle */}
            <div className="min-w-0 flex-1 flex items-center gap-2 sm:gap-3">
              <button
                onClick={toggleMobile}
                className="lg:hidden p-2 -ml-1 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80 transition-colors cursor-pointer shrink-0"
                aria-label="Mở menu điều hướng"
              >
                <Menu className="w-4 h-4" />
              </button>

              <div className="min-w-0 flex-1">
                <h1 className="text-sm sm:text-base lg:text-lg font-black text-slate-900 dark:text-white truncate">
                  {currentInfo.title}
                </h1>
                <p className="hidden md:block text-xs text-slate-500 dark:text-slate-400 truncate">
                  {currentInfo.subtitle}
                </p>
              </div>
            </div>

            {/* Right Action Widgets */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              {/* Live Vietnam Clock & 10:00 Cutoff */}
              <div
                suppressHydrationWarning
                className="hidden xl:flex items-center h-9 gap-2.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 rounded-xl text-xs font-mono shadow-sm"
              >
                <Clock className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 animate-pulse" />
                <div suppressHydrationWarning className="text-slate-700 dark:text-slate-300">
                  <span className="text-slate-500 dark:text-slate-400 text-xs block leading-none">
                    Giờ VN:
                  </span>
                  <span className="font-bold">{mounted ? timeInfo.time : "--:--:--"}</span>
                </div>
                <div className="h-4 w-px bg-slate-300 dark:bg-slate-800 mx-1" />
                <div suppressHydrationWarning>
                  <span className="text-slate-500 dark:text-slate-400 text-xs block leading-none">
                    Chốt {cutoffTimeStr}:
                  </span>
                  <span
                    className={`font-bold font-mono ${timeInfo.isPast
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    title={timeInfo.isPast ? `Đã chốt hôm nay (${cutoffTimeStr}). Đếm ngược tới mốc chốt ${cutoffTimeStr} ngày mai: ${timeInfo.remainingNext}` : `Còn ${timeInfo.remaining} đến mốc chốt công (${cutoffTimeStr})`}
                  >
                    {mounted ? (timeInfo.isPast ? `Đã chốt • Mai: ${timeInfo.remainingNext}` : `Còn: ${timeInfo.remaining}`) : "--:--:--"}
                  </span>
                </div>
              </div>

              {/* Theme Toggle Button */}
              <ThemeToggle />

              {/* Quick Bug Report Button with Tooltip */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setIsBugModalOpen(true)}
                    className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-pink-600 dark:hover:text-pink-400 transition-all active:scale-95 shadow-xs cursor-pointer focus:outline-none"
                    aria-label="Báo cáo sự cố"
                  >
                    <Bug className="w-4 h-4 text-pink-500" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs font-medium">
                  Báo cáo sự cố kỹ thuật
                </TooltipContent>
              </Tooltip>

              {/* Minimalist 1-Click Sync Button & Stop Button */}
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleGlobalSync}
                      disabled={syncing}
                      className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition-all active:scale-95 shadow-xs cursor-pointer disabled:opacity-60 focus:outline-none"
                      aria-label="Đồng bộ GPM"
                    >
                      <RefreshCw
                        className={`w-4 h-4 ${syncing
                          ? "animate-spin text-pink-500"
                          : isSyncFresh
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-amber-500"
                          }`}
                      />
                      {/* Status indicator dot */}
                      <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                        {isSyncFresh && !syncing && (
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                        )}
                        <span
                          className={`relative inline-flex rounded-full h-2 w-2 ${syncing ? "bg-slate-400" : isSyncFresh ? "bg-emerald-500" : "bg-amber-500"
                            }`}
                        />
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-xs text-center font-medium">
                    {syncing
                      ? "Đang đồng bộ dữ liệu GPM..."
                      : lastRunDate
                        ? `Đồng bộ lần cuối: ${lastRunDate.toLocaleString("vi-VN")} (${isSyncFresh ? "Hôm nay" : "Cần sync"}) • Nhấn để đồng bộ ngay.`
                        : "Chưa đồng bộ • Nhấn để đồng bộ toàn bộ tài khoản GPMLogin"}
                  </TooltipContent>
                </Tooltip>

                {syncing && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleStopSync}
                        className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 transition-all active:scale-95 shadow-xs cursor-pointer focus:outline-none animate-pulse"
                        aria-label="Dừng đồng bộ"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs font-medium text-rose-600 dark:text-rose-400">
                      Dừng tiến trình đồng bộ ngay lập tức
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>

              {/* User Avatar & Dropdown Menu */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-1.5 p-0.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-all cursor-pointer"
                  aria-label="User account menu"
                  aria-expanded={userDropdownOpen}
                >
                  <div className="relative">
                    {session?.user?.image ? (
                      <img
                        src={session.user.image}
                        alt={userName}
                        className="w-9 h-9 rounded-full object-cover border border-slate-300 dark:border-slate-700 shadow-sm"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-[#18181b] dark:bg-[#18181b] flex items-center justify-center font-black text-white text-xs shadow-md border border-slate-700/60">
                        <span
                          style={{
                            textShadow:
                              "1px 0px 0px rgba(0, 242, 234, 0.9), -1px 0px 0px rgba(254, 44, 85, 0.9)",
                          }}
                        >
                          {userInitials}
                        </span>
                      </div>
                    )}
                    {/* Green online badge indicator */}
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900 shadow-xs" />
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 hidden sm:block mr-0.5" />
                </button>

                {/* Dropdown Card */}
                {userDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl py-2 z-50 animate-in fade-in-0 zoom-in-95">
                    {/* User Profile Header */}
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          {session?.user?.image ? (
                            <img
                              src={session.user.image}
                              alt={userName}
                              className="w-10 h-10 rounded-full object-cover border border-slate-300 dark:border-slate-700 shadow-md ring-2 ring-pink-500/20"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-[#18181b] flex items-center justify-center font-black text-white text-sm shadow-md border border-slate-700/60">
                              <span
                                style={{
                                  textShadow:
                                    "1px 0px 0px rgba(0, 242, 234, 0.9), -1px 0px 0px rgba(254, 44, 85, 0.9)",
                                }}
                              >
                                {userInitials}
                              </span>
                            </div>
                          )}
                          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                            {userName}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {userEmail}
                          </div>
                          <div className="mt-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400 border border-pink-200 dark:border-pink-800/40">
                              <ShieldCheck className="w-3 h-3" />
                              {getRoleLabel(userRole)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Navigation Links */}
                    <div className="py-1.5 px-2 text-xs space-y-0.5">
                      <Link
                        href="/settings"
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-normal transition-colors"
                      >
                        <Settings className="w-4 h-4 text-slate-500" />
                        <span>Cài Đặt & Cấu Hình</span>
                      </Link>

                      {meProfile?.boundMachineId && !pendingMachineChange && (
                        <button
                          type="button"
                          onClick={() => {
                            setUserDropdownOpen(false);
                            setMachineModalOpen(true);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-normal transition-colors cursor-pointer text-left"
                        >
                          <Monitor className="w-4 h-4 text-cyan-500" />
                          <span>Yêu cầu đổi máy</span>
                        </button>
                      )}
                      {meProfile?.boundMachineId && pendingMachineChange && (
                        <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-amber-700 dark:text-amber-300 text-xs font-medium">
                          <Monitor className="w-4 h-4" />
                          <span>Đang chờ duyệt đổi máy</span>
                        </div>
                      )}

                      {meProfile?.extensionAccessEnabled === false && !pendingExtensionAccess && (
                        <button
                          type="button"
                          onClick={() => {
                            setUserDropdownOpen(false);
                            setExtensionModalOpen(true);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-normal transition-colors cursor-pointer text-left"
                        >
                          <KeyRound className="w-4 h-4 text-rose-500" />
                          <span>Yêu cầu kích hoạt Extension</span>
                        </button>
                      )}
                      {meProfile?.extensionAccessEnabled === false && pendingExtensionAccess && (
                        <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-amber-700 dark:text-amber-300 text-xs font-medium">
                          <KeyRound className="w-4 h-4" />
                          <span>Đang chờ kích hoạt Extension</span>
                        </div>
                      )}

                      <Link
                        href="/logs"
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-normal transition-colors"
                      >
                        <Activity className="w-4 h-4 text-slate-500" />
                        <span>Nhật Ký & Hoạt Động</span>
                      </Link>
                      <Link
                        href="/docs"
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-normal transition-colors"
                      >
                        <BookOpen className="w-4 h-4 text-slate-500" />
                        <span>Hướng Dẫn (Docs)</span>
                      </Link>
                      <Link
                        href="/api-docs"
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-normal transition-colors"
                      >
                        <Code2 className="w-4 h-4 text-slate-500" />
                        <span>API Reference</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          setUserDropdownOpen(false);
                          setIsBugModalOpen(true);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-normal transition-colors cursor-pointer text-left"
                      >
                        <Bug className="w-4 h-4 text-slate-500" />
                        <span>Báo Cáo Sự Cố Kỹ Thuật</span>
                      </button>
                      <Link
                        href="/accounts"
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-normal transition-colors"
                      >
                        <Users className="w-4 h-4 text-slate-500" />
                        <span>Quản Lý Dàn Account</span>
                      </Link>
                      <Link
                        href="/checklist"
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-normal transition-colors"
                      >
                        <CheckSquare className="w-4 h-4 text-slate-500" />
                        <span>Checklist Chấm Công</span>
                      </Link>

                      <Link
                        href="/extensions"
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-normal transition-colors"
                      >
                        <Download className="w-4 h-4 text-slate-500" />
                        <span>Trung Tâm Tiện Ích (Extensions)</span>
                      </Link>
                    </div>

                    {/* Divider & Logout */}
                    <div className="border-t border-slate-100 dark:border-slate-800 pt-1.5 px-2">
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-normal text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-4 h-4 text-rose-500" />
                        <span>Đăng Xuất (Logout)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Global Sync Notification Banner - spans 100% full screen width */}
        {syncMessage && (
          <div className="w-full py-1.5 px-4 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 text-xs text-pink-600 dark:text-cyan-300 text-center flex items-center justify-center gap-3 animate-fadeIn">
            <span>{syncMessage}</span>
            {syncing && (
              <button
                onClick={handleStopSync}
                className="px-2 py-0.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] flex items-center gap-1 shadow-xs transition-all active:scale-95 cursor-pointer"
              >
                <Square className="w-2.5 h-2.5 fill-current" />
                Dừng đồng bộ
              </button>
            )}
          </div>
        )}
      </header>

      {/* Header Bug Report Modal */}
      <BugReportModal
        isOpen={isBugModalOpen}
        onClose={() => setIsBugModalOpen(false)}
      />

      <StaffRequestModals
        machineModalOpen={machineModalOpen}
        onMachineModalOpenChange={setMachineModalOpen}
        extensionModalOpen={extensionModalOpen}
        onExtensionModalOpenChange={setExtensionModalOpen}
        boundMachineName={meProfile?.boundMachineName}
        boundMachineId={meProfile?.boundMachineId}
        boundOsUser={meProfile?.boundOsUser}
        onMachineSuccess={() => toast.success("Đã gửi yêu cầu đổi máy. Chờ admin duyệt.")}
        onExtensionSuccess={() =>
          toast.success("Đã gửi yêu cầu kích hoạt Extension. Chờ admin duyệt.")
        }
      />
    </>
  );
}
