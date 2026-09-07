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
  Menu,
  X,
  ShieldCheck,
  UserCog,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { useSidebar } from "@/components/providers/SidebarProvider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function Sidebar() {
  const pathname = usePathname();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [gpmOnline, setGpmOnline] = useState<boolean | null>(null);

  useEffect(() => {
    // Check GPM API status
    fetch("/api/gpm/scan")
      .then(() => setGpmOnline(true))
      .catch(() => setGpmOnline(false));
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  interface NavItem {
    href: string;
    label: string;
    icon: any;
    badge?: string;
  }

  const navGroups: { group: string; items: NavItem[] }[] = [
    {
      group: "QUẢN TRỊ & VẬN HÀNH",
      items: [
        { href: "/accounts", label: "Dàn Account", icon: Users },
        { href: "/checklist", label: "Checklist Chấm Công", icon: CheckSquare },
        { href: "/revenue", label: "Doanh Thu", icon: BarChart3 },
        { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
      ],
    },
    {
      group: "HỆ THỐNG & CẤU HÌNH",
      items: [
        { href: "/users", label: "Nhân Sự & Phân Quyền", icon: UserCog },
        { href: "/groups", label: "Quản Lý Nhóm & Teams", icon: Layers },
        { href: "/settings", label: "Cấu Hình", icon: Settings },
      ],
    },
  ];

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
      {/* Mobile Topbar for Hamburger & Brand */}
      <div className="lg:hidden sticky top-0 z-40 flex items-center justify-between h-14 px-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 via-pink-500 to-rose-500 p-0.5 shadow-md shadow-pink-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[6px] flex items-center justify-center">
              <Zap className="w-4 h-4 text-pink-400 fill-pink-400" />
            </div>
          </div>
          <span className="font-black text-sm tracking-tight text-slate-900 dark:text-white">
            TIKTOK<span className="text-pink-500">FLOW</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 cursor-pointer"
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Overlay Backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity"
        />
      )}

      {/* Main Sidebar (Desktop fixed with dynamic width + Mobile sliding drawer) */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 bg-white dark:bg-slate-900/95 backdrop-blur-xl border-r border-slate-200 dark:border-slate-800/90 flex flex-col transition-all duration-300 ease-in-out lg:translate-x-0 ${
          isCollapsed ? "lg:w-20" : "lg:w-64"
        } ${mobileOpen ? "w-64 translate-x-0 shadow-2xl" : "-translate-x-full lg:translate-x-0"}`}
      >
        {/* Brand Header & Collapse Toggle */}
        <div
          className={`h-16 px-4 flex items-center border-b border-slate-200 dark:border-slate-800/80 shrink-0 transition-all ${
            isCollapsed ? "justify-center" : "justify-between"
          }`}
        >
          {/* Logo & Brand Name */}
          <Link
            href="/"
            className={`flex items-center gap-3 group overflow-hidden ${
              isCollapsed ? "justify-center" : ""
            }`}
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-pink-500 to-rose-500 p-0.5 shadow-lg shadow-pink-500/20 group-hover:scale-105 transition-transform shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[9px] flex items-center justify-center">
                <Zap className="w-4 h-4 text-pink-400 fill-pink-400" />
              </div>
            </div>

            {!isCollapsed && (
              <div className="min-w-0">
                <div className="font-black text-base tracking-tight text-slate-900 dark:bg-gradient-to-r dark:from-white dark:via-slate-200 dark:to-pink-300 dark:bg-clip-text dark:text-transparent truncate">
                  TIKTOK<span className="text-pink-500">FLOW</span>
                </div>
                <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
                  Ops & Automation
                </div>
              </div>
            )}
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

          {/* Mobile close button */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Collapsed Expand Quick Button under header */}
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
          className={`flex-1 overflow-y-auto py-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800 ${
            isCollapsed ? "px-2" : "px-3.5"
          }`}
        >
          {navGroups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-1.5">
              {!isCollapsed && (
                <div className="px-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
                  {group.group}
                </div>
              )}
              <nav className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;

                  const navItemLink = (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`group flex items-center rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isActive
                          ? "bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-lg shadow-pink-600/30 font-bold"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/70"
                      } ${
                        isCollapsed
                          ? "h-10 w-10 mx-auto justify-center p-0"
                          : "justify-between px-3 py-2.5"
                      }`}
                    >
                      <div
                        className={`flex items-center ${
                          isCollapsed ? "justify-center" : "gap-3"
                        }`}
                      >
                        <Icon
                          className={`w-4 h-4 transition-transform group-hover:scale-110 shrink-0 ${
                            isActive
                              ? "text-white"
                              : "text-slate-500 group-hover:text-pink-600 dark:text-slate-400 dark:group-hover:text-pink-400"
                          }`}
                        />
                        {!isCollapsed && <span className="truncate">{item.label}</span>}
                      </div>

                      {!isCollapsed && item.badge && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );

                  if (isCollapsed) {
                    return (
                      <Tooltip key={item.href} delayDuration={0}>
                        <TooltipTrigger asChild>{navItemLink}</TooltipTrigger>
                        <TooltipContent side="right" className="font-semibold text-xs">
                          {item.label}
                        </TooltipContent>
                      </Tooltip>
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
          className={`border-t border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-950/50 shrink-0 space-y-2.5 transition-all ${
            isCollapsed ? "p-2" : "p-3.5"
          }`}
        >
          {/* GPM Status Badge */}
          {!isCollapsed ? (
            <div className="flex items-center justify-between px-2 text-[11px]">
              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                <span
                  className={`w-2 h-2 rounded-full ${
                    gpmOnline
                      ? "bg-emerald-500 animate-pulse shadow-sm shadow-emerald-500"
                      : "bg-emerald-500"
                  }`}
                />
                <span>GPMLogin API (9495)</span>
              </div>
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                Online
              </span>
            </div>
          ) : (
            <div className="flex justify-center">
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
                <TooltipContent side="right">GPMLogin API: Online (Port 9495)</TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* User Card */}
          {!isCollapsed ? (
            <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center font-bold text-white text-xs shadow-md shrink-0">
                {userInitials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-900 dark:text-slate-200 truncate">
                  {userName}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate">
                  <ShieldCheck className="w-3 h-3 text-pink-500 shrink-0" />
                  <span className="truncate">
                    {getRoleLabel(userRole)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center font-bold text-white text-xs shadow-md cursor-pointer">
                    {userInitials}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <div className="text-xs font-bold">{userName}</div>
                  <div className="text-[10px] text-slate-400">
                    {getRoleLabel(userRole)}
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* Logout Button */}
          {!isCollapsed ? (
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-transparent hover:border-rose-200 dark:hover:border-rose-900/50 transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4 shrink-0 text-rose-500" />
              <span>Đăng Xuất</span>
            </button>
          ) : (
            <div className="flex justify-center">
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
    </>
  );
}
