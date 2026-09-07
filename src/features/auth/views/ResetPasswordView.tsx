"use client";
import React, { useState, useCallback, useMemo } from "react";
import { ArrowRight, Check, X, Eye, EyeOff } from "lucide-react";
import { Label } from "@/components/ui/label";
import { AuthMessage } from "../components/AuthMessage";
import { ConfirmPasswordReset } from "@/services/auth.service";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AUTH_MESSAGES, getUserFriendlyMessage } from "../constants/authMessages";
import { MessageType } from "../components/AuthMessage";
import { AuthContainer } from "../components/AuthContainer";

function passwordStrength(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  return score;
}

export const ResetPasswordView = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("error");
  const [showPassword, setShowPassword] = useState(false);

  const inputClass =
    "h-11 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all rounded-xl text-sm px-3.5 w-full";
  const labelClass = "text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block";

  const strength = useMemo(() => passwordStrength(password), [password]);
  const passwordsMatch = password.length > 0 && password === confirm;

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      if (!token) {
        setMessageType("error");
        setMessage(AUTH_MESSAGES.ERROR.INVALID_TOKEN);
        return;
      }

      if (!passwordsMatch) {
        setMessageType("error");
        setMessage(AUTH_MESSAGES.ERROR.PASSWORDS_NOT_MATCH);
        return;
      }

      setLoading(true);
      setMessage("");

      try {
        const result = await ConfirmPasswordReset(token, password);

        if (result.success) {
          setMessageType("success");
          setMessage(AUTH_MESSAGES.SUCCESS.PASSWORD_RESET_SUCCESS);
          setTimeout(() => (window.location.href = "/signin"), 1500);
        } else {
          setMessageType("error");
          setMessage(
            getUserFriendlyMessage(
              result.error?.code,
              AUTH_MESSAGES.ERROR.PASSWORD_RESET_FAILED
            )
          );
          setLoading(false);
        }
      } catch (error: any) {
        setMessageType("error");
        setMessage(AUTH_MESSAGES.ERROR.PASSWORD_RESET_FAILED);
        setLoading(false);
      }
    },
    [token, password, passwordsMatch]
  );

  return (
    <AuthContainer
      title="Đặt Lại Mật Khẩu Mới"
      subtitle="Mật khẩu mới của bạn phải có ít nhất 8 ký tự và khác với các mật khẩu đã sử dụng trước đó."
    >
      <AuthMessage message={message} type={messageType} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="password" className={labelClass}>
            Mật Khẩu Mới
          </Label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={`${inputClass} pr-10`}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none cursor-pointer"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          <div className="mt-2 flex gap-1.5 h-1">
            {[1, 2, 3].map((level) => (
              <div
                key={level}
                className={`flex-1 rounded-full transition-all duration-300 ${
                  password.length === 0
                    ? "bg-slate-200 dark:bg-slate-800"
                    : level <= strength
                    ? strength === 3
                      ? "bg-emerald-500"
                      : strength === 2
                      ? "bg-amber-400"
                      : "bg-rose-400"
                    : "bg-slate-200 dark:bg-slate-800"
                }`}
              />
            ))}
          </div>
          {password.length > 0 && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 text-right">
              {strength === 3
                ? "Mạnh"
                : strength === 2
                ? "Trung bình"
                : "Yếu"}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="confirm" className={labelClass}>
            Xác Nhận Mật Khẩu
          </Label>
          <input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className={inputClass}
            placeholder="••••••••"
          />
          {confirm.length > 0 && (
            <div
              className={`mt-1.5 text-xs flex items-center gap-1.5 font-semibold transition-colors ${
                passwordsMatch ? "text-emerald-500" : "text-rose-500"
              }`}
            >
              {passwordsMatch ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <X className="w-3.5 h-3.5" />
              )}
              {passwordsMatch ? "Mật khẩu khớp nhau" : "Mật khẩu không khớp"}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full h-11 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold rounded-xl shadow-lg shadow-pink-600/30 transition-all duration-200 text-sm flex items-center justify-center gap-2 cursor-pointer mt-3 disabled:opacity-60"
        >
          <span>{loading ? "Đang cập nhật..." : "Lưu Mật Khẩu Mới"}</span>
          {!loading && <ArrowRight className="w-4 h-4" />}
        </button>
      </form>
    </AuthContainer>
  );
};

export default ResetPasswordView;
