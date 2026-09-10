"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  BarChart3,
  Trophy,
  Bot,
  Settings,
  Zap,
  X,
  ShieldCheck,
  UserCog,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Puzzle,
  LineChart,
  Activity,
  BookOpen,
  Code2,
  Bug,
} from "lucide-react";
import { useSidebar } from "@/components/providers/SidebarProvider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import BugReportModal from "@/components/bug-report/BugReportModal";

export default function Sidebar() {
  const pathname = usePathname();
  const { isCollapsed, toggleSidebar, mobileOpen, setMobileOpen } = useSidebar();
  const { data: session } = useSession();
  const [gpmOnline, setGpmOnline] = useState<boolean | null>(null);
  const [gpmPort, setGpmPort] = useState<number | null>(null);
  const [isBugModalOpen, setIsBugModalOpen] = useState(false);

  useEffect(() => {
    // Check GPM API status (auto-detected port)
    fetch("/api/gpm/scan")
      .then((r) => r.json())
      .then((data) => {
        setGpmOnline(!!data?.isOnline);
        setGpmPort(typeof data?.port === "number" ? data.port : null);
      })
      .catch(() => {
        setGpmOnline(false);
        setGpmPort(null);
      });
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  interface NavItem {
    href: string;
    label: string;
    icon: any;
    badge?: string;
    adminOnly?: boolean;
  }

  const userEmail = session?.user?.email || "";
  const userName =
    session?.user?.name ||
    (userEmail ? userEmail.split("@")[0] : "Admin");
  const rawRole = (session?.user as any)?.role || (session?.user as any)?.userType || "STAFF";
  const userRole = String(rawRole).toUpperCase();
  const isAdmin = userRole === "ADMIN";

  const navGroups: { group: string; items: NavItem[] }[] = [
    {
      group: "QUẢN TRỊ & VẬN HÀNH",
      items: [
        { href: "/analytics", label: "Trung Tâm Phân Tích", icon: LineChart },
        { href: "/accounts", label: "Dàn Account", icon: Users },
        { href: "/gpm", label: "GPMLogin Fleet", icon: Bot, badge: gpmOnline ? "Online" : undefined },
        { href: "/checklist", label: "Checklist Chấm Công", icon: CheckSquare },
        { href: "/revenue", label: "Doanh Thu", icon: BarChart3 },
        { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
        { href: "/extensions", label: "Tiện Ích Extension", icon: Puzzle },
      ],
    },
    {
      group: "HỆ THỐNG & CẤU HÌNH",
      items: [
        { href: "/users", label: "Nhân Sự & Phân Quyền", icon: UserCog, adminOnly: true },
        { href: "/groups", label: "Quản Lý Nhóm & Teams", icon: Layers, adminOnly: true },
        { href: "/logs", label: "Nhật Ký Hoạt Động", icon: Activity },
        { href: "/settings", label: "Cài Đặt & Cá Nhân", icon: Settings },
      ],
    },
    {
      group: "TÀI LIỆU & HỖ TRỢ",
      items: [
        { href: "/docs", label: "Hướng Dẫn (Docs)", icon: BookOpen },
        { href: "/api-docs", label: "API Reference", icon: Code2 },
        { href: "/security", label: "Trung Tâm Bảo Mật", icon: ShieldCheck },
      ],
    },
  ];

  // Filter items based on permissions
  const filteredNavGroups = navGroups
    .map((grp) => ({
      ...grp,
      items: grp.items.filter((item) => !item.adminOnly || isAdmin),
    }))
    .filter((grp) => grp.items.length > 0);

  const userInitials =
    userName
      .split(" ")
      .filter(Boolean)
      .map((w: string) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "DN";

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
      {/* Mobile Overlay Backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in"
        />
      )}

      {/* Main Sidebar (Desktop fixed with dynamic width + Mobile sliding drawer) */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 bg-white dark:bg-slate-900/95 backdrop-blur-xl border-r border-slate-200 dark:border-slate-800/90 flex flex-col transition-all duration-300 ease-in-out lg:translate-x-0 ${
          isCollapsed ? "lg:w-20" : "lg:w-64"
        } w-72 ${mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full lg:translate-x-0"}`}
      >
        {/* Brand Header & Collapse Toggle */}
        <div
          className={`h-16 px-4 flex items-center border-b border-slate-200 dark:border-slate-800/80 shrink-0 transition-all justify-between ${
            isCollapsed ? "lg:justify-center" : "lg:justify-between"
          }`}
        >
          {/* Logo & Brand Name */}
          <Link
            href="/"
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 group overflow-hidden ${
              isCollapsed ? "lg:justify-center" : ""
            }`}
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-pink-500 to-rose-500 p-0.5 shadow-lg shadow-pink-500/20 group-hover:scale-105 transition-transform shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[9px] flex items-center justify-center">
                <Zap className="w-4 h-4 text-pink-400 fill-pink-400" />
              </div>
            </div>

            {/* Always visible on mobile, toggleable on desktop */}
            <div className={`min-w-0 ${isCollapsed ? "lg:hidden" : "block"}`}>
              <div className="font-black text-base tracking-tight text-slate-900 dark:bg-gradient-to-r dark:from-white dark:via-slate-200 dark:to-pink-300 dark:bg-clip-text dark:text-transparent truncate">
                TIKTOK<span className="text-pink-500">FLOW</span>
              </div>
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
                Ops & Automation
              </div>
            </div>
          </Link>

          {/* Desktop Toggle Button */}
          {!isCollapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleSidebar}
                  className="hidden lg:flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
                  aria-label="Thu gọn sidebar"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Thu gọn Sidebar</TooltipContent>
            </Tooltip>
          ) : null}

          {/* Mobile close button (Top Right of Drawer) */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Đóng menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Collapsed Expand Quick Button under header on Desktop */}
        {isCollapsed && (
          <div className="hidden lg:flex justify-center pt-2 pb-1 border-b border-slate-100 dark:border-slate-800/60">
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleSidebar}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-pink-500 dark:hover:text-pink-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-all cursor-pointer"
                  aria-label="Mở rộng sidebar"
                >
                  <PanelLeftOpen className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Mở rộng Sidebar</TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Navigation Menu (Scrollable) */}
        <div
          className={`flex-1 overflow-y-auto py-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800 px-3.5 ${
            isCollapsed ? "lg:px-2" : "lg:px-3.5"
          }`}
        >
          {filteredNavGroups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-1.5">
              <div
                className={`px-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate ${
                  isCollapsed ? "lg:hidden" : "block"
                }`}
              >
                {group.group}
              </div>
              <nav className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;

                  const navItemLink = (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`group flex items-center rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isActive
                          ? "bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-lg shadow-pink-600/30 font-bold"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/70"
                      } justify-between px-3 py-2.5 ${
                        isCollapsed ? "lg:h-10 lg:w-10 lg:mx-auto lg:justify-center lg:p-0" : ""
                      }`}
                    >
                      <div
                        className={`flex items-center gap-3 ${
                          isCollapsed ? "lg:justify-center" : ""
                        }`}
                      >
                        <Icon
                          className={`w-4 h-4 transition-transform group-hover:scale-110 shrink-0 ${
                            isActive
                              ? "text-white"
                              : "text-slate-500 group-hover:text-pink-600 dark:text-slate-400 dark:group-hover:text-pink-400"
                          }`}
                        />
                        <span className={`truncate ${isCollapsed ? "lg:hidden" : "inline"}`}>
                          {item.label}
                        </span>
                      </div>

                      {item.badge && (
                        <span
                          className={`text-xs font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 ${
                            isCollapsed ? "lg:hidden" : "inline"
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );

                  if (isCollapsed) {
                    return (
                      <React.Fragment key={item.href}>
                        {/* On mobile: standard link */}
                        <div className="lg:hidden">{navItemLink}</div>
                        {/* On desktop: link wrapped with Tooltip */}
                        <div className="hidden lg:block">
                          <Tooltip delayDuration={0}>
                            <TooltipTrigger asChild>{navItemLink}</TooltipTrigger>
                            <TooltipContent side="right" className="font-semibold text-xs">
                              {item.label}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </React.Fragment>
                    );
                  }

                  return navItemLink;
                })}
              </nav>
            </div>
          ))}
        </div>

        {/* Sidebar Footer: GPM Status, User Profile & Logout Button */}
        <div
          className={`border-t border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-950/50 shrink-0 space-y-2.5 transition-all p-3.5 ${
            isCollapsed ? "lg:p-2" : "lg:p-3.5"
          }`}
        >
          {/* GPM Status Badge: Full on mobile, compact on collapsed desktop */}
          <div className={`flex items-center justify-between px-2 text-xs ${isCollapsed ? "lg:hidden" : "flex"}`}>
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
              <span
                className={`w-2 h-2 rounded-full ${
                  gpmOnline
                    ? "bg-emerald-500 animate-pulse shadow-sm shadow-emerald-500"
                    : "bg-emerald-500"
                }`}
              />
              <span>GPMLogin API{gpmPort ? ` (${gpmPort})` : ""}</span>
            </div>
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              Online
            </span>
          </div>

          {isCollapsed && (
            <div className="hidden lg:flex justify-center">
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-default">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        gpmOnline
                          ? "bg-emerald-500 animate-pulse shadow-sm shadow-emerald-500"
                          : "bg-emerald-500"
                      }`}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  GPMLogin API: {gpmOnline ? "Online" : "Offline"}
                  {gpmPort ? ` (Port ${gpmPort})` : ""}
                </TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* User Card: Full on mobile, compact on collapsed desktop */}
          <Link
            href="/settings"
            onClick={() => setMobileOpen(false)}
            className={`items-center gap-2.5 p-2 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 hover:border-pink-500/40 hover:bg-pink-50/10 dark:hover:bg-slate-800/80 shadow-xs transition-all cursor-pointer group ${
              isCollapsed ? "flex lg:hidden" : "flex"
            }`}
          >
            <div className="relative shrink-0">
              {session?.user?.image ? (
                <img
                  src={session.user.image}
                  alt={userName}
                  className="w-8 h-8 rounded-full object-cover border border-slate-300 dark:border-slate-700 shadow-xs group-hover:ring-2 group-hover:ring-pink-500/30 transition-all"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#18181b] flex items-center justify-center font-black text-white text-xs shadow-sm border border-slate-700/60 group-hover:ring-2 group-hover:ring-pink-500/30 transition-all">
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
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-slate-900 dark:text-slate-200 group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors truncate">
                {userName}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate">
                <ShieldCheck className="w-3 h-3 text-pink-500 shrink-0" />
                <span className="truncate">{getRoleLabel(userRole)}</span>
              </div>
            </div>
          </Link>

          {isCollapsed && (
            <div className="hidden lg:flex justify-center">
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Link
                    href="/settings"
                    className="relative cursor-pointer group"
                    aria-label="Cài đặt cá nhân"
                  >
                    {session?.user?.image ? (
                      <img
                        src={session.user.image}
                        alt={userName}
                        className="w-9 h-9 rounded-full object-cover border border-slate-300 dark:border-slate-700 shadow-md group-hover:ring-2 group-hover:ring-pink-500/40 transition-all"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-[#18181b] flex items-center justify-center font-black text-white text-xs shadow-md border border-slate-700/60 group-hover:ring-2 group-hover:ring-pink-500/40 transition-all">
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
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <div className="text-xs font-bold">{userName}</div>
                  <div className="text-xs text-slate-400">{getRoleLabel(userRole)}</div>
                  <div className="text-xs text-pink-500 font-semibold mt-0.5">Click để cài đặt</div>
                </TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* Bug Report Button */}
          <button
            onClick={() => setIsBugModalOpen(true)}
            className={`w-full items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-pink-50/50 dark:hover:bg-slate-850 border border-transparent hover:border-pink-500/20 transition-all cursor-pointer ${
              isCollapsed ? "flex lg:hidden" : "flex"
            }`}
          >
            <Bug className="w-4 h-4 shrink-0 text-pink-500" />
            <span>Báo Cáo Sự Cố</span>
          </button>

          {isCollapsed && (
            <div className="hidden lg:flex justify-center">
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setIsBugModalOpen(true)}
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-pink-50/50 dark:hover:bg-slate-800 transition-all cursor-pointer"
                    aria-label="Báo cáo sự cố"
                  >
                    <Bug className="w-4 h-4 text-pink-500" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs font-semibold">
                  Báo Cáo Sự Cố (Bug Report)
                </TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* Logout Button: Full on mobile, compact icon on collapsed desktop */}
          <button
            onClick={handleLogout}
            className={`w-full items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-transparent hover:border-rose-200 dark:hover:border-rose-900/50 transition-all cursor-pointer ${
              isCollapsed ? "flex lg:hidden" : "flex"
            }`}
          >
            <LogOut className="w-4 h-4 shrink-0 text-rose-500" />
            <span>Đăng Xuất</span>
          </button>

          {isCollapsed && (
            <div className="hidden lg:flex justify-center">
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleLogout}
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-900/50 transition-all cursor-pointer"
                    aria-label="Đăng xuất"
                  >
                    <LogOut className="w-4 h-4 text-rose-500" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs font-semibold text-rose-500">
                  Đăng Xuất (Logout)
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </aside>

      {/* Global Bug Report Modal */}
      <BugReportModal
        isOpen={isBugModalOpen}
        onClose={() => setIsBugModalOpen(false)}
      />
    </>
  );
}
