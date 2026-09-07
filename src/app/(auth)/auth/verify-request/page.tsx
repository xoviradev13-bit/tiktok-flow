"use client";
import React from "react";
import { Mail, ArrowLeft } from "lucide-react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function VerifyRequestPage() {
  const searchParams = useSearchParams();
  const type = searchParams.get("type");
  const email = searchParams.get("email");
  const callbackUrl = searchParams.get("callbackUrl");

  const isReset = type === "reset";
  const isMagicLink = type === "magiclink";

  const emailText = email ? (
    <span className="font-bold text-slate-900 dark:text-white">{email}</span>
  ) : (
    "địa chỉ email của bạn"
  );

  const title = isReset
    ? "Kiểm Tra Hộp Thư Email"
    : isMagicLink
    ? "Kiểm Tra Hộp Thư Email"
    : "Xác Thực Địa Chỉ Email";

  const subtitle = isReset ? (
    <>
      Chúng tôi đã gửi liên kết đặt lại mật khẩu đến {emailText}.<br />
      Nhấp vào liên kết trong thư để tạo mật khẩu mới.
    </>
  ) : isMagicLink ? (
    <>
      Chúng tôi đã gửi liên kết đăng nhập nhanh đến {emailText}.<br />
      Nhấp vào liên kết để đăng nhập vào hệ thống.
    </>
  ) : (
    <>
      Chúng tôi đã gửi liên kết kích hoạt đến {emailText}.<br />
      Nhấp vào liên kết để hoàn tất đăng ký tài khoản.
    </>
  );

  // Preserve callbackUrl in back link
  const loginUrl = callbackUrl
    ? `/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : "/signin";

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
          {/* Animated Mail Icon */}
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-pink-500/20 rounded-full animate-ping opacity-30 duration-1000" />
            <div className="relative w-20 h-20 bg-gradient-to-tr from-pink-500/10 to-rose-500/10 text-pink-600 dark:text-pink-400 rounded-full flex items-center justify-center ring-8 ring-pink-500/10">
              <Mail className="w-9 h-9" strokeWidth={1.75} />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight text-center mb-3">
            {title}
          </h1>

          <div className="text-center text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-8">
            {subtitle}
          </div>

          {/* Help Box */}
          <div className="w-full bg-slate-50 dark:bg-slate-950/60 rounded-xl p-4 mb-8 border border-slate-200 dark:border-slate-800">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 text-center">
              Chưa nhận được email?
            </h3>
            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5 text-center leading-relaxed">
              <p>Vui lòng kiểm tra kỹ thư mục <strong>Spam (Thư rác)</strong> hoặc <strong>Quảng cáo</strong>.</p>
              <p>Đôi khi email có thể mất 1-2 phút để gửi đến.</p>
            </div>
          </div>

          <Link href={loginUrl} className="w-full">
            <Button
              variant="outline"
              className="w-full h-11 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold transition-all rounded-xl cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Quay lại trang Đăng Nhập
            </Button>
          </Link>
        </div>

        <div className="mt-8 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            &copy; {new Date().getFullYear()} TIKTOKFLOW Inc. Bảo lưu mọi quyền.
          </p>
        </div>
      </div>
    </div>
  );
}
