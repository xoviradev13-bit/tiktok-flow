"use client";
import React, { useState, useCallback, useEffect } from "react";
import NextImage from "next/image";
import { Mail, ArrowRight, Eye, EyeOff, ShieldCheck, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AuthMessage, MessageType } from "../components/AuthMessage";
import { signIn } from "next-auth/react";
import { SignInWithCredentials, SignInWithMagicLink } from "@/services/auth.service";
import { AuthContainer } from "../components/AuthContainer";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { AUTH_MESSAGES, getUserFriendlyMessage } from "../constants/authMessages";
import { validateCallbackUrl } from "../helpers/authHelpers";

export const LoginView = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawCallbackUrl = searchParams?.get("callbackUrl");
  const callbackUrl = validateCallbackUrl(rawCallbackUrl);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [magicEmail, setMagicEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("error");
  const [showPassword, setShowPassword] = useState(false);
  const [loginMethod, setLoginMethod] = useState<"password" | "magiclink">("password");

  const [isInviteFlow, setIsInviteFlow] = useState(false);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [dismissInviteBanner, setDismissInviteBanner] = useState(false);

  useEffect(() => {
    if (rawCallbackUrl && rawCallbackUrl.includes("token=")) {
      const match = rawCallbackUrl.match(/token=([^&]+)/);
      if (match && match[1]) {
        setIsInviteFlow(true);
        fetch(`/api/invitations/accept?token=${encodeURIComponent(match[1])}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.email) {
              setEmail(data.email);
              setMagicEmail(data.email);
              setInvitedEmail(data.email);
            }
          })
          .catch(() => { });
      }
    }
  }, [rawCallbackUrl]);

  useEffect(() => {
    const verified = searchParams?.get("verified");
    if (verified === "success") {
      setMessageType("success");
      setMessage("Email đã được xác thực thành công! Vui lòng đăng nhập.");
    } else if (verified === "already") {
      setMessageType("info");
      setMessage("Email đã được xác thực trước đó. Vui lòng đăng nhập.");
    }
  }, [searchParams]);

  // High-contrast Enterprise styling
  const inputClass =
    "h-11 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all rounded-xl text-sm px-3.5 w-full";
  const labelClass = "text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block";

  const clearMessage = useCallback(() => {
    setMessage("");
  }, []);

  const handleCredentials = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (isInviteFlow && invitedEmail && email.trim().toLowerCase() !== invitedEmail.toLowerCase()) {
        setMessageType("error");
        setMessage(`Email không khớp. Thư mời này dành riêng cho ${invitedEmail}`);
        return;
      }
      setLoading(true);
      setMessage("");

      try {
        const result = await SignInWithCredentials(email, password, callbackUrl);
        if (result.success) {
          setMessageType("success");
          setMessage(AUTH_MESSAGES.SUCCESS.LOGIN);
          setTimeout(() => {
            window.location.href = callbackUrl;
          }, 500);
        } else {
          setMessageType("error");
          setMessage(result.error?.message || getUserFriendlyMessage(result.error?.code));
          setLoading(false);
        }
      } catch (error: any) {
        setMessageType("error");
        setMessage(AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS);
        setLoading(false);
      }
    },
    [email, password, callbackUrl, isInviteFlow, invitedEmail]
  );

  const handleGoogle = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      await signIn("google", {
        callbackUrl: callbackUrl && callbackUrl !== "/" ? callbackUrl : "/accounts",
      });
    } catch (error: any) {
      if (error?.message?.includes("NEXT_REDIRECT") || error?.digest?.includes("NEXT_REDIRECT")) {
        return;
      }
      setMessageType("error");
      setMessage(AUTH_MESSAGES.ERROR.GOOGLE_CONNECT_FAILED);
      setLoading(false);
    }
  }, [callbackUrl]);

  const handleMagic = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (isInviteFlow && invitedEmail && magicEmail.trim().toLowerCase() !== invitedEmail.toLowerCase()) {
        setMessageType("error");
        setMessage(`Email không khớp. Thư mời này dành riêng cho ${invitedEmail}`);
        return;
      }
      setLoading(true);
      setMessage("");
      try {
        const result = await SignInWithMagicLink(magicEmail, callbackUrl);
        if (result?.success) {
          setMessageType("success");
          setMessage(AUTH_MESSAGES.SUCCESS.MAGIC_LINK_SENT);
          setTimeout(() => {
            const verifyUrl = `/auth/verify-request?type=magiclink&email=${encodeURIComponent(magicEmail)}`;
            const urlWithCallback =
              callbackUrl !== "/"
                ? `${verifyUrl}&callbackUrl=${encodeURIComponent(callbackUrl)}`
                : verifyUrl;
            window.location.href = urlWithCallback;
          }, 500);
        } else {
          setMessageType("error");
          setMessage(result.error?.message || AUTH_MESSAGES.ERROR.MAGIC_LINK_FAILED);
        }
      } catch (error: any) {
        setMessageType("error");
        setMessage(AUTH_MESSAGES.ERROR.GENERIC);
      }
      setLoading(false);
    },
    [magicEmail, callbackUrl, isInviteFlow, invitedEmail]
  );

  return (
    <AuthContainer
      title="Chào Mừng Đến Với TIKTOKFLOW"
      subtitle={
        <span className="flex items-center gap-1.5 flex-wrap">
          <span>Chưa có tài khoản?</span>
          <Link
            href={
              rawCallbackUrl
                ? `/signup?callbackUrl=${encodeURIComponent(rawCallbackUrl)}`
                : "/signup"
            }
            className="font-bold text-pink-600 dark:text-pink-400 hover:underline transition-all"
          >
            Đăng ký ngay
          </Link>
        </span>
      }
    >
      <AuthMessage message={message} type={messageType} onDismiss={clearMessage} />

      {isInviteFlow && invitedEmail && !dismissInviteBanner && (
        <div className="mb-4 p-3 rounded-xl bg-pink-500/10 border border-pink-500/20 text-xs text-pink-700 dark:text-pink-300 flex items-center justify-between gap-2 transition-all">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0 text-pink-500" />
            <span>
              Đang đăng nhập theo thư mời dành cho <strong>{invitedEmail}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDismissInviteBanner(true)}
            className="text-pink-400 hover:text-pink-600 dark:hover:text-pink-200 transition-colors p-1 rounded-lg hover:bg-pink-500/10 cursor-pointer shrink-0"
            title="Đóng thông báo"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Social Login Buttons */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          className="w-full h-11 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 font-bold rounded-xl transition-all duration-200 text-xs flex items-center justify-center cursor-pointer shadow-sm disabled:opacity-60"
        >
          <svg className="mr-2.5 shrink-0 w-[18px] h-[18px]" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Tiếp tục với Google</span>
        </button>
        {isInviteFlow && invitedEmail && (
          <p className="text-xs text-center text-slate-500 dark:text-slate-400">
            Lưu ý: Phải chọn đúng tài khoản Google <span className="font-bold text-pink-600 dark:text-pink-400">{invitedEmail}</span> để khớp với thư mời.
          </p>
        )}
      </div>

      {/* Divider */}
      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200 dark:border-slate-800" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white dark:bg-slate-900 px-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Hoặc đăng nhập với
          </span>
        </div>
      </div>

      {/* Login Method Toggle */}
      <div className="flex p-1 bg-slate-100 dark:bg-slate-950 rounded-xl mb-5 border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setLoginMethod("password")}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${loginMethod === "password"
            ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-700"
            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
        >
          Mật Khẩu
        </button>
        <button
          type="button"
          onClick={() => setLoginMethod("magiclink")}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${loginMethod === "magiclink"
            ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-700"
            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
        >
          Magic Link
        </button>
      </div>

      <AnimatePresence mode="wait">
        {loginMethod === "password" ? (
          <motion.form
            key="password"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.2 }}
            onSubmit={handleCredentials}
            className="space-y-4"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className={labelClass} htmlFor="email">
                  Địa Chỉ Email
                </Label>
                {isInviteFlow && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-pink-700 dark:text-pink-300 bg-pink-100 dark:bg-pink-950/80 px-2 py-0.5 rounded-full border border-pink-200 dark:border-pink-800">
                    🔒 Cố định theo thư mời
                  </span>
                )}
              </div>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={isInviteFlow}
                required
                className={`${inputClass} ${isInviteFlow ? "bg-slate-100 dark:bg-slate-900/60 cursor-not-allowed opacity-90" : ""}`}
                placeholder="name@example.com"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300" htmlFor="password">
                  Mật Khẩu
                </Label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-semibold text-pink-600 dark:text-pink-400 hover:underline"
                >
                  Quên mật khẩu?
                </Link>
              </div>
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
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold rounded-xl shadow-lg shadow-pink-600/30 transition-all duration-200 text-sm flex items-center justify-center gap-2 cursor-pointer mt-2 disabled:opacity-60"
            >
              <span>{loading ? "Đang đăng nhập..." : "Đăng Nhập"}</span>
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </motion.form>
        ) : (
          <motion.form
            key="magic"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
            onSubmit={handleMagic}
            className="space-y-4"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className={labelClass} htmlFor="magic">
                  Địa Chỉ Email
                </Label>
                {isInviteFlow && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-pink-700 dark:text-pink-300 bg-pink-100 dark:bg-pink-950/80 px-2 py-0.5 rounded-full border border-pink-200 dark:border-pink-800">
                    🔒 Cố định theo thư mời
                  </span>
                )}
              </div>
              <input
                id="magic"
                type="email"
                value={magicEmail}
                onChange={(e) => setMagicEmail(e.target.value)}
                readOnly={isInviteFlow}
                required
                className={`${inputClass} ${isInviteFlow ? "bg-slate-100 dark:bg-slate-900/60 cursor-not-allowed opacity-90" : ""}`}
                placeholder="name@example.com"
              />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {isInviteFlow
                  ? "Liên kết đăng nhập sẽ được gửi đến đúng email đã được mời."
                  : "Chúng tôi sẽ gửi một liên kết đăng nhập trực tiếp không cần mật khẩu đến email của bạn."}
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold rounded-xl shadow-lg shadow-pink-600/30 transition-all duration-200 text-sm flex items-center justify-center gap-2 cursor-pointer mt-2 disabled:opacity-60"
            >
              <span>{loading ? "Đang gửi..." : "Gửi Magic Link"}</span>
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </AuthContainer>
  );
};
