"use client";
import React, { useState, useCallback } from "react";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { Label } from "@/components/ui/label";
import { AuthMessage } from "../components/AuthMessage";
import { RequestPasswordReset } from "@/services/auth.service";
import Link from "next/link";
import { AUTH_MESSAGES } from "../constants/authMessages";
import { MessageType } from "../components/AuthMessage";
import { AuthContainer } from "../components/AuthContainer";

export const RequestResetPasswordView = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("success");

  const inputClass =
    "h-11 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all rounded-xl text-sm px-3.5 w-full";
  const labelClass = "text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block";

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setLoading(true);
      setMessage("");

      try {
        await RequestPasswordReset(email);
        setMessageType("success");
        setMessage(AUTH_MESSAGES.SUCCESS.PASSWORD_RESET_REQUESTED);
        setTimeout(() => {
          window.location.href = `/auth/verify-request?type=reset&email=${encodeURIComponent(
            email
          )}`;
        }, 500);
      } catch (error: any) {
        setMessageType("success");
        setMessage(AUTH_MESSAGES.SUCCESS.PASSWORD_RESET_REQUESTED);
      } finally {
        setLoading(false);
      }
    },
    [email]
  );

  return (
    <AuthContainer
      title="Khôi Phục Mật Khẩu"
      subtitle="Nhập địa chỉ email tài khoản của bạn để nhận liên kết đặt lại mật khẩu."
    >
      <AuthMessage message={message} type={messageType} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="email" className={labelClass}>
            Địa Chỉ Email
          </Label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={inputClass}
            placeholder="name@example.com"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full h-11 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold rounded-xl shadow-lg shadow-pink-600/30 transition-all duration-200 text-sm flex items-center justify-center gap-2 cursor-pointer mt-3 disabled:opacity-60"
        >
          <span>{loading ? "Đang gửi liên kết..." : "Gửi Liên Kết Đặt Lại"}</span>
          {!loading && <ArrowRight className="w-4 h-4" />}
        </button>

        <div className="text-center mt-5">
          <Link
            href="/signin"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-pink-600 dark:hover:text-pink-400 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Quay lại trang Đăng Nhập</span>
          </Link>
        </div>
      </form>
    </AuthContainer>
  );
};

export default RequestResetPasswordView;
