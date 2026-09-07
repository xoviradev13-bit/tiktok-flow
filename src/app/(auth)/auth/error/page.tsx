"use client";
import React from "react";
import { AlertCircle, ArrowLeft, Home } from "lucide-react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getUserFriendlyMessage, AUTH_MESSAGES } from "@/features/auth/constants/authMessages";

export default function AuthErrorPage() {
  const params = useSearchParams();
  const errorCode = params.get("error");

  // Get user-friendly message from error code
  const errorMessage = getUserFriendlyMessage(
    errorCode,
    AUTH_MESSAGES.ERROR.GENERIC
  );

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 sm:p-8 transition-colors">
      {/* Brand Header */}
      <div className="mb-8">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-pink-500 to-rose-500 p-0.5 shadow-md shadow-pink-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[9px] flex items-center justify-center">
              <span className="text-white font-black text-sm tracking-tight">TTF</span>
            </div>
          </div>
          <span className="font-black text-xl tracking-tight text-slate-900 dark:text-white">
            TIKTOK<span className="text-pink-500">FLOW</span>
          </span>
        </Link>
      </div>

      <div className="w-full max-w-[420px] mx-auto">
        <div className="bg-white dark:bg-slate-900/90 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-8 sm:p-10 flex flex-col items-center backdrop-blur-xl">
          {/* Error Icon */}
          <div className="w-16 h-16 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center mb-6 ring-8 ring-rose-500/10">
            <AlertCircle className="w-8 h-8" strokeWidth={2} />
          </div>

          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight text-center mb-2">
            Lỗi Xác Thực
          </h1>

          <p className="text-center text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-8">
            {errorMessage}
          </p>

          <div className="w-full space-y-3">
            <Link href="/signin" className="w-full block">
              <Button
                className="w-full h-11 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold transition-all shadow-md rounded-xl cursor-pointer"
              >
                <ArrowLeft className="mr-2 w-4 h-4" />
                Quay lại trang Đăng Nhập
              </Button>
            </Link>

            <Link href="/" className="w-full block">
              <Button
                variant="outline"
                className="w-full h-11 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold transition-all rounded-xl cursor-pointer"
              >
                <Home className="mr-2 w-4 h-4" />
                Về Trang Chủ
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-8 text-center space-y-3">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Cần hỗ trợ?{" "}
            <a href="mailto:support@tiktokflow.com" className="text-pink-600 dark:text-pink-400 hover:underline font-semibold transition-colors">
              Liên hệ bộ phận CSKH
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
