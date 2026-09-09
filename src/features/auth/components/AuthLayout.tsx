"use client";
import React from "react";
import Link from "next/link";
import { Zap } from "lucide-react";

export const AuthLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div
      suppressHydrationWarning
      className="flex min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors"
    >
      {/* Sidebar: Brand / Art (Hidden on mobile) */}
      <div className="hidden lg:flex w-1/2 bg-slate-950 text-white relative flex-col justify-between p-16 overflow-hidden border-r border-slate-800">
        {/* Abstract Premium Background Art */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-pink-500/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-96 h-96 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-pink-500 to-rose-500 p-0.5 shadow-lg shadow-pink-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[9px] flex items-center justify-center">
                <Zap className="w-5 h-5 text-pink-400 fill-pink-400" />
              </div>
            </div>
            <span className="text-2xl font-black tracking-tight text-white">
              TIKTOK<span className="text-pink-500">FLOW</span>
            </span>
          </div>

          <div className="space-y-6 max-w-lg">
            <h1 className="text-4xl sm:text-5xl font-black leading-tight tracking-tight text-white">
              Quản Trị Vận Hành <br />
              <span className="bg-gradient-to-r from-pink-400 via-rose-300 to-amber-300 bg-clip-text text-transparent">
                Dàn Acc & Doanh Thu.
              </span>
            </h1>

            <p className="text-lg text-slate-300 font-normal leading-relaxed">
              Tự động hóa checklist chấm công hàng ngày, quét GPMLogin trích xuất số liệu thực tế và giám sát hiệu suất nhân sự realtime.
            </p>
          </div>
        </div>

        <div className="relative z-10 flex gap-6 text-xs font-semibold text-slate-400">
          <span>© 2026 TIKTOKFLOW Inc.</span>
          <Link href="/security" className="hover:text-white transition-colors">
            Bảo Mật
          </Link>
          <Link href="/privacy" className="hover:text-white transition-colors">
            Quyền Riêng Tư
          </Link>
          <Link href="/terms" className="hover:text-white transition-colors">
            Điều Khoản
          </Link>
        </div>
      </div>

      {/* Main Content: Form */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-50 dark:bg-slate-950">
        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
          {children}
        </div>
      </div>
    </div>
  );
};