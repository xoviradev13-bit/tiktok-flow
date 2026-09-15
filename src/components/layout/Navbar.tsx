"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Users,
  Layers,
  CheckSquare,
  BarChart3,
  Trophy,
  Bot,
  Settings,
  RefreshCw,
  Clock,
  Zap,
} from "lucide-react";

export default function Navbar() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [timeInfo, setTimeInfo] = useState({
    time: "--:--:--",
    remaining: "--:--:--",
    isPast: false,
  });

  // Clock & Countdown timer to 10:00 AM VN
  useEffect(() => {
    setMounted(true);
    const updateTime = () => {
      const now = new Date();
      // Format current VN Time (UTC+7)
      const vnTimeStr = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(now);

      // Target is today's 10:00:00 AM VN Time
      // Calculate diff
      const vnNow = new Date(
        now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
      );
      const target = new Date(vnNow);
      target.setHours(10, 0, 0, 0);

      let diff = target.getTime() - vnNow.getTime();
      let isPast = false;
      if (diff < 0) {
        isPast = true;
        // Target next day 10 AM
        target.setDate(target.getDate() + 1);
        diff = target.getTime() - vnNow.getTime();
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);

      const remStr = `${hours.toString().padStart(2, "0")}:${mins
        .toString()
        .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;

      setTimeInfo({
        time: vnTimeStr,
        remaining: remStr,
        isPast,
      });
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleGlobalSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncMessage("Đang đưa lệnh vào hàng đợi đồng bộ...");
    try {
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
        setSyncMessage(json.inProgress ? `⏳ ${json.message}` : `❌ ${json.error || json.message || "Lỗi đồng bộ"}`);
      }
    } catch (err: any) {
      setSyncMessage(`❌ ${err.message}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 4000);
    }
  };

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/accounts", label: "Dàn Account", icon: Users },
    { href: "/checklist", label: "Checklist Chấm Công", icon: CheckSquare },
    { href: "/revenue", label: "Doanh Thu", icon: BarChart3 },
    { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
    { href: "/users", label: "Nhân Sự", icon: Users },
    { href: "/groups", label: "Nhóm & Teams", icon: Layers },
    { href: "/gpm", label: "GPM-Login Hub", icon: Bot },
    { href: "/settings", label: "Cấu Hình", icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 shadow-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-pink-500 to-rose-500 p-0.5 shadow-lg shadow-pink-500/20 group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Zap className="w-5 h-5 text-pink-400 fill-pink-400" />
              </div>
            </div>
            <div>
              <div className="font-black text-base tracking-tight bg-gradient-to-r from-white via-slate-200 to-pink-300 bg-clip-text text-transparent">
                TIKTOK<span className="text-pink-500 font-extrabold">FLOW</span>
              </div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Ops & Automation
              </div>
            </div>
          </Link>

          {/* Navigation links */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800/80">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-md shadow-pink-600/30"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right Action Widgets */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Vietnam Time & Cut-off Countdown Chip */}
            <div
              suppressHydrationWarning
              className="hidden lg:flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-1 rounded-lg text-xs font-mono"
            >
              <Clock className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <div suppressHydrationWarning className="text-slate-300">
                <span className="text-slate-500 text-xs block leading-none">Giờ VN:</span>
                <span className="font-bold">{mounted ? timeInfo.time : "--:--:--"}</span>
              </div>
              <div className="h-4 w-px bg-slate-800 mx-1" />
              <div suppressHydrationWarning>
                <span className="text-slate-500 text-xs block leading-none">Chốt 10:00:</span>
                <span
                  className={`font-bold ${
                    timeInfo.isPast ? "text-amber-400" : "text-emerald-400"
                  }`}
                >
                  {mounted ? (timeInfo.isPast ? `Đã chốt • Mai: ${timeInfo.remaining}` : timeInfo.remaining) : "--:--:--"}
                </span>
              </div>
            </div>

            {/* Quick 1-Click Sync Button */}
            <button
              onClick={handleGlobalSync}
              disabled={syncing}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20 active:scale-95 transition-all disabled:opacity-60"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">
                {syncing ? "Đang Sync..." : "⚡ Sync Tất Cả"}
              </span>
            </button>
          </div>
        </div>

        {/* Global Sync Notification Banner */}
        {syncMessage && (
          <div className="py-1.5 px-4 bg-slate-800/90 border-t border-slate-700/60 text-xs text-cyan-300 text-center flex items-center justify-center gap-2 animate-fadeIn">
            <span>{syncMessage}</span>
          </div>
        )}

        {/* Mobile Navigation Bar */}
        <div className="md:hidden flex items-center justify-between overflow-x-auto py-2 border-t border-slate-800/80 gap-1 scrollbar-none">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium shrink-0 ${
                  isActive
                    ? "bg-pink-600 text-white"
                    : "text-slate-400 hover:bg-slate-800"
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
