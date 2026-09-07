"use client";
import React, { useState, useCallback, useEffect } from "react";
import NextImage from "next/image";
import { ArrowRight, Check, X, Eye, EyeOff } from "lucide-react";
import { Label } from "@/components/ui/label";
import { AuthMessage, MessageType } from "../components/AuthMessage";
import { SignInWithGoogle, RegisterUser } from "@/services/auth.service";
import { AuthContainer } from "../components/AuthContainer";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AUTH_MESSAGES, getUserFriendlyMessage } from "../constants/authMessages";
import { validateCallbackUrl } from "../helpers/authHelpers";

export const RegisterView = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawCallbackUrl = searchParams?.get("callbackUrl");
  const callbackUrl = validateCallbackUrl(rawCallbackUrl);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("error");
  const [showPassword, setShowPassword] = useState(false);
  const [touchedPassword, setTouchedPassword] = useState(false);
  const [isInviteFlow, setIsInviteFlow] = useState(false);

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
              setMessageType("info");
              setMessage(`Đăng ký tài khoản cho email được mời: ${data.email}`);
            }
          })
          .catch(() => {});
      }
    }
  }, [rawCallbackUrl]);

  // Validation States
  const validations = {
    hasMinLength: password.length >= 8,
    hasUpperCase: /[A-Z]/.test(password),
    hasLowerCase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
  };

  const isPasswordValid = Object.values(validations).every(Boolean);

  const inputClass =
    "h-11 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all rounded-xl text-sm px-3.5 w-full";
  const labelClass = "text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block";

  const clearMessage = useCallback(() => {
    setMessage("");
  }, []);

  const handleRegister = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setTouchedPassword(true);

      if (!name.trim()) {
        setMessageType("warning");
        setMessage("Vui lòng nhập họ và tên hoặc username.");
        return;
      }

      if (!isPasswordValid) {
        setMessageType("warning");
        setMessage(AUTH_MESSAGES.WARNING.WEAK_PASSWORD);
        return;
      }

      setLoading(true);
      setMessage("");

      try {
        const result = await RegisterUser(email, password, name, callbackUrl);

        if (result.success) {
          setMessageType("success");
          setMessage(AUTH_MESSAGES.SUCCESS.REGISTER);
          setTimeout(() => {
            const verifyUrl = `/auth/verify-request?type=register&email=${encodeURIComponent(
              email
            )}`;
            const urlWithCallback =
              callbackUrl !== "/"
                ? `${verifyUrl}&callbackUrl=${encodeURIComponent(callbackUrl)}`
                : verifyUrl;
            window.location.href = urlWithCallback;
          }, 500);
        } else {
          setMessageType("error");
          setMessage(
            getUserFriendlyMessage(
              result.error?.code,
              AUTH_MESSAGES.ERROR.REGISTRATION_FAILED
            )
          );
          setLoading(false);
        }
      } catch (error: any) {
        setMessageType("error");
        setMessage(
          getUserFriendlyMessage(
            error.message,
            AUTH_MESSAGES.ERROR.REGISTRATION_FAILED
          )
        );
        setLoading(false);
      }
    },
    [email, password, name, isPasswordValid, callbackUrl]
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

  return (
    <AuthContainer
      title="Tạo Tài Khoản TIKTOKFLOW"
      subtitle={
        <span className="flex items-center gap-1.5 flex-wrap">
          <span>Đã có tài khoản?</span>
          <Link
            href={
              rawCallbackUrl
                ? `/signin?callbackUrl=${encodeURIComponent(rawCallbackUrl)}`
                : "/signin"
            }
            className="font-bold text-pink-600 dark:text-pink-400 hover:underline transition-all"
          >
            Đăng nhập ngay
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
          <span>Đăng ký với Google</span>
        </button>
      </div>

      {/* Divider */}
      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200 dark:border-slate-800" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white dark:bg-slate-900 px-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Hoặc đăng ký bằng Email
          </span>
        </div>
      </div>

      <form onSubmit={handleRegister} className="space-y-4">
        <div>
          <Label htmlFor="name" className={labelClass}>
            Tên người dùng
          </Label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className={inputClass}
            placeholder="Ví dụ: Hoàng Minh / @hoangminh"
          />
        </div>

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

        <div>
          <Label htmlFor="password" className={labelClass}>
            Mật Khẩu (Tối thiểu 8 ký tự)
          </Label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (!touchedPassword) setTouchedPassword(true);
              }}
              required
              className={`${inputClass} pr-10 ${touchedPassword && !isPasswordValid
                ? "border-rose-400 focus:border-rose-400 focus:ring-rose-200"
                : ""
                }`}
              placeholder="Nhập mật khẩu an toàn..."
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

        <div className="flex items-start gap-2.5 mt-2">
          <div className="h-5 flex items-center">
            <input
              type="checkbox"
              id="terms"
              required
              className="h-4 w-4 accent-pink-500 rounded cursor-pointer"
            />
          </div>
          <Label
            htmlFor="terms"
            className="text-slate-600 dark:text-slate-400 font-normal text-xs leading-relaxed"
          >
            Tôi đồng ý với{" "}
            <Link href="/terms" className="text-pink-600 dark:text-pink-400 underline font-semibold">
              Điều Khoản Dịch Vụ
            </Link>{" "}
            và{" "}
            <Link href="/privacy" className="text-pink-600 dark:text-pink-400 underline font-semibold">
              Chính Sách Bảo Mật
            </Link>
            .
          </Label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full h-11 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold rounded-xl shadow-lg shadow-pink-600/30 transition-all duration-200 text-sm flex items-center justify-center gap-2 cursor-pointer mt-3 disabled:opacity-60"
        >
          <span>{loading ? "Đang tạo tài khoản..." : "Tạo Tài Khoản"}</span>
          {!loading && <ArrowRight className="w-4 h-4" />}
        </button>
      </form>
    </AuthContainer>
  );
};
