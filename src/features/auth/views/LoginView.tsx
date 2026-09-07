"use client";
import React, { useState, useCallback, useEffect } from "react";
import NextImage from "next/image";
import { Mail, ArrowRight, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AuthMessage, MessageType } from "../components/AuthMessage";
import { SignInWithGoogle, SignInWithCredentials, SignInWithMagicLink } from "@/services/auth.service";
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
          setMessage(getUserFriendlyMessage(result.error?.code));
          setLoading(false);
        }
      } catch (error: any) {
        setMessageType("error");
        setMessage(AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS);
        setLoading(false);
      }
    },
    [email, password, callbackUrl]
  );

  const handleGoogle = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      await SignInWithGoogle(callbackUrl);
    } catch (error: any) {
      setMessageType("error");
      setMessage(AUTH_MESSAGES.ERROR.GOOGLE_CONNECT_FAILED);
      setLoading(false);
    }
  }, [callbackUrl]);

  const handleMagic = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
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
          setMessage(AUTH_MESSAGES.ERROR.MAGIC_LINK_FAILED);
        }
      } catch (error: any) {
        setMessageType("error");
        setMessage(AUTH_MESSAGES.ERROR.GENERIC);
      }
      setLoading(false);
    },
    [magicEmail, callbackUrl]
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
            Tạo tài khoản mới
          </Link>
        </span>
      }
    >
      <AuthMessage message={message} type={messageType} onDismiss={clearMessage} />

      {/* Google OAuth Button */}
      <div className="space-y-4 mb-5">
        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          className="w-full h-11 flex items-center justify-center px-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-slate-800 dark:text-slate-100 font-bold border border-slate-200 dark:border-slate-700 shadow-sm rounded-xl transition-all cursor-pointer text-sm"
        >
          <NextImage
            src="/images/google-logo.png"
            alt="Google"
            width={18}
            height={18}
            className="mr-2.5 shrink-0"
          />
          <span>Tiếp tục với Google</span>
        </button>
      </div>

      {/* Divider */}
      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200 dark:border-slate-800" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white dark:bg-slate-900 px-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Hoặc đăng nhập với
          </span>
        </div>
      </div>

      {/* Login Method Toggle */}
      <div className="flex p-1 bg-slate-100 dark:bg-slate-950 rounded-xl mb-5 border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setLoginMethod("password")}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            loginMethod === "password"
              ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-700"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          Mật Khẩu
        </button>
        <button
          type="button"
          onClick={() => setLoginMethod("magiclink")}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            loginMethod === "magiclink"
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
              <Label className={labelClass} htmlFor="email">
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
              <Label className={labelClass} htmlFor="magic">
                Địa Chỉ Email
              </Label>
              <input
                id="magic"
                type="email"
                value={magicEmail}
                onChange={(e) => setMagicEmail(e.target.value)}
                required
                className={inputClass}
                placeholder="name@example.com"
              />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Chúng tôi sẽ gửi một liên kết đăng nhập trực tiếp không cần mật khẩu đến email của bạn.
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
