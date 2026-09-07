"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Zap,
  TrendingUp,
  ShieldCheck,
  Users,
  Bot,
  BarChart3,
  CheckSquare,
  Trophy,
  ArrowRight,
  Sparkles,
  Globe,
  Play,
  Flame,
  Lock,
  ChevronRight,
  Star,
  Cpu,
  Layers,
  Activity,
  Check,
  ArrowUpRight,
} from "lucide-react";
import ThemeToggle from "@/components/layout/ThemeToggle";

export default function LandingPage() {
  const { data: session, status } = useSession();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const stats = [
    { label: "Accounts Vận Hành", value: "2,500+", change: "+18% tháng này" },
    { label: "Lượt View Tạo Ra", value: "150M+", change: "30 ngày qua" },
    { label: "Doanh Thu Đạt Được", value: "$180,000+", change: "Creator Rewards" },
    { label: "Tỉ Lệ Chấm Công", value: "99.4%", change: "Hoàn thành KPI" },
  ];

  const features = [
    {
      icon: Users,
      title: "Quản Trị Dàn Account Quy Mô Lớn",
      desc: "Theo dõi trạng thái Live/Die, phân quyền nhân sự, gắn thẻ Group và quản lý hàng nghìn tài khoản TikTok US/UK/VN tập trung trên một giao diện duy nhất.",
      color: "from-cyan-500/20 to-blue-500/20 text-cyan-400 border-cyan-500/30",
    },
    {
      icon: Bot,
      title: "GPM-Login Hub Tự Động Hóa (Port 9495)",
      desc: "Kết nối trực tiếp local API GPM-Login. 1-click mở profile, tự động đồng bộ cookie, check fingerprint sạch và kiểm tra trạng thái login real-time.",
      color: "from-pink-500/20 to-rose-500/20 text-pink-400 border-pink-500/30",
    },
    {
      icon: CheckSquare,
      title: "Checklist Chấm Công & KPI Vận Hành",
      desc: "Tự động phân bổ ca làm việc, checklist đăng video hàng ngày trước 10:00 AM, tính điểm công chuẩn xác (1.0 - 0.5 - 0.0) và chống gian lận.",
      color: "from-emerald-500/20 to-teal-500/20 text-emerald-400 border-emerald-500/30",
    },
    {
      icon: BarChart3,
      title: "Phân Tích Doanh Thu & Biến Động RPM",
      desc: "Thống kê Creator Rewards Program và Affiliate chi tiết theo từng ngày, từng kênh. Biểu đồ trực quan giúp tối ưu RPM và phát hiện kênh tăng trưởng.",
      color: "from-amber-500/20 to-orange-500/20 text-amber-400 border-amber-500/30",
    },
    {
      icon: Trophy,
      title: "Bảng Xếp Hạng Leaderboard Nhân Sự",
      desc: "Vinh danh những Operator xuất sắc nhất tuần, tháng theo tỷ lệ hoàn thành checklist và tổng views/revenue đem lại cho Studio.",
      color: "from-purple-500/20 to-indigo-500/20 text-purple-400 border-purple-500/30",
    },
    {
      icon: ShieldCheck,
      title: "Hệ Thống Cảnh Báo Sớm & Audit Logs",
      desc: "Tự động phát hiện vi phạm bản quyền, gậy cộng đồng, lỗi checkpoint hoặc huỷ kiếm tiền giúp đội ngũ xử lý ngay lập tức.",
      color: "from-rose-500/20 to-red-500/20 text-rose-400 border-rose-500/30",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-pink-500 selection:text-white font-sans antialiased relative overflow-hidden">
      {/* Background Glowing Orbs & Grid */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[650px] overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-gradient-to-tr from-pink-600/30 via-purple-600/20 to-cyan-500/25 blur-[120px] rounded-full" />
        <div className="absolute top-[30%] left-[20%] w-[350px] h-[350px] bg-cyan-500/15 blur-[100px] rounded-full" />
        <div className="absolute top-[35%] right-[20%] w-[350px] h-[350px] bg-pink-500/15 blur-[100px] rounded-full" />
      </div>

      {/* Grid Pattern overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none -z-10" />

      {/* Navigation Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/80 border-b border-slate-800/80 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-pink-500 to-rose-500 p-0.5 shadow-lg shadow-pink-500/20 group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-slate-950 rounded-[9px] flex items-center justify-center">
                <Zap className="w-4 h-4 text-pink-400 fill-pink-400" />
              </div>
            </div>
            <div>
              <span className="font-black text-lg tracking-tight text-white">
                TIKTOK<span className="text-pink-500">FLOW</span>
              </span>
              <span className="hidden sm:inline-block ml-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 px-2 py-0.5 rounded-full bg-slate-800/60 border border-slate-700/50">
                Studio Enterprise
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
            <a href="#features" className="hover:text-pink-400 transition-colors">
              Tính Năng
            </a>
            <a href="#stats" className="hover:text-pink-400 transition-colors">
              Hiệu Quả
            </a>
            <a href="#automation" className="hover:text-pink-400 transition-colors">
              GPM-Login Hub
            </a>
            <a href="#workflow" className="hover:text-pink-400 transition-colors">
              Quy Trình
            </a>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {status === "authenticated" && session ? (
              <Link
                href="/accounts"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-pink-500 via-rose-500 to-cyan-500 hover:opacity-95 text-white shadow-lg shadow-pink-500/25 hover:shadow-pink-500/40 transition-all duration-200 group"
              >
                <span>Vào Dashboard</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            ) : (
              <>
                <Link
                  href="/signin"
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors"
                >
                  Đăng Nhập
                </Link>
                <Link
                  href="/signup"
                  className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white shadow-md shadow-pink-500/20 transition-all duration-200"
                >
                  <span>Bắt Đầu Ngay</span>
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-16 pb-20 md:pt-24 md:pb-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        {/* Top Tag Pill */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-700/80 shadow-inner mb-6 backdrop-blur-md">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-pink-500"></span>
          </span>
          <span className="text-xs font-semibold bg-gradient-to-r from-pink-300 via-purple-200 to-cyan-300 bg-clip-text text-transparent">
            Nền Tảng Tự Động Hóa Vận Hành TikTok Studio 2026
          </span>
        </div>

        {/* Hero Title */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight text-white max-w-5xl mx-auto leading-[1.15]">
          Quản Trị <span className="bg-gradient-to-r from-pink-500 via-rose-400 to-cyan-400 bg-clip-text text-transparent">Hàng Nghìn Kênh TikTok</span> Tối Ưu Doanh Thu & Vận Hành
        </h1>

        {/* Subtitle */}
        <p className="mt-6 text-lg sm:text-xl text-slate-400 max-w-3xl mx-auto leading-relaxed">
          Đột phá hiệu suất MMO TikTok Beta / Creator Rewards. Đồng bộ tự động với <strong>GPMLogin</strong>, chấm công checklist nhân sự, kiểm soát RPM và thống kê doanh thu realtime.
        </p>

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href={status === "authenticated" ? "/accounts" : "/signin"}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl text-base font-bold bg-gradient-to-r from-pink-500 via-rose-500 to-cyan-500 text-white shadow-xl shadow-pink-500/30 hover:shadow-pink-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 group"
          >
            <span>{status === "authenticated" ? "Truy Cập Dashboard" : "Bắt Đầu Sử Dụng Miễn Phí"}</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
          <a
            href="#features"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl text-base font-semibold bg-slate-900/90 text-slate-200 hover:text-white border border-slate-700/80 hover:border-slate-600 hover:bg-slate-800/80 transition-all duration-200 backdrop-blur-md"
          >
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>Khám Phá Tính Năng</span>
          </a>
        </div>

        {/* Fleet Preview Mockup Glass Card */}
        <div className="mt-14 relative rounded-3xl border border-slate-800 bg-slate-900/60 p-3 sm:p-5 shadow-2xl backdrop-blur-xl overflow-hidden">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-96 h-40 bg-pink-500/20 blur-[100px] rounded-full pointer-events-none" />
          
          {/* Mock Dashboard Topbar */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 px-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-rose-500/80" />
              <div className="w-3 h-3 rounded-full bg-amber-500/80" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
              <span className="text-xs text-slate-400 font-mono ml-2 hidden sm:inline">
                tiktokflow.studio/ops-control
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2.5 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>GPM-Login Hub: Online (Port 9495)</span>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mt-4 text-left">
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
              <div className="text-xs text-slate-400 font-medium">Tổng Tài Khoản Live</div>
              <div className="text-2xl font-black text-white mt-1">1,248 <span className="text-xs text-emerald-400 font-semibold">+14 hôm nay</span></div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full w-[94%]" />
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
              <div className="text-xs text-slate-400 font-medium">Doanh Thu 30 Ngày</div>
              <div className="text-2xl font-black text-cyan-400 mt-1">$42,850.20</div>
              <div className="text-xs text-slate-400 mt-2 font-mono">RPM trung bình: $0.82</div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
              <div className="text-xs text-slate-400 font-medium">Checklist Ca Sáng (10:00 AM)</div>
              <div className="text-2xl font-black text-pink-400 mt-1">98.2% <span className="text-xs text-slate-400 font-normal">đạt</span></div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
                <div className="bg-pink-500 h-full rounded-full w-[98%]" />
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
              <div className="text-xs text-slate-400 font-medium">Nhân Sự Trực Ca</div>
              <div className="text-2xl font-black text-amber-400 mt-1">16 / 18 <span className="text-xs text-emerald-400">Online</span></div>
              <div className="text-xs text-slate-400 mt-2">Leaderboard #1: @alex.tiktok</div>
            </div>
          </div>
        </div>
      </section>

      {/* Metrics Section */}
      <section id="stats" className="border-y border-slate-800/80 bg-slate-900/40 backdrop-blur-md py-14 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {stats.map((s, idx) => (
            <div key={idx} className="space-y-1">
              <div className="text-3xl sm:text-5xl font-black bg-gradient-to-r from-white via-slate-100 to-pink-300 bg-clip-text text-transparent">
                {s.value}
              </div>
              <div className="text-sm font-semibold text-slate-200">{s.label}</div>
              <div className="text-xs text-pink-400 font-medium">{s.change}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Core Features Grid */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-xs font-bold tracking-widest text-pink-500 uppercase">
            Giải Pháp Toàn Diện
          </h2>
          <p className="mt-3 text-3xl sm:text-4xl font-black text-white">
            Bộ Công Cụ Được Thiết Kế Riêng Cho TikTok Studio Vận Hành
          </p>
          <p className="mt-4 text-slate-400 text-base sm:text-lg">
            Giải quyết triệt để bài toán quên lịch đăng, nhầm lẫn profile, rò rỉ dữ liệu và thất thoát doanh thu.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, idx) => {
            const Icon = f.icon;
            return (
              <div
                key={idx}
                className="group relative p-7 rounded-3xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 hover:bg-slate-900/80 transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${f.color} border flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-white group-hover:text-pink-400 transition-colors">
                    {f.title}
                  </h3>
                  <p className="mt-3 text-sm text-slate-400 leading-relaxed">
                    {f.desc}
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center text-xs font-semibold text-slate-400 group-hover:text-cyan-400 transition-colors">
                  <span>Xem chi tiết module</span>
                  <ArrowUpRight className="w-3.5 h-3.5 ml-1 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* GPM-Login Hub Feature Spotlight */}
      <section id="automation" className="py-20 bg-gradient-to-b from-slate-900/60 to-slate-950 border-t border-slate-800 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 text-xs font-semibold mb-4">
              <Bot className="w-3.5 h-3.5" />
              <span>GPM-Login Integration Engine</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-white leading-tight">
              Tự Động Mở Trình Duyệt & Đồng Bộ Profile Chống Gậy Real-time
            </h2>
            <p className="mt-4 text-slate-400 text-base leading-relaxed">
              Không cần sao chép thủ công ID hoặc lo ngại nhầm lẫn proxy. Hệ thống kết nối thẳng vào cổng REST API nội bộ <strong>localhost:9495</strong> của GPM-Login để quản trị dàn profile mượt mà.
            </p>

            <div className="mt-6 space-y-3">
              {[
                "Tự động quét và import danh sách Profile từ GPM vào Dàn Account",
                "1-Click khởi động trình duyệt chống fingerprint detection",
                "Tự động trích xuất TikTok handle, followers, views và trạng thái login",
                "Hỗ trợ phân nhóm Group Name theo Team hoặc Country (US, UK, VN...)",
              ].map((text, i) => (
                <div key={i} className="flex items-start gap-3 text-sm text-slate-300">
                  <div className="mt-0.5 w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 text-emerald-400" />
                  </div>
                  <span>{text}</span>
                </div>
              ))}
            </div>

            <div className="mt-8">
              <Link
                href="/gpm"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold bg-cyan-500 hover:bg-cyan-600 text-slate-950 shadow-lg shadow-cyan-500/20 transition-all duration-200"
              >
                <span>Khám Phá GPM-Login Hub</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Terminal / Code mockup */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl font-mono text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-rose-500" />
                <span className="w-3 h-3 rounded-full bg-amber-500" />
                <span className="w-3 h-3 rounded-full bg-emerald-500" />
              </div>
              <span className="text-slate-500">gpm-sync-daemon.log</span>
            </div>
            <div className="mt-4 space-y-2 text-slate-300">
              <p className="text-emerald-400">
                [GPM-API] Connected to http://127.0.0.1:9495/api/v1 (Status: ONLINE)
              </p>
              <p className="text-cyan-400">
                [SCAN] Found 142 active profiles across 8 groups (US_CREATOR, UK_BETA...)
              </p>
              <p className="text-slate-400">
                &gt; Checking profile: 8a4c9f12 (Username: @lifestyle_daily_us)
              </p>
              <p className="text-slate-400">
                &gt; Browser Driver: Chrome 132.0.6834.110 (Fingerprint OK)
              </p>
              <p className="text-pink-400">
                [CHECKLIST] Auto-verified: Video #3 posted today at 09:42 AM
              </p>
              <p className="text-emerald-400">
                [REVENUE] Sync complete: Total Views: 1,480,200 | RPM: $0.79 | +$1,169.35
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Bottom Banner */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        <div className="relative rounded-3xl bg-gradient-to-r from-pink-900/40 via-purple-900/30 to-cyan-900/40 border border-pink-500/20 p-10 sm:p-16 overflow-hidden">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm -z-10" />
          <h2 className="text-3xl sm:text-5xl font-black text-white">
            Sẵn Sàng Nâng Tầm Vận Hành TikTok Studio?
          </h2>
          <p className="mt-4 text-slate-300 text-base sm:text-lg max-w-2xl mx-auto">
            Hệ thống hóa toàn bộ dàn kênh, kiểm soát nhân sự chặt chẽ và bứt phá doanh thu Creator Rewards ngay hôm nay.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
            <Link
              href={status === "authenticated" ? "/accounts" : "/signin"}
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl font-bold bg-gradient-to-r from-pink-500 via-rose-500 to-cyan-500 text-white shadow-xl shadow-pink-500/30 hover:shadow-pink-500/50 hover:scale-[1.02] transition-all duration-200"
            >
              <span>{status === "authenticated" ? "Truy Cập Dashboard" : "Đăng Nhập Vào Hệ Thống"}</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-pink-500 p-0.5">
              <div className="w-full h-full bg-slate-950 rounded flex items-center justify-center">
                <Zap className="w-3 h-3 text-pink-400" />
              </div>
            </div>
            <span className="font-bold text-slate-300">TIKTOKFLOW Automation</span>
            <span>&copy; {new Date().getFullYear()} All rights reserved.</span>
          </div>

          <div className="flex items-center gap-6 text-slate-400">
            <Link href="/privacy" className="hover:text-white transition-colors">
              Chính Sách Bảo Mật
            </Link>
            <Link href="/terms" className="hover:text-white transition-colors">
              Điều Khoản Dịch Vụ
            </Link>
            <Link href="/signin" className="hover:text-white transition-colors">
              Cổng Đăng Nhập
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
