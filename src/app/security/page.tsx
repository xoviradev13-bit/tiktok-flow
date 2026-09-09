"use client";

import React from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Lock,
  Key,
  Server,
  Eye,
  CheckCircle2,
  FileText,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Zap,
  Globe,
  Database,
  Cpu,
  RefreshCw,
} from "lucide-react";
import PublicHeader from "@/components/layout/PublicHeader";
import PublicFooter from "@/components/layout/PublicFooter";
import { useSession } from "next-auth/react";
import { APP_ROUTES } from "@/constants/routes.config";

export default function SecurityPage() {
  const { data: session } = useSession();

  const securityPillars = [
    {
      icon: Lock,
      title: "Mã Hóa Dữ Liệu Tiêu Chuẩn Doanh Nghiệp",
      desc: "Toàn bộ mật khẩu người dùng được băm bằng thuật toán Bcrypt 10 rounds với salt độc lập. Dữ liệu luân chuyển trên mạng được bảo vệ tuyệt đối bằng TLS 1.3 và cơ chế HSTS (Strict-Transport-Security).",
      tags: ["Bcrypt 10 Rounds", "TLS 1.3", "AES-256", "HSTS Enforced"],
    },
    {
      icon: ShieldCheck,
      title: "Phòng Thủ Toàn Diện OWASP Top 10",
      desc: "Hệ thống triển khai kiểm soát truy cập nghiêm ngặt (Role-Based Access Control), kiểm tra xác thực ở tầng Proxy Gateway Next.js 16, chống Path Traversal với regex validation và truy vấn an toàn qua Prisma ORM.",
      tags: ["Zero Broken Access Control", "Path Traversal Defense", "Anti-Injection", "CSRF Protection"],
    },
    {
      icon: Key,
      title: "Cơ Chế Khóa Token Định Danh Phân Lập",
      desc: "Extension và Client Agent giao tiếp thông qua Personal Token riêng biệt cho từng nhân sự (Scoped Tokens). Không bao giờ lưu trữ mật khẩu tài khoản TikTok trên hệ thống trung tâm.",
      tags: ["Personal Token", "Scoped Permissions", "No Plaintext Passwords", "Zero-Knowledge Storage"],
    },
    {
      icon: Server,
      title: "Bảo Mật Cơ Sở Dữ Liệu & Connection Pooling",
      desc: "Hệ thống kết nối cơ sở dữ liệu qua giao thức PgBouncer bảo mật với pooling connection độc lập, ngăn chặn connection saturation và hỗ trợ transaction isolation an toàn tuyệt đối.",
      tags: ["PgBouncer Pooling", "SSL Connection", "Automated Daily Backups", "DDoS Mitigation"],
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 selection:bg-pink-500 selection:text-white font-sans antialiased transition-colors duration-200">
      {/* Top Navbar */}
      <PublicHeader badge="Trust Center" />

      {/* Hero Section */}
      <section className="relative pt-16 pb-12 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold mb-6">
          <ShieldCheck className="w-4 h-4" />
          <span>Hệ Thống Đạt Chuẩn Bảo Mật Doanh Nghiệp & OWASP Top 10</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 dark:text-white leading-tight">
          Trung Tâm Bảo Mật & Tin Cậy <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-pink-600 via-purple-600 to-cyan-600 dark:from-pink-500 dark:via-purple-400 dark:to-cyan-400">
            TikTokFlow Trust Center
          </span>
        </h1>

        <p className="mt-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed font-medium">
          Cam kết bảo vệ dữ liệu dàn tài khoản, doanh thu TikTok Creator Rewards và thông tin cá nhân của bạn với các tiêu chuẩn mã hóa và bảo mật nghiêm ngặt nhất.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/docs"
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-md shadow-pink-600/20 transition-all"
          >
            <span>Xem Hướng Dẫn Vận Hành & Bảo Mật</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* 4 Pillars Grid */}
      <section className="py-10 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {securityPillars.map((p, idx) => {
            const Icon = p.icon;
            return (
              <div
                key={idx}
                className="p-6 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200/90 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 transition-all space-y-4 shadow-sm hover:shadow-md"
              >
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-pink-500/10 to-rose-500/10 text-pink-600 dark:text-pink-400 flex items-center justify-center border border-pink-500/20">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">{p.title}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{p.desc}</p>
                <div className="flex flex-wrap gap-2 pt-2">
                  {p.tags.map((tag, tIdx) => (
                    <span
                      key={tIdx}
                      className="px-2.5 py-1 rounded-lg text-xs font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Architecture Overview Section */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <div className="p-8 sm:p-12 rounded-3xl bg-white dark:bg-slate-900/60 border border-slate-200/90 dark:border-slate-800 shadow-md space-y-8">
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              Kiến Trúc Bảo Vệ Dữ Liệu Đa Tầng (Defense-in-Depth)
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Mỗi lớp kiến trúc trong TikTokFlow được thiết kế độc lập nhằm cô lập rủi ro và ngăn ngừa lây lan nếu có sự cố xảy ra.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 space-y-2">
              <div className="text-sm font-bold text-pink-600 dark:text-pink-400">1. Tầng Máy Trạm (Client Layer)</div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Extension và Client Agent chỉ giao tiếp với local GPMLogin qua cổng sandbox cục bộ. Không có bất kỳ lệnh can thiệp nào từ bên ngoài vào máy tính của bạn.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 space-y-2">
              <div className="text-sm font-bold text-purple-600 dark:text-purple-400">2. Tầng Cổng Truy Cập (Gateway)</div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Tất cả request được lọc qua Next.js 16 Gateway Proxy: kiểm tra JWT Session Token, chống giả mạo danh tính và rate limit chặn tấn công DDoS tự động.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 space-y-2">
              <div className="text-sm font-bold text-cyan-600 dark:text-cyan-400">3. Tầng Dữ Liệu (Database)</div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                PostgreSQL mã hóa tĩnh (Encryption-at-Rest) và mã hóa luân chuyển (In-Transit). Sao lưu tự động định kỳ mỗi ngày đảm bảo an toàn tuyệt đối.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Shared Public Footer */}
      <PublicFooter />
    </div>
  );
}
