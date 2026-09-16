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
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSidebar } from "@/components/providers/SidebarProvider";
import BugReportModal from "@/components/bug-report/BugReportModal";

export default function Header() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { toggleMobile } = useSidebar();
  const [mounted, setMounted] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [isBugModalOpen, setIsBugModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
  const cutOffHour = typeof rawScoring?.cutOffHour === "number" ? rawScoring.cutOffHour : 10;
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
      subtitle: `Hệ thống tự động chấm công trước ${cutoffTimeStr} sáng theo KPI hoàn thành`,
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

        if (isRunning) {
          setSyncing(true);
          if (data.activeJob?.status === "PROCESSING") {
            setSyncMessage(`⏳ Agent (${data.activeJob.machineName || "máy trạm"}) đang quét GPMLogin...`);
          } else {
            setSyncMessage("⏳ Đang chờ Client Agent nhận lệnh...");
          }
        } else if (prevSyncingRef.current && !isRunning) {
          // Sync just completed!
          setSyncing(false);
          if (data.lastCompletedJob) {
            setSyncMessage(`✅ Đồng bộ hoàn tất! (${data.lastCompletedJob.resultSummary || "Dữ liệu đã cập nhật"})`);
          } else {
            setSyncMessage("✅ Đồng bộ hoàn tất!");
          }
          window.dispatchEvent(new Event("refreshData"));
          refetchConfig();
          setTimeout(() => setSyncMessage(null), 6000);
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

      // 1. Try to trigger local Client Agent on this machine directly (port 39741)
      let localAgentTriggered = false;
      try {
        const localRes = await fetch("http://127.0.0.1:39741/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(1200),
        });
        if (localRes.ok) {
          localAgentTriggered = true;
          setSyncMessage("✅ Đã kích hoạt Client Agent trên máy của bạn đang quét GPMLogin...");
        }
      } catch {
        /* local agent port not responding or blocked by CORS */
      }

      // 2. Enqueue job on server via POST /api/gpm/sync
      const res = await fetch("/api/gpm/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncAll: true }),
      });
      const json = await res.json();
      if (json.success) {
        if (!localAgentTriggered) {
          setSyncMessage(`⏳ ${json.message}`);
        }
        // Button stays disabled; checkSyncStatus polling will automatically detect completion!
      } else {
        if (json.inProgress) {
          setSyncMessage(`⏳ ${json.message}`);
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
                className="hidden xl:flex items-center gap-2.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-xl text-xs font-mono shadow-sm"
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

              {/* Minimalist 1-Click Sync Button with Tooltip (matching ThemeToggle size) */}
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
          <div className="w-full py-1.5 px-4 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 text-xs text-pink-600 dark:text-cyan-300 text-center flex items-center justify-center gap-2 animate-fadeIn">
            <span>{syncMessage}</span>
          </div>
        )}
      </header>

      {/* Header Bug Report Modal */}
      <BugReportModal
        isOpen={isBugModalOpen}
        onClose={() => setIsBugModalOpen(false)}
      />
    </>
  );
}
