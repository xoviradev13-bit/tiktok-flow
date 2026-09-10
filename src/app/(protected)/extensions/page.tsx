"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Puzzle,
  Search,
  Filter,
  SlidersHorizontal,
  Download,
  CheckCircle2,
  ExternalLink,
  Zap,
  ShieldCheck,
  Layers,
  Sparkles,
  ArrowRight,
  Clock,
  Laptop,
  Bot,
  Terminal,
  Cpu,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CATEGORIES = [
  { id: "ALL", label: "Tất cả" },
  { id: "AUTOMATION", label: "Tự động hóa (Automation)" },
  { id: "ANALYTICS", label: "Thống kê (Analytics)" },
  { id: "SCRAPER", label: "Thu thập dữ liệu (Scraper)" },
  { id: "UTILITY", label: "Tiện ích bổ trợ (Utility)" },
];

export default function ExtensionsListPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [sortBy, setSortBy] = useState<"name" | "version" | "createdAt">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const { data: extensions = [], isLoading } = trpc.extension.list.useQuery({
    category,
    search,
    sortBy,
    sortOrder,
  });

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case "AUTOMATION":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20">
            <Zap className="w-3 h-3" /> Tự động hóa
          </span>
        );
      case "ANALYTICS":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
            <Sparkles className="w-3 h-3" /> Thống kê
          </span>
        );
      case "SCRAPER":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            <Layers className="w-3 h-3" /> Scraper
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
            <Puzzle className="w-3 h-3" /> Tiện ích
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 w-full pb-24 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-pink-600 dark:text-pink-400 uppercase tracking-wider mb-1">
            <Puzzle className="w-4 h-4" />
            <span>Kho Tiện Ích Mở Rộng (Extension Directory)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            TikTokFlow Extensions & Plugins
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Tải và quản lý các tiện ích mở rộng Chrome/Chromium chính thức hỗ trợ đồng bộ GPMLogin, tự động phát hiện tài khoản TikTok và ghi nhận chấm công.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <Link
            href="/accounts"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
          >
            <span>Dàn Account</span>
          </Link>
        </div>
      </div>

      {/* Featured: TikTokFlow Client Agent for Member Machines */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-7 shadow-xl border border-indigo-500/20">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              <Bot className="w-3.5 h-3.5 text-indigo-400" />
              <span>Dành Cho Máy Trạm Nhân Viên (Máy A, B, C...)</span>
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              TikTokFlow Client Agent (Deep Sweeper Windows)
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Phần mềm cào số liệu chuyên sâu TikTok Studio (Lượt xem, Doanh thu quỹ, TikTok Shop, RPM, Top Video) chạy trực tiếp trên máy của bạn.
              <span className="font-semibold text-emerald-400"> 100% Vô hình, tự động snapshot cách ly, không cướp chuột và cào được ngay cả khi tắt profile.</span>
            </p>

            {/* Feature Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
              <div className="flex items-center gap-2 text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Zip kèm mã pairing dùng 1 lần (~10 phút)</span>
              </div>
              <div className="flex items-center gap-2 text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>1-Click chạy ngay với <code className="text-cyan-300 bg-cyan-950/60 px-1 rounded">run-agent.bat</code></span>
              </div>
              <div className="flex items-center gap-2 text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                <span>Hẹn giờ tự động với Task Scheduler</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5 shrink-0">
            <a
              href="/api/client-agent/download"
              download
              className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl text-xs sm:text-sm font-bold bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-500/25 active:scale-98 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Tải Client Agent (.zip)</span>
            </a>

            <Link
              href="/extensions/tiktokflow-client-agent"
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 transition-all cursor-pointer"
            >
              <span>Xem Hướng Dẫn & Chi Tiết</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>

            <div className="text-xs text-center text-slate-400">
              Định dạng .zip ~50KB • Cấu hình tự động
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          {/* Search Input */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm tiện ích..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-4 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-pink-500 transition-all"
            />
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Sắp xếp:</span>
            </div>
            <Select
              value={`${sortBy}-${sortOrder}`}
              onValueChange={(val) => {
                const [sb, so] = val.split("-");
                setSortBy(sb as any);
                setSortOrder(so as any);
              }}
            >
              <SelectTrigger className="w-44 h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 cursor-pointer shadow-none">
                <SelectValue placeholder="Sắp xếp theo" />
              </SelectTrigger>
              <SelectContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
                <SelectItem value="createdAt-desc" className="text-xs cursor-pointer">Mới nhất trước</SelectItem>
                <SelectItem value="createdAt-asc" className="text-xs cursor-pointer">Cũ nhất trước</SelectItem>
                <SelectItem value="name-asc" className="text-xs cursor-pointer">Tên (A-Z)</SelectItem>
                <SelectItem value="name-desc" className="text-xs cursor-pointer">Tên (Z-A)</SelectItem>
                <SelectItem value="version-desc" className="text-xs cursor-pointer">Phiên bản cao nhất</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                category === cat.id
                  ? "bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-md shadow-pink-600/25"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Extension Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 space-y-4 shadow-xs flex flex-col justify-between animate-pulse"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-5 w-24 rounded-full bg-slate-200 dark:bg-slate-800" />
                  <div className="h-5 w-12 rounded-md bg-slate-200 dark:bg-slate-800" />
                </div>
                <div className="flex items-start gap-3 pt-1">
                  <div className="w-12 h-12 rounded-2xl bg-slate-200 dark:bg-slate-800 shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-3 w-44 rounded bg-slate-200 dark:bg-slate-800" />
                  </div>
                </div>
                <div className="h-3.5 w-full rounded bg-slate-200 dark:bg-slate-800" />
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-8 w-24 rounded-xl bg-slate-200 dark:bg-slate-800" />
              </div>
            </div>
          ))}
        </div>
      ) : extensions.length === 0 ? (
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-pink-500/10 text-pink-500 flex items-center justify-center mx-auto mb-4">
            <Puzzle className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Không tìm thấy tiện ích nào
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            Không có extension nào phù hợp với từ khóa &quot;{search}&quot; hoặc danh mục đang chọn.
          </p>
          <button
            onClick={() => {
              setSearch("");
              setCategory("ALL");
            }}
            className="mt-4 px-4 py-2 rounded-xl text-xs font-bold bg-pink-600 text-white shadow-md cursor-pointer hover:bg-pink-500 transition-colors"
          >
            Xóa bộ lọc
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {extensions.map((ext: any) => (
            <div
              key={ext.id}
              className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 hover:border-pink-500/40 rounded-3xl p-5 shadow-sm hover:shadow-xl hover:shadow-pink-500/5 transition-all flex flex-col justify-between group"
            >
              <div className="space-y-3.5">
                {/* Top Badge & Version */}
                <div className="flex items-center justify-between gap-2">
                  {getCategoryBadge(ext.category)}
                  <span className="px-2 py-0.5 rounded-lg text-xs font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                    v{ext.version}
                  </span>
                </div>

                {/* Icon & Title */}
                <div className="flex items-start gap-3 pt-1">
                  <div className={`w-12 h-12 rounded-2xl ${
                    ext.slug === "tiktokflow-client-agent" || ext.category === "SCRAPER"
                      ? "bg-gradient-to-tr from-indigo-500/20 via-purple-500/20 to-cyan-500/20 border border-indigo-500/30 text-indigo-400"
                      : "bg-gradient-to-tr from-pink-500/20 via-purple-500/20 to-cyan-500/20 border border-pink-500/30 text-pink-600 dark:text-pink-400"
                  } flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-xs`}>
                    {ext.slug === "tiktokflow-client-agent" || ext.category === "SCRAPER" ? (
                      <Bot className="w-6 h-6" />
                    ) : (
                      <Puzzle className="w-6 h-6" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white truncate group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors">
                      {ext.name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Phát triển bởi <span className="font-semibold text-slate-700 dark:text-slate-300">{ext.author}</span>
                    </p>
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">
                  {ext.shortDesc || ext.description || "Tiện ích mở rộng chính thức cho hệ sinh thái TikTokFlow."}
                </p>

                {/* Supported Browsers */}
                {ext.supportedBrowsers && ext.supportedBrowsers.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 pt-1">
                    <Laptop className="w-3.5 h-3.5 text-slate-400" />
                    <span>Hỗ trợ:</span>
                    <div className="flex items-center gap-1">
                      {ext.supportedBrowsers.map((b: string) => (
                        <span key={b} className="font-medium text-slate-700 dark:text-slate-300">
                          {b},
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-5 mt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-2">
                <Link
                  href={`/extensions/${ext.slug || ext.id}`}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-all cursor-pointer"
                >
                  <span>Chi Tiết & Cài Đặt</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>

                <a
                  href={
                    ext.slug === "tiktokflow-client-agent" || ext.folderPath === "client-agent"
                      ? "/api/client-agent/download"
                      : "/api/extension/download"
                  }
                  download
                  title={
                    ext.slug === "tiktokflow-client-agent"
                      ? "Tải Client Agent (.zip) với mã pairing dùng 1 lần (~10 phút)"
                      : "Tải Extension (.zip) với mã pairing dùng 1 lần (~10 phút)"
                  }
                  className={`p-2.5 rounded-xl ${
                    ext.slug === "tiktokflow-client-agent"
                      ? "bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 shadow-indigo-600/20"
                      : "bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 shadow-pink-600/20"
                  } text-white shadow-md active:scale-95 transition-all cursor-pointer shrink-0`}
                >
                  <Download className="w-4 h-4" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
