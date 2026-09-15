"use client";
import React, { Suspense } from "react";
import { AlertCircle, ArrowLeft, Home, LogIn, Loader2, ShieldAlert, Ban } from "lucide-react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getUserFriendlyMessage, AUTH_MESSAGES } from "@/features/auth/constants/authMessages";

function AuthErrorContent() {
  const params = useSearchParams();
  const errorCode = params.get("error");
  const emailAttempted = params.get("email");

  const isInvitationError = errorCode === "InvitationRequired";
  const isAccountLocked = errorCode === "ACCOUNT_LOCKED";
  const isOAuthLinkError = errorCode === "OAuthAccountNotLinked";

  // Get user-friendly message from error code
  const errorMessage = getUserFriendlyMessage(
    errorCode,
    AUTH_MESSAGES.ERROR.GENERIC
  );

  return (
    <div className="w-full max-w-[440px] mx-auto">
      <div className="bg-white dark:bg-slate-900/90 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-7 sm:p-9 flex flex-col items-center backdrop-blur-xl">
        {/* Error Icon */}
        <div
          className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-5 ring-8 ${
            isInvitationError || isOAuthLinkError
              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/10"
              : "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/10"
          }`}
        >
          {isInvitationError ? (
            <ShieldAlert className="w-8 h-8" strokeWidth={2} />
          ) : isAccountLocked ? (
            <Ban className="w-8 h-8" strokeWidth={2} />
          ) : (
            <AlertCircle className="w-8 h-8" strokeWidth={2} />
          )}
        </div>

        <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight text-center mb-2">
          {isInvitationError
            ? "Email Chưa Có Thư Mời"
            : isAccountLocked
            ? "Tài Khoản Bị Chặn Quyền Truy Cập"
            : isOAuthLinkError
            ? "Email Đã Tồn Tại Bằng Mật Khẩu"
            : "Lỗi Xác Thực"}
        </h1>

        {isInvitationError ? (
          <div className="space-y-3.5 w-full mb-6 text-center">
            <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed">
              Hệ thống TIKTOKFLOW hiện đang hoạt động theo chế độ <b>chỉ dành cho thành viên được mời</b>.
            </p>

            {emailAttempted && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl text-left space-y-1 text-xs">
                <span className="text-xs font-semibold text-rose-700 dark:text-rose-400 uppercase tracking-wider block">
                  Tài khoản Google vừa chọn:
                </span>
                <span className="font-bold font-mono text-rose-900 dark:text-rose-200 break-all text-sm block">
                  {emailAttempted}
                </span>
                <p className="text-xs text-rose-600 dark:text-rose-400 pt-0.5">
                  Email này chưa được Quản trị viên cấp quyền tham gia hệ thống.
                </p>
              </div>
            )}

            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl text-left space-y-1 text-xs">
              <span className="font-bold text-amber-900 dark:text-amber-200 block">
                💡 Bạn nhận được thư mời qua email khác?
              </span>
              <p className="text-xs text-amber-700 dark:text-amber-300/90 leading-relaxed">
                Khi chọn <b>Đăng ký / Đăng nhập với Google</b>, bạn cần chọn đúng địa chỉ email mà Quản trị viên đã gửi thư mời.
              </p>
            </div>
          </div>
        ) : isAccountLocked ? (
          <div className="space-y-3.5 w-full mb-6 text-center">
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl text-center space-y-1.5 text-xs">
              <p className="text-rose-700 dark:text-rose-300 font-medium leading-relaxed">
                Tài khoản này đã bị Quản trị viên chặn quyền truy cập vào hệ thống TIKTOKFLOW.
              </p>
              <p className="text-xs text-rose-600/80 dark:text-rose-400/80">
                Mọi quyền đăng nhập và thao tác dữ liệu đều bị tạm ngừng. Vui lòng liên hệ Admin nếu bạn cho rằng đây là sự nhầm lẫn.
              </p>
            </div>
          </div>
        ) : isOAuthLinkError ? (
          <div className="space-y-3.5 w-full mb-6 text-center">
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-xl text-center space-y-1.5 text-xs">
              <p className="text-amber-800 dark:text-amber-300 font-medium leading-relaxed">
                Tài khoản của bạn trước đó đã được tạo bằng <b>Email & Mật khẩu</b>.
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-400/80 leading-relaxed">
                Vui lòng đăng nhập bằng <b>Email & Mật khẩu</b> ban đầu để truy cập hệ thống.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-center text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-8">
            {errorMessage}
          </p>
        )}

        <div className="w-full space-y-2.5">
          <Link href="/signin" className="w-full block">
            <Button className="w-full h-11 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold transition-all shadow-md rounded-xl text-xs cursor-pointer">
              {isInvitationError ? (
                <>
                  <LogIn className="mr-2 w-4 h-4" />
                  Đổi Tài Khoản Khác / Đăng Nhập Lại
                </>
              ) : isOAuthLinkError ? (
                <>
                  <LogIn className="mr-2 w-4 h-4" />
                  Đăng Nhập Bằng Mật Khẩu
                </>
              ) : (
                <>
                  <ArrowLeft className="mr-2 w-4 h-4" />
                  Quay lại trang Đăng Nhập
                </>
              )}
            </Button>
          </Link>

          <Link href="/" className="w-full block">
            <Button
              variant="outline"
              className="w-full h-11 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold transition-all rounded-xl text-xs cursor-pointer"
            >
              <Home className="mr-2 w-4 h-4" />
              Về Trang Chủ
            </Button>
          </Link>
        </div>
      </div>

      <div className="mt-6 text-center space-y-2">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Cần cấp quyền truy cập?{" "}
          <a
            href="mailto:support@tiktokflow.com"
            className="text-pink-600 dark:text-pink-400 hover:underline font-semibold transition-colors"
          >
            Liên hệ Quản trị viên
          </a>
        </p>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 sm:p-8 transition-colors">
      {/* Brand Header */}
      <div className="mb-6">
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

      <Suspense
        fallback={
          <div className="w-full max-w-[440px] h-64 flex items-center justify-center bg-white dark:bg-slate-900/90 rounded-2xl border border-slate-200 dark:border-slate-800">
            <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
          </div>
        }
      >
        <AuthErrorContent />
      </Suspense>
    </div>
  );
}
