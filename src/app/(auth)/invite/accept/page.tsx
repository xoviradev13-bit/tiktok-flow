"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { Loader2, CheckCircle, XCircle, LogIn, UserPlus, ArrowRight, ShieldCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/useToast";
import { permissionsService } from "@/services/permissions.service";

function AcceptInvitationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status: sessionStatus, update: updateSession } = useSession();
  const { toast } = useToast();
  const token = searchParams?.get("token");

  const [status, setStatus] = useState<
    "loading" | "success" | "error" | "auth-required" | "wrong-account"
  >("loading");
  const [message, setMessage] = useState("Đang xác thực thư mời...");
  const [redirectUrl, setRedirectUrl] = useState<string>("/accounts");
  const [actionLabel, setActionLabel] = useState<string>("Truy Cập Hệ Thống");
  const [wrongAccountEmail, setWrongAccountEmail] = useState<string | null>(null);

  const [invitePreview, setInvitePreview] = useState<{
    email?: string;
    role?: string;
    groupName?: string | null;
    inviterName?: string;
    status?: string;
  } | null>(null);

  // Guard so the acceptance API call only fires once
  const hasAttemptedRef = useRef(false);

  // Fetch invitation preview
  useEffect(() => {
    if (!token) return;
    fetch(`/api/invitations/accept?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.email) {
          setInvitePreview(data);
          if (data.status === "EXPIRED") {
            setStatus("error");
            setMessage("Lời mời này đã hết hạn. Vui lòng liên hệ Quản trị viên để nhận mã mời mới.");
          } else if (data.status === "REVOKED") {
            setStatus("error");
            setMessage("Lời mời này đã bị hủy bỏ bởi Quản trị viên.");
          }
        } else if (data.message) {
          setStatus("error");
          setMessage(data.message);
        }
      })
      .catch(() => { });
  }, [token]);

  useEffect(() => {
    // If no token, show error immediately
    if (!token) {
      setStatus("error");
      setMessage("Liên kết mời không hợp lệ hoặc thiếu mã xác thực token.");
      return;
    }

    if (hasAttemptedRef.current) return;

    // Wait for session to load
    if (sessionStatus === "loading") {
      setStatus("loading");
      setMessage("Đang kiểm tra trạng thái đăng nhập...");
      return;
    }

    // If not authenticated, prompt user to login or sign up
    if (sessionStatus === "unauthenticated") {
      setStatus("auth-required");
      setMessage("Vui lòng đăng nhập hoặc tạo tài khoản để chấp nhận lời mời này.");
      return;
    }

    // If authenticated, proceed with acceptance
    if (sessionStatus === "authenticated" && session) {
      hasAttemptedRef.current = true;
      acceptInvitation();
    }
  }, [token, session, sessionStatus]);

  const acceptInvitation = async () => {
    if (!token) return;

    setStatus("loading");
    setMessage("Đang kích hoạt và gán quyền tài khoản...");

    try {
      const response = await permissionsService.invitations.accept({ token }, session);
      const data = await response.json();

      if (!response.ok) {
        // 403 = wrong account — extract the invited email and show switch account UI
        if (response.status === 403) {
          const backendMsg: string = data.message || "";
          const emailMatch = backendMsg.match(/for ([\w.+%-]+@[\w.-]+\.[a-z]{2,})/i);
          setWrongAccountEmail(data.targetEmail || emailMatch?.[1] || invitePreview?.email || null);
          setStatus("wrong-account");
          return;
        }
        throw new Error(data.message || "Không thể kích hoạt lời mời.");
      }

      // Refresh session
      if (updateSession) {
        await updateSession().catch(() => { });
      }

      const targetUrl = "/accounts";
      setRedirectUrl(targetUrl);
      setActionLabel("Truy Cập Hệ Thống");
      setStatus("success");
      setMessage(
        data.alreadyAccepted
          ? "Bạn đã tham gia hệ thống thành công! Đang chuyển hướng..."
          : "Kích hoạt thành viên thành công! Đang chuyển hướng..."
      );

      toast({
        title: "Thành công!",
        description: "Bạn đã tham gia hệ thống TIKTOKFLOW thành công.",
      });

      setTimeout(() => {
        window.location.href = targetUrl;
      }, 1500);
    } catch (error: any) {
      console.error("Accept error:", error);
      setStatus("error");
      setMessage(error.message || "Đã xảy ra lỗi trong quá trình kích hoạt.");

      toast({
        variant: "destructive",
        title: "Lỗi kích hoạt",
        description: error.message || "Không thể chấp nhận lời mời.",
      });
    }
  };

  const handleLoginRedirect = () => {
    const callbackUrl = `/invite/accept?token=${token}`;
    router.push(`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  };

  const handleSignUpRedirect = () => {
    const callbackUrl = `/invite/accept?token=${token}`;
    router.push(`/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  };

  const handleSwitchAccount = async () => {
    const callbackUrl = `/invite/accept?token=${token}`;
    await signOut({ redirect: false });
    window.location.href = `/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 sm:p-8 transition-colors">
      {/* Brand Header */}
      <div className="mb-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-pink-500 to-rose-500 p-0.5 shadow-lg shadow-pink-500/25">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <span className="text-white font-black text-base tracking-tight">TTF</span>
            </div>
          </div>
          <span className="font-black text-2xl tracking-tight text-slate-900 dark:text-white">
            TIKTOK<span className="text-pink-500">FLOW</span>
          </span>
        </Link>
      </div>

      <Card className="w-full max-w-lg shadow-2xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 rounded-2xl backdrop-blur-xl">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Xác Nhận Thư Mời Tham Gia
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Hệ thống quản trị và vận hành TikTok Operations
          </CardDescription>
        </CardHeader>

        <CardContent className="flex min-h-[300px] flex-col items-center justify-center p-6 sm:p-8">
          {/* Loading */}
          {status === "loading" && (
            <div className="flex flex-col items-center gap-4 text-center py-6">
              <div className="w-16 h-16 rounded-2xl bg-pink-500/10 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-base">Đang xử lý...</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{message}</p>
              </div>
            </div>
          )}

          {/* Auth Required (Login or Sign up) */}
          {status === "auth-required" && (
            <div className="flex flex-col items-center gap-4 text-center w-full">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-pink-500/20 to-rose-500/20 text-pink-600 dark:text-pink-400 flex items-center justify-center ring-8 ring-pink-500/5">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <div className="space-y-1.5 max-w-sm">
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  Yêu Cầu Xác Thực Tài Khoản
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Bạn cần đăng nhập bằng chính địa chỉ email đã nhận thư mời để hoàn tất quá trình tham gia hệ thống.
                </p>
              </div>

              {/* Preview Invite Details Card */}
              {invitePreview?.email && (
                <div className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-left space-y-1.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Email được mời:</span>
                    <span className="font-bold text-slate-900 dark:text-white">{invitePreview.email}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Vai trò:</span>
                    <span className="font-bold text-pink-600 dark:text-pink-400">{invitePreview.role || "STAFF"}</span>
                  </div>
                  {invitePreview.groupName && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">Nhóm / Team:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{invitePreview.groupName}</span>
                    </div>
                  )}
                  {invitePreview.inviterName && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">Người mời:</span>
                      <span className="text-slate-700 dark:text-slate-300">{invitePreview.inviterName}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="w-full space-y-2.5 mt-2">
                <Button
                  onClick={handleLoginRedirect}
                  className="w-full h-11 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold rounded-xl shadow-lg shadow-pink-600/25 transition-all text-xs cursor-pointer"
                >
                  <LogIn className="mr-2 h-4 w-4" />
                  Đăng Nhập Để Chấp Nhận
                </Button>

                <Button
                  onClick={handleSignUpRedirect}
                  variant="outline"
                  className="w-full h-11 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold rounded-xl transition-all text-xs cursor-pointer"
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Chưa Có Tài Khoản? Đăng Ký Ngay
                </Button>
              </div>
            </div>
          )}

          {/* Success */}
          {status === "success" && (
            <div className="flex flex-col items-center gap-4 text-center py-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center ring-8 ring-emerald-500/5">
                <CheckCircle className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                  Tham Gia Thành Công!
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">{message}</p>
              </div>
              <Button
                onClick={() => (window.location.href = redirectUrl)}
                className="mt-2 h-10 px-6 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold rounded-xl shadow-md text-xs cursor-pointer"
              >
                <span>{actionLabel}</span>
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Wrong Account */}
          {status === "wrong-account" && (
            <div className="flex flex-col items-center gap-4 text-center w-full">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center ring-8 ring-amber-500/5">
                <LogIn className="h-8 w-8" />
              </div>
              <div className="space-y-2 max-w-sm">
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  Đang Mở Nhầm Thư Mời
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Liên kết này được cấp riêng cho địa chỉ:
                </p>
                <div className="p-2.5 rounded-xl bg-pink-50 dark:bg-pink-950/40 border border-pink-200 dark:border-pink-800 text-xs font-bold text-pink-700 dark:text-pink-300 font-mono break-all">
                  {wrongAccountEmail || "email được mời"}
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Bạn đang đăng nhập bằng: <span className="font-bold text-slate-700 dark:text-slate-300">{session?.user?.email}</span>
                </p>
              </div>

              <div className="w-full space-y-2.5 mt-2">
                <Button
                  onClick={handleSwitchAccount}
                  className="w-full h-11 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold rounded-xl shadow-md text-xs cursor-pointer"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Đăng Xuất & Đổi Sang {wrongAccountEmail || "Email Được Mời"}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => router.push("/signin")}
                  className="w-full h-11 border-slate-200 dark:border-slate-800 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Về Trang Đăng Nhập
                </Button>
              </div>
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="flex flex-col items-center gap-4 text-center w-full py-4">
              <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center ring-8 ring-rose-500/5">
                <XCircle className="h-8 w-8" />
              </div>
              <div className="space-y-1.5 max-w-sm">
                <h3 className="text-lg font-black text-rose-600 dark:text-rose-400">
                  Không Thể Chấp Nhận Lời Mời
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{message}</p>
              </div>
              <div className="flex gap-2.5 w-full mt-3">
                <Button
                  variant="outline"
                  onClick={() => router.push("/signin")}
                  className="flex-1 h-10 border-slate-200 dark:border-slate-800 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Về Trang Đăng Nhập
                </Button>
                <Button
                  onClick={handleSwitchAccount}
                  className="flex-1 h-10 bg-gradient-to-r from-pink-600 to-rose-600 text-white text-xs font-bold rounded-xl cursor-pointer"
                >
                  Đổi Tài Khoản Khác
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-slate-950">
          <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
        </div>
      }
    >
      <AcceptInvitationContent />
    </Suspense>
  );
}
