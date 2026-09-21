"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useUrlParams } from "@/hooks/useUrlState";
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
  Ban,
  KeyRound,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StaffRequestModals } from "@/components/access-requests/StaffRequestModals";
import { toast } from "sonner";

const CATEGORIES = [
  { id: "ALL", label: "Tất cả" },
  { id: "AUTOMATION", label: "Tự động hóa (Automation)" },
  { id: "ANALYTICS", label: "Thống kê (Analytics)" },
  { id: "SCRAPER", label: "Thu thập dữ liệu (Scraper)" },
  { id: "UTILITY", label: "Tiện ích bổ trợ (Utility)" },
];

function ExtensionsListPageContent() {
  // SaaS URL Query State Synchronization
  const { searchParams, updateUrlParams } = useUrlParams();

  const initialSearch = searchParams?.get("q") || searchParams?.get("search") || "";
  const [search, setSearch] = useState(initialSearch);

  const initialCat = searchParams?.get("cat") || searchParams?.get("category") || "ALL";
  const [category, setCategory] = useState(initialCat);

  const paramSort = searchParams?.get("sort") || searchParams?.get("sortBy");
  const initialSort = ["name", "version", "createdAt"].includes(paramSort || "") ? (paramSort as any) : "createdAt";
  const [sortBy, setSortBy] = useState<"name" | "version" | "createdAt">(initialSort);

  const paramDir = searchParams?.get("dir") || searchParams?.get("sortOrder");
  const initialDir = paramDir === "asc" ? "asc" : "desc";
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(initialDir);

  // Auto sync active state to URL
  useEffect(() => {
    updateUrlParams(
      {
        cat: category,
        q: search,
        sort: sortBy,
        dir: sortOrder,
      },
      {
        cat: "ALL",
        q: "",
        sort: "createdAt",
        dir: "desc",
      }
    );
  }, [category, search, sortBy, sortOrder, updateUrlParams]);

  const { data: extensions = [], isLoading } = trpc.extension.list.useQuery({
    category,
    search,
    sortBy,
    sortOrder,
  });

  // User access state — one value applies to ALL extensions
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);
  const { data: meProfile } = trpc.user.me.useQuery(undefined, { staleTime: 60_000 });
  const isAccessRevoked = meProfile?.extensionAccessEnabled === false;
  const { data: pendingExtensionAccess, refetch: refetchExtensionAccess } =
    trpc.user.myExtensionAccessRequest.useQuery(undefined, {
      enabled: isAccessRevoked,
    });

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case "AUTOMATION":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 whitespace-nowrap shrink-0">
            <Zap className="w-3 h-3 shrink-0" /> Tự động hóa
          </span>
        );
      case "ANALYTICS":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 whitespace-nowrap shrink-0">
            <Sparkles className="w-3 h-3 shrink-0" /> Thống kê
          </span>
        );
      case "SCRAPER":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 whitespace-nowrap shrink-0">
            <Layers className="w-3 h-3 shrink-0" /> Scraper
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20 whitespace-nowrap shrink-0">
            <Puzzle className="w-3 h-3 shrink-0" /> Tiện ích
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 w-full pb-24 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5 min-w-0">
            <Puzzle className="w-6 h-6 text-pink-500 shrink-0" />
            <span className="truncate">Kho Tiện Ích & Extensions</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
            Trên mỗi máy tính, cài cả Extension và Client Agent để đồng bộ tự động tài khoản và số liệu TikTok về hệ thống.
          </p>
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
              className={`rounded-3xl p-5 shadow-sm transition-all flex flex-col justify-between group ${
                isAccessRevoked
                  ? "bg-white dark:bg-slate-900/80 border border-rose-200/60 dark:border-rose-900/40 hover:border-rose-300/80 dark:hover:border-rose-800/60 hover:shadow-xl hover:shadow-rose-500/5"
                  : "bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 hover:border-pink-500/40 hover:shadow-xl hover:shadow-pink-500/5"
              }`}
            >
              <div className="space-y-3.5">
                {/* Top Badge & Version */}
                <div className="flex items-center justify-between gap-2">
                  {getCategoryBadge(ext.category)}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isAccessRevoked && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 whitespace-nowrap">
                        <Ban className="w-3 h-3 shrink-0" />
                        Bị khóa
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-lg text-xs font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 whitespace-nowrap">
                      v{ext.version}
                    </span>
                  </div>
                </div>

                {/* Icon & Title */}
                <div className="flex items-start gap-3 pt-1">
                  <div className={`w-12 h-12 rounded-2xl ${
                    isAccessRevoked
                      ? "bg-slate-100 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/50 text-slate-400"
                      : ext.slug === "tiktokflow-client-agent" || ext.category === "SCRAPER"
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
                    <h3 className={`text-base font-bold truncate transition-colors ${
                      isAccessRevoked
                        ? "text-slate-500 dark:text-slate-400"
                        : "text-slate-900 dark:text-white group-hover:text-pink-600 dark:group-hover:text-pink-400"
                    }`}>
                      {ext.name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Phát triển bởi <span className="font-semibold text-slate-700 dark:text-slate-300">{ext.author}</span>
                    </p>
                  </div>
                </div>

                {/* Description */}
                <p className={`text-xs leading-relaxed line-clamp-3 ${
                  isAccessRevoked ? "text-slate-400 dark:text-slate-500" : "text-slate-600 dark:text-slate-300"
                }`}>
                  {ext.shortDesc || ext.description || "Tiện ích mở rộng chính thức cho hệ sinh thái TikTokFlow."}
                </p>

                {/* Supported Browsers */}
                {ext.supportedBrowsers && ext.supportedBrowsers.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 pt-1">
                    <div className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400 shrink-0 font-medium">
                      <Laptop className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="whitespace-nowrap">Hỗ trợ:</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {ext.supportedBrowsers.map((b: string) => (
                        <span
                          key={b}
                          className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60 whitespace-nowrap"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800/80 space-y-2.5">
                {/* Revoked access warning row */}
                {isAccessRevoked && (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/40">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Ban className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 truncate">
                        Admin đã khóa quyền truy cập
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={!!pendingExtensionAccess}
                      onClick={() => setExtensionModalOpen(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 border transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed border-rose-300 dark:border-rose-700/60 text-rose-700 dark:text-rose-300 bg-white dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/40"
                    >
                      <KeyRound className="w-3 h-3 shrink-0" />
                      {pendingExtensionAccess ? "Đã gửi yêu cầu" : "Yêu cầu kích hoạt"}
                    </button>
                  </div>
                )}

                {/* Bottom row: detail link + download */}
                <div className="flex items-center gap-2">
                  <Link
                    href={`/extensions/${ext.slug || ext.id}`}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isAccessRevoked
                        ? "bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"
                        : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200"
                    }`}
                  >
                    <span>Chi Tiết & Cài Đặt</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>

                  <Tooltip delayDuration={150}>
                    <TooltipTrigger asChild>
                      <a
                        href={
                          ext.slug === "tiktokflow-client-agent" || ext.folderPath === "client-agent"
                            ? "/api/client-agent/download"
                            : "/api/extension/download"
                        }
                        download
                        aria-label="Tải bản cài đặt"
                        className={`p-2.5 rounded-xl ${
                          ext.slug === "tiktokflow-client-agent"
                            ? "bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 shadow-indigo-600/20"
                            : "bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 shadow-pink-600/20"
                        } text-white shadow-md active:scale-95 transition-all cursor-pointer shrink-0`}
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs font-semibold max-w-xs text-center">
                      {ext.slug === "tiktokflow-client-agent"
                        ? "Tải Client Agent (.zip) với mã pairing"
                        : "Tải Extension (.zip) với mã pairing"}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Access request modal — shared across all cards */}
      <StaffRequestModals
        machineModalOpen={false}
        onMachineModalOpenChange={() => {}}
        extensionModalOpen={extensionModalOpen}
        onExtensionModalOpenChange={setExtensionModalOpen}
        onMachineSuccess={() => {}}
        onExtensionSuccess={() => {
          refetchExtensionAccess();
          toast.success("Đã gửi yêu cầu kích hoạt Extension. Chờ admin duyệt.");
        }}
      />
    </div>
  );
}

export default function ExtensionsListPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400 text-xs">Đang tải extensions...</div>}>
      <ExtensionsListPageContent />
    </Suspense>
  );
}
