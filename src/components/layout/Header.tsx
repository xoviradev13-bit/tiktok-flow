"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import ThemeToggle from "./ThemeToggle";
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
} from "lucide-react";

export default function Header() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [timeInfo, setTimeInfo] = useState({
    time: "--:--:--",
    remaining: "--:--:--",
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
      subtitle: "Hệ thống tự động chấm công trước 10:00 sáng theo KPI hoàn thành",
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
      title: "GPM-Login Automation Hub",
      subtitle: "Quản lý profile, khởi chạy trình duyệt & trích xuất số liệu tự động",
    },
    "/settings": {
      title: "Cấu Hình Hệ Thống",
      subtitle: "Thiết lập API GPMLogin, quy tắc tính công 10:00 AM & phân quyền",
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
      cutoff.setHours(10, 0, 0, 0);

      const isPast = vnDate.getTime() >= cutoff.getTime();
      let remaining = "00:00:00";

      if (!isPast) {
        const diffMs = cutoff.getTime() - vnDate.getTime();
        const h = Math.floor(diffMs / (1000 * 60 * 60));
        const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diffMs % (1000 * 60)) / 1000);
        remaining = `${String(h).padStart(2, "0")}:${String(m).padStart(
          2,
          "0"
        )}:${String(s).padStart(2, "0")}`;
      }

      setTimeInfo({
        time: vnDate.toLocaleTimeString("vi-VN", { hour12: false }),
        remaining,
        isPast,
      });
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

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

  const handleGlobalSync = async () => {
    try {
      setSyncing(true);
      setSyncMessage("Đang quét & đồng bộ toàn bộ tài khoản...");
      const res = await fetch("/api/gpm/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncAll: true }),
      });
      const json = await res.json();
      if (json.success) {
        setSyncMessage(`✅ ${json.message}`);
        window.dispatchEvent(new Event("refreshData"));
      } else {
        setSyncMessage(`❌ ${json.error || "Lỗi đồng bộ"}`);
      }
    } catch (err: any) {
      setSyncMessage(`❌ ${err.message}`);
    } finally {
      setSyncing(false);
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
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors shadow-xs">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Page Title & Breadcrumb */}
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
              {currentInfo.title}
            </h1>
            <p className="hidden md:block text-xs text-slate-500 dark:text-slate-400 truncate">
              {currentInfo.subtitle}
            </p>
          </div>

          {/* Right Action Widgets */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Live Vietnam Clock & 10:00 Cutoff */}
            <div
              suppressHydrationWarning
              className="hidden sm:flex items-center gap-2.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-xl text-xs font-mono shadow-sm"
            >
              <Clock className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 animate-pulse" />
              <div suppressHydrationWarning className="text-slate-700 dark:text-slate-300">
                <span className="text-slate-500 dark:text-slate-400 text-[10px] block leading-none">
                  Giờ VN:
                </span>
                <span className="font-bold">{mounted ? timeInfo.time : "--:--:--"}</span>
              </div>
              <div className="h-4 w-px bg-slate-300 dark:bg-slate-800 mx-1" />
              <div suppressHydrationWarning>
                <span className="text-slate-500 dark:text-slate-400 text-[10px] block leading-none">
                  Chốt 10:00:
                </span>
                <span
                  className={`font-bold ${timeInfo.isPast
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-emerald-600 dark:text-emerald-400"
                    }`}
                >
                  {mounted ? (timeInfo.isPast ? "Đã chốt" : timeInfo.remaining) : "--:--:--"}
                </span>
              </div>
            </div>

            {/* Theme Toggle Button */}
            <ThemeToggle />

            {/* Quick Sync Button */}
            <button
              onClick={handleGlobalSync}
              disabled={syncing}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-md shadow-pink-600/20 active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              <span className="hidden md:inline">
                {syncing ? "Đang Sync..." : "⚡ Sync GPM"}
              </span>
            </button>

            {/* User Avatar & Dropdown Menu */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 transition-all cursor-pointer"
                aria-label="User account menu"
                aria-expanded={userDropdownOpen}
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center font-bold text-white text-xs shadow-sm">
                  {userInitials}
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 hidden sm:block mr-1" />
              </button>

              {/* Dropdown Card */}
              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl py-2 z-50 animate-in fade-in-0 zoom-in-95">
                  {/* User Profile Header */}
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center font-bold text-white text-sm shadow-md shrink-0">
                        {userInitials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                          {userName}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {userEmail}
                        </div>
                        <div className="mt-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400 border border-pink-200 dark:border-pink-800/40">
                            <ShieldCheck className="w-3 h-3" />
                            {getRoleLabel(userRole)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Navigation Links */}
                  <div className="py-1.5 px-2 text-xs">
                    <Link
                      href="/settings"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium transition-colors"
                    >
                      <Settings className="w-4 h-4 text-slate-500" />
                      <span>Cài Đặt & Cấu Hình</span>
                    </Link>
                    <Link
                      href="/accounts"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium transition-colors"
                    >
                      <Users className="w-4 h-4 text-slate-500" />
                      <span>Quản Lý Dàn Account</span>
                    </Link>
                    <Link
                      href="/checklist"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium transition-colors"
                    >
                      <CheckSquare className="w-4 h-4 text-slate-500" />
                      <span>Checklist Chấm Công</span>
                    </Link>
                  </div>

                  {/* Divider & Logout */}
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-1.5 px-2">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
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

        {/* Global Sync Notification Banner */}
        {syncMessage && (
          <div className="py-1.5 px-4 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 text-xs text-pink-600 dark:text-cyan-300 text-center flex items-center justify-center gap-2 animate-fadeIn">
            <span>{syncMessage}</span>
          </div>
        )}
      </div>
    </header>
  );
}
