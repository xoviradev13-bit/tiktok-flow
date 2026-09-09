"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Zap, Menu, X, ArrowRight, ExternalLink } from "lucide-react";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { PUBLIC_NAV_LINKS, APP_ROUTES } from "@/constants/routes.config";

interface PublicHeaderProps {
  badge?: string;
}

export default function PublicHeader({ badge }: PublicHeaderProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  return (
    <>
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/90 dark:bg-slate-950/90 border-b border-slate-200/80 dark:border-slate-800/80 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 via-pink-500 to-rose-500 p-0.5 shadow-md group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-white dark:bg-slate-950 rounded-[9px] flex items-center justify-center">
                <Zap className="w-4 h-4 text-pink-500 fill-pink-500" />
              </div>
            </div>
            <span className="font-black text-base sm:text-lg tracking-tight text-slate-900 dark:text-white">
              TIKTOK<span className="text-pink-500">FLOW</span>
            </span>
            {badge && (
              <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 whitespace-nowrap">
                {badge}
              </span>
            )}
          </Link>

          {/* Desktop Nav Links (Visible on lg: >= 1024px to prevent wrapping on tablet) */}
          <nav className="hidden lg:flex items-center gap-6 xl:gap-8 text-sm font-semibold text-slate-600 dark:text-slate-300">
            {PUBLIC_NAV_LINKS.map((nav) => {
              const isActive = pathname === nav.href;
              return (
                <Link
                  key={nav.href}
                  href={nav.href}
                  className={`transition-colors py-1 ${
                    isActive
                      ? "text-pink-600 dark:text-pink-400 font-bold border-b-2 border-pink-500"
                      : "hover:text-pink-600 dark:hover:text-pink-400"
                  }`}
                >
                  {nav.label}
                </Link>
              );
            })}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-2.5 shrink-0">
            <ThemeToggle />

            {session ? (
              <Link
                href={APP_ROUTES.ACCOUNTS}
                className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-md shadow-pink-600/20 active:scale-95 transition-all whitespace-nowrap"
              >
                <span>Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5 hidden sm:inline-block" />
              </Link>
            ) : (
              <Link
                href={APP_ROUTES.SIGNIN}
                className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-md shadow-pink-600/20 active:scale-95 transition-all whitespace-nowrap"
              >
                <span>Đăng Nhập</span>
              </Link>
            )}

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-slate-200 dark:border-slate-800 cursor-pointer"
              aria-label={mobileMenuOpen ? "Đóng menu" : "Mở menu"}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Navigation Menu rendered as sibling outside header to avoid backdrop-filter stacking context */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-x-0 top-16 bottom-0 z-[100] bg-white/98 dark:bg-slate-950/98 backdrop-blur-2xl border-t border-slate-200 dark:border-slate-800 overflow-y-auto shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="max-w-md mx-auto px-6 py-6 space-y-4">
            {badge && (
              <div className="pb-2">
                <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20">
                  {badge}
                </span>
              </div>
            )}

            <div className="space-y-1">
              <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-3 pb-1">
                Điều Hướng Trang
              </div>
              {PUBLIC_NAV_LINKS.map((nav) => {
                const isActive = pathname === nav.href;
                return (
                  <Link
                    key={nav.href}
                    href={nav.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-3.5 py-3 rounded-2xl text-base font-semibold transition-all ${
                      isActive
                        ? "bg-pink-500/10 text-pink-600 dark:text-pink-400 font-bold border border-pink-500/20"
                        : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900"
                    }`}
                  >
                    <span>{nav.label}</span>
                    <ArrowRight className="w-4 h-4 text-slate-400 opacity-60" />
                  </Link>
                );
              })}
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
              {session ? (
                <Link
                  href={APP_ROUTES.ACCOUNTS}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-bold bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-md shadow-pink-600/20"
                >
                  <span>Truy Cập Dashboard Quản Trị</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <>
                  <Link
                    href={APP_ROUTES.SIGNIN}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-bold bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-md shadow-pink-600/20"
                  >
                    <span>Đăng Nhập Tài Khoản</span>
                  </Link>
                  <Link
                    href={APP_ROUTES.SIGNUP}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    <span>Đăng Ký Tài Khoản Mới</span>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
