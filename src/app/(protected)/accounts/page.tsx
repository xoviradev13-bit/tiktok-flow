"use client";

import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useUrlParams } from "@/hooks/useUrlState";
import {
  Users,
  Search,
  Filter,
  Plus,
  RefreshCw,
  Play,
  History,
  AlertTriangle,
  ExternalLink,
  Shield,
  CheckCircle,
  XCircle,
  Flame,
  PauseCircle,
  Trash2,
  Pencil,
  X,
  SlidersHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  UserCheck,
  Check,
  Eye,
  Globe,
  MoreHorizontal,
  Copy,
  Columns3,
  LayoutGrid,
  List,
  DollarSign,
  Video,
  Lock,
  Unlock,
  Square,
  Sparkles,
  RotateCcw,
  AlertOctagon,
  ArchiveRestore,
  Info,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { TeamScopeBanner } from "@/components/team/TeamScopeBanner";
import { Pagination } from "@/components/ui/pagination";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { launchGpmProfile } from "@/lib/gpm-client-bridge";
import { useQueryClient } from "@tanstack/react-query";
import {
  optimisticallyUpdateAccount,
  optimisticallyBulkUpdateAccounts,
  optimisticallyDeleteAccounts,
  optimisticallyRestoreAccounts,
  snapshotAccountQueries,
  rollbackAccountQueries,
} from "@/utils/optimisticAccounts";
import {
  getAccountRevenuePeriods,
  resolveAllTimeRevenue,
  resolvePeriodRevenue,
  resolveThisMonthRevenue,
} from "@/lib/resolve-all-time-revenue";
import { getAccountViewsPeriods } from "@/lib/daily-views-breakdown";
import { OnlineOfflineBadge } from "@/components/ui/status-badge";
import { SyncStatusBadge, hasAccountSyncIssue } from "@/components/common/SyncStatusBadge";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useTableColumnResize } from "@/hooks/useTableColumnResize";
import { useDebounce } from "@/hooks/useDebounce";
import { smartSearchMatch } from "@/utils/search";

const ACCOUNT_COLUMN_RESIZE_CONFIG = {
  // mins sized for header label + padding + core controls; text truncates inside the live width
  username: { minWidth: 200, maxWidth: 480, defaultWidth: 280 },
  gpmProfileName: { minWidth: 160, maxWidth: 320, defaultWidth: 180 },
  gpmGroup: { minWidth: 150, maxWidth: 300, defaultWidth: 170 },
  gpmProfileId: { minWidth: 220, maxWidth: 400, defaultWidth: 260 },
  country: { minWidth: 96, maxWidth: 180, defaultWidth: 110 },
  status: { minWidth: 128, maxWidth: 220, defaultWidth: 148 },
  syncStatus: { minWidth: 150, maxWidth: 280, defaultWidth: 180 },
  assignedUser: { minWidth: 240, maxWidth: 360, defaultWidth: 260 },
  totalViews: { minWidth: 130, maxWidth: 240, defaultWidth: 150 },
  totalFollowers: { minWidth: 120, maxWidth: 220, defaultWidth: 140 },
  totalVideos: { minWidth: 90, maxWidth: 180, defaultWidth: 110 },
  totalRevenue: { minWidth: 110, maxWidth: 240, defaultWidth: 130 },
  alertsCount: { minWidth: 120, maxWidth: 280, defaultWidth: 150 },
  actions: { minWidth: 100, maxWidth: 200, defaultWidth: 120 },
} as const;

type AccountSortKey =
  | "username"
  | "gpmProfileName"
  | "groupName"
  | "gpmProfileId"
  | "country"
  | "status"
  | "lastSyncedAt"
  | "assignedUser"
  | "totalViews"
  | "totalFollowers"
  | "totalVideos"
  | "totalRevenue"
  | "alertsCount"
  | "updatedAt";

const ACCOUNT_SORT_OPTIONS: Array<{ key: AccountSortKey; label: string }> = [
  { key: "totalRevenue", label: "Doanh thu" },
  { key: "totalViews", label: "Lượt xem" },
  { key: "lastSyncedAt" as any, label: "Lần đồng bộ cuối" },
  { key: "totalFollowers", label: "Lượt theo dõi" },
  { key: "totalVideos", label: "Số lượng video" },
  { key: "username", label: "Tên tài khoản" },
  { key: "gpmProfileName", label: "GPM Profile Name" },
  { key: "groupName", label: "GPM Group" },
  { key: "gpmProfileId", label: "GPM Profile ID" },
  { key: "country", label: "Quốc gia" },
  { key: "status", label: "Trạng thái" },
  { key: "updatedAt", label: "Thời gian cập nhật" },
];

const COUNTRY_MAP: Record<string, string> = {
  unitedstates: "US", "united states": "US", usa: "US", us: "US", "mỹ": "US",
  vietnam: "VN", "việt nam": "VN", vn: "VN",
  unitedkingdom: "UK", "united kingdom": "UK", uk: "UK", gb: "UK", greatbritain: "UK", "anh": "UK",
  germany: "DE", de: "DE", "đức": "DE",
  france: "FR", fr: "FR", "pháp": "FR",
  thailand: "TH", th: "TH", "thái lan": "TH",
  indonesia: "ID", id: "ID",
  malaysia: "MY", my: "MY",
  philippines: "PH", ph: "PH",
  singapore: "SG", sg: "SG",
  japan: "JP", jp: "JP", "nhật bản": "JP",
  southkorea: "KR", "south korea": "KR", kr: "KR", korea: "KR", "hàn quốc": "KR",
  brazil: "BR", br: "BR",
  mexico: "MX", mx: "MX",
  canada: "CA", ca: "CA",
  australia: "AU", au: "AU", "úc": "AU",
  spain: "ES", es: "ES", "tây ban nha": "ES",
  italy: "IT", it: "IT", "ý": "IT",
  belgium: "BE", be: "BE", "bỉ": "BE",
  netherlands: "NL", nl: "NL", "hà lan": "NL",
  portugal: "PT", pt: "PT", "bồ đào nha": "PT",
  poland: "PL", pl: "PL", "ba lan": "PL",
  sweden: "SE", se: "SE", "thụy điển": "SE",
  ch: "CH", switzerland: "CH", "thụy sĩ": "CH",
  at: "AT", austria: "AT", "áo": "AT",
  ie: "IE", ireland: "IE",
  tw: "TW", taiwan: "TW", "đài loan": "TW",
  hk: "HK", "hong kong": "HK",
  kh: "KH", cambodia: "KH", "campuchia": "KH",
  mm: "MM", myanmar: "MM",
  la: "LA", laos: "LA", "lào": "LA",
};

const COUNTRY_OPTIONS = [
  // Tier 1 / Common markets
  { value: "US", label: "🇺🇸 US - United States (Mỹ)" },
  { value: "VN", label: "🇻🇳 VN - Vietnam (Việt Nam)" },
  { value: "UK", label: "🇬🇧 UK - United Kingdom (Anh)" },
  { value: "DE", label: "🇩🇪 DE - Germany (Đức)" },
  { value: "FR", label: "🇫🇷 FR - France (Pháp)" },

  // Southeast Asia & East Asia
  { value: "TH", label: "🇹🇭 TH - Thailand (Thái Lan)" },
  { value: "ID", label: "🇮🇩 ID - Indonesia" },
  { value: "MY", label: "🇲🇾 MY - Malaysia" },
  { value: "PH", label: "🇵🇭 PH - Philippines" },
  { value: "SG", label: "🇸🇬 SG - Singapore" },
  { value: "JP", label: "🇯🇵 JP - Japan (Nhật Bản)" },
  { value: "KR", label: "🇰🇷 KR - South Korea (Hàn Quốc)" },
  { value: "TW", label: "🇹🇼 TW - Taiwan (Đài Loan)" },
  { value: "HK", label: "🇭🇰 HK - Hong Kong" },
  { value: "KH", label: "🇰🇭 KH - Cambodia (Campuchia)" },
  { value: "MM", label: "🇲🇲 MM - Myanmar" },
  { value: "LA", label: "🇱🇦 LA - Laos (Lào)" },

  // Europe
  { value: "BE", label: "🇧🇪 BE - Belgium (Bỉ)" },
  { value: "NL", label: "🇳🇱 NL - Netherlands (Hà Lan)" },
  { value: "ES", label: "🇪🇸 ES - Spain (Tây Ban Nha)" },
  { value: "IT", label: "🇮🇹 IT - Italy (Ý)" },
  { value: "PT", label: "🇵🇹 PT - Portugal (Bồ Đào Nha)" },
  { value: "PL", label: "🇵🇱 PL - Poland (Ba Lan)" },
  { value: "SE", label: "🇸🇪 SE - Sweden (Thụy Điển)" },
  { value: "CH", label: "🇨🇭 CH - Switzerland (Thụy Sĩ)" },
  { value: "AT", label: "🇦🇹 AT - Austria (Áo)" },
  { value: "IE", label: "🇮🇪 IE - Ireland" },
  { value: "RU", label: "🇷🇺 RU - Russia (Nga)" },
  { value: "TR", label: "🇹🇷 TR - Turkey (Thổ Nhĩ Kỳ)" },

  // Americas & Oceania & Others
  { value: "CA", label: "🇨🇦 CA - Canada" },
  { value: "AU", label: "🇦🇺 AU - Australia (Úc)" },
  { value: "BR", label: "🇧🇷 BR - Brazil" },
  { value: "MX", label: "🇲🇽 MX - Mexico" },
  { value: "IN", label: "🇮🇳 IN - India (Ấn Độ)" },
  { value: "PK", label: "🇵🇰 PK - Pakistan" },
  { value: "BD", label: "🇧🇩 BD - Bangladesh" },
  { value: "EG", label: "🇪🇬 EG - Egypt (Ai Cập)" },
];

const FLAG_MAP: Record<string, string> = {
  US: "🇺🇸", VN: "🇻🇳", UK: "🇬🇧", GB: "🇬🇧", DE: "🇩🇪", FR: "🇫🇷",
  TH: "🇹🇭", ID: "🇮🇩", MY: "🇲🇾", PH: "🇵🇭", SG: "🇸🇬", JP: "🇯🇵",
  KR: "🇰🇷", TW: "🇹🇼", HK: "🇭🇰", KH: "🇰🇭", MM: "🇲🇲", LA: "🇱🇦",
  BE: "🇧🇪", NL: "🇳🇱", ES: "🇪🇸", IT: "🇮🇹", PT: "🇵🇹", PL: "🇵🇱",
  SE: "🇸🇪", CH: "🇨🇭", AT: "🇦🇹", IE: "🇮🇪", RU: "🇷🇺", TR: "🇹🇷",
  CA: "🇨🇦", AU: "🇦🇺", BR: "🇧🇷", MX: "🇲🇽", IN: "🇮🇳", PK: "🇵🇰",
  BD: "🇧🇩", EG: "🇪🇬",
};

const normalizeCountry = (country?: string | null): string | null => {
  if (!country) return null;
  const trimmed = country.trim().toLowerCase();
  if (COUNTRY_MAP[trimmed]) return COUNTRY_MAP[trimmed];
  if (trimmed === "unknown") return null;
  return country.trim().toUpperCase();
};

const renderUserAvatar = (
  u?: { fullName?: string | null; name?: string | null; username?: string | null; avatar?: string | null } | null,
  size = "w-5 h-5 text-[9px]"
) => {
  if (!u) return null;
  const displayName = u.fullName || u.name || u.username || "U";
  if (u.avatar) {
    return (
      <img
        src={u.avatar}
        alt={displayName}
        className={`${size} rounded-full object-cover shrink-0`}
      />
    );
  }
  return (
    <span className={`${size} rounded-full bg-gradient-to-tr from-pink-500 to-rose-500 text-white font-bold flex items-center justify-center shrink-0 uppercase select-none`}>
      {displayName.slice(0, 2)}
    </span>
  );
};

function getPunishedVideos30d(acc: any): any[] {
  if (Array.isArray(acc?.punishedVideos30d)) return acc.punishedVideos30d;
  const rawPostRewards = Array.isArray(acc?.analytics?.postRewards)
    ? acc.analytics.postRewards
    : Array.isArray(acc?.analytics?.postRewards?.items)
      ? acc.analytics.postRewards.items
      : [];
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  return rawPostRewards.filter((v: any) => {
    if (!v?.isPunished) return false;
    const ts = v.publishTimeUnix
      ? Number(v.publishTimeUnix) * 1000
      : new Date(v.publishDate || v.postDate || v.postTime || "").getTime();
    return !isNaN(ts) ? now - ts <= THIRTY_DAYS_MS : false;
  });
}

function getStrikeTheme(count: number) {
  if (count === 1) {
    return {
      badge:
        "bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700/80 hover:bg-yellow-100 dark:hover:bg-yellow-900/40",
      icon: "text-yellow-500",
      headerGrad: "border-yellow-200 dark:border-yellow-900/40",
      headerIcon: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400",
      headerText: "text-yellow-900 dark:text-yellow-200",
      headerSub: "text-yellow-700 dark:text-yellow-400",
      border: "border-yellow-200 dark:border-yellow-900/60",
      label: "1 video bị phạt (30 ngày)",
      levelTag: "Mức 1",
      iconOnly:
        "bg-yellow-50 dark:bg-yellow-950/40 text-yellow-600 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700/80 hover:bg-yellow-100 dark:hover:bg-yellow-900/40",
    };
  }

  if (count === 2) {
    return {
      badge:
        "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700/80 hover:bg-amber-100 dark:hover:bg-amber-900/40",
      icon: "text-amber-500",
      headerGrad: "border-amber-200 dark:border-amber-900/40",
      headerIcon: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
      headerText: "text-amber-900 dark:text-amber-200",
      headerSub: "text-amber-700 dark:text-amber-400",
      border: "border-amber-200 dark:border-amber-900/60",
      label: "2 video bị phạt (30 ngày)",
      levelTag: "Mức 2",
      iconOnly:
        "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700/80 hover:bg-amber-100 dark:hover:bg-amber-900/40",
    };
  }

  if (count === 3) {
    return {
      badge:
        "bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-700/80 hover:bg-orange-100 dark:hover:bg-orange-900/40",
      icon: "text-orange-500",
      headerGrad: "border-orange-200 dark:border-orange-900/40",
      headerIcon: "bg-orange-500/20 text-orange-600 dark:text-orange-400",
      headerText: "text-orange-900 dark:text-orange-200",
      headerSub: "text-orange-700 dark:text-orange-400",
      border: "border-orange-200 dark:border-orange-900/60",
      label: "3 video bị phạt (30 ngày)",
      levelTag: "Mức 3 - Cần lưu ý",
      iconOnly:
        "bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400 border-orange-300 dark:border-orange-700/80 hover:bg-orange-100 dark:hover:bg-orange-900/40",
    };
  }

  if (count === 4) {
    return {
      badge:
        "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/40",
      icon: "text-rose-500",
      headerGrad: "border-rose-200 dark:border-rose-900/40",
      headerIcon: "bg-rose-500/20 text-rose-600 dark:text-rose-400",
      headerText: "text-rose-900 dark:text-rose-200",
      headerSub: "text-rose-700 dark:text-rose-400",
      border: "border-rose-200 dark:border-rose-900/60",
      label: "4 video bị phạt (30 ngày)",
      levelTag: "Mức 4 - Cảnh báo cao",
      iconOnly:
        "bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/40",
    };
  }

  return {
    badge:
      "bg-red-100 dark:bg-red-950/80 text-red-800 dark:text-red-200 border-2 border-red-500 dark:border-red-600 hover:bg-red-200 dark:hover:bg-red-900/60",
    icon: "text-red-600 dark:text-red-400",
    headerGrad: "border-red-300 dark:border-red-800",
    headerIcon: "bg-red-600/20 text-red-600 dark:text-red-300",
    headerText: "text-red-950 dark:text-red-100",
    headerSub: "text-red-700 dark:text-red-300 font-bold",
    border: "border-red-400 dark:border-red-800",
    label: `${count} video bị phạt (30 ngày)`,
    levelTag: "Mức 5 - Cảnh báo nghiêm trọng",
    iconOnly:
      "bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border-2 border-red-500 dark:border-red-600 hover:bg-red-200 dark:hover:bg-red-900/60",
  };
}

function ViewsPeriodTooltipContent({ account }: { account: any }) {
  const p = getAccountViewsPeriods(account);
  return (
    <>
      <div className="font-bold text-cyan-400 border-b border-slate-700 pb-1 flex items-center gap-1">
        <Eye className="w-3 h-3" />
        <span>Lượt Xem TikTok Studio</span>
      </div>
      <div className="flex justify-between gap-4 text-[11px]">
        <span className="text-slate-400">7 ngày gần nhất:</span>
        <span className="font-semibold text-cyan-300">{p.views7d.toLocaleString()}</span>
      </div>
      <div className="flex justify-between gap-4 text-[11px]">
        <span className="text-slate-400">28 ngày gần nhất:</span>
        <span className="font-semibold text-purple-300">{p.views28d.toLocaleString()}</span>
      </div>
      <div className="flex justify-between gap-4 text-[11px]">
        <span className="text-slate-400">60 ngày gần nhất:</span>
        <span className="font-semibold text-indigo-300">{p.views60d.toLocaleString()}</span>
      </div>
      <div className="flex justify-between gap-4 text-[11px]">
        <span className="text-slate-400">365 ngày gần nhất:</span>
        <span className="font-semibold text-amber-300">{p.views365d.toLocaleString()}</span>
      </div>
      <div className="flex justify-between gap-4 text-[11px] pt-1 border-t border-slate-800 font-bold">
        <span className="text-slate-300">Toàn bộ (All-time):</span>
        <span className="text-cyan-300">{p.totalViews.toLocaleString()}</span>
      </div>
    </>
  );
}

function StrikeWarningPopover({
  account,
  punishedVideos,
  iconOnly = false,
  compact = false,
  showTooltip = false,
}: {
  account: any;
  punishedVideos: any[];
  iconOnly?: boolean;
  compact?: boolean;
  showTooltip?: boolean;
}) {
  if (!punishedVideos.length) return null;
  const theme = getStrikeTheme(punishedVideos.length);
  const trigger = (
    <button
      type="button"
      className={
        compact
          ? `inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-bold border transition-colors cursor-pointer group ${theme.iconOnly}`
          : iconOnly
            ? `inline-flex items-center justify-center shrink-0 p-0.5 rounded-md transition-colors cursor-pointer group ${theme.icon} hover:opacity-80`
            : `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all shadow-sm cursor-pointer group ${theme.badge}`
      }
      aria-label={theme.label}
    >
      <AlertTriangle
        className={`${compact ? "w-2.5 h-2.5" : "w-3.5 h-3.5"} shrink-0 group-hover:scale-110 transition-transform ${compact || iconOnly ? "" : theme.icon}`}
      />
      {compact && <span>{punishedVideos.length}</span>}
      {!iconOnly && !compact && <span>{theme.label}</span>}
    </button>
  );

  return (
    <Popover>
      {showTooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs font-semibold max-w-xs">
            {theme.label}
          </TooltipContent>
        </Tooltip>
      ) : (
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      )}
      <PopoverContent
        align="start"
        className={`w-[400px] p-0 rounded-2xl shadow-2xl border bg-white dark:bg-slate-900 overflow-hidden z-50 text-xs ${theme.border}`}
      >
        <div className={`p-3.5 border-b flex items-start gap-2.5 bg-white dark:bg-slate-900 ${theme.headerGrad}`}>
          <div className={`p-2 rounded-xl shrink-0 ${theme.headerIcon}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className={`font-bold text-sm ${theme.headerText}`}>
                {punishedVideos.length} Video Bị Phạt (30 Ngày)
              </h4>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                {theme.levelTag}
              </span>
            </div>
            <p className={`text-[11px] mt-0.5 ${theme.headerSub}`}>
              Tài khoản @{account.username} có video bị phạt vi phạm trong 30 ngày gần nhất
            </p>
          </div>
        </div>

        <div className="p-3.5 space-y-3">
          <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
            {punishedVideos.map((v: any, vIdx: number) => {
              const progName = v.programName || "Chương trình Creator Rewards";
              const isShop = progName.includes("Shop");
              const isSeries = progName.includes("Series");
              const isGifts = progName.includes("Gifts") || progName.includes("Quà tặng");
              const cover = v.coverUrl || v.cover || null;

              return (
                <div
                  key={vIdx}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 flex items-start gap-2.5 hover:border-amber-300 dark:hover:border-amber-800/80 transition-colors"
                >
                  <div className="w-11 h-14 rounded-lg bg-slate-200 dark:bg-slate-800 overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700">
                    {cover ? (
                      <img
                        src={cover}
                        alt={v.title || "Cover"}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <Video className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white line-clamp-2 leading-relaxed" title={v.title}>
                      {v.title || `Video #${v.id}`}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border ${isShop
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                          : isSeries
                            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                            : isGifts
                              ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                              : "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20"
                          }`}
                      >
                        <Sparkles className="w-2.5 h-2.5 shrink-0" />
                        {progName}
                      </span>
                      <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                        Bị huỷ điều kiện
                      </span>
                      {v.postDate && (
                        <span className="text-[10px] text-slate-400">{v.postDate}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              Phân tách theo từng chương trình kiếm tiền
            </span>
            <Link
              href={`/accounts/${account.id}?tab=rewards`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
            >
              <span>Xem tất cả video</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AccountsPageContent() {
  const { formatAmount } = useCurrency();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const isLead = (session?.user as any)?.role === "LEAD";
  const isLeadOrAdmin =
    isAdmin || (session?.user as any)?.role === "LEAD";


  // SaaS URL Query State Synchronization
  const { updateUrlParams } = useUrlParams();

  // Trash mode state (Admin only)
  const initialViewTrash = isAdmin && searchParams?.get("trash") === "true";
  const [viewTrash, setViewTrash] = useState<boolean>(initialViewTrash);

  // View Mode: read initial value from URL Search Params ("v" or "view")
  const initialViewMode = ((searchParams?.get("v") || searchParams?.get("view")) === "list" ? "list" : "grid") as "grid" | "list";
  const [viewMode, setViewMode] = useState<"grid" | "list">(initialViewMode);

  // Fast filters
  const initialSearch = searchParams?.get("q") || searchParams?.get("search") || "";
  const [search, setSearch] = useState(initialSearch);
  const debouncedSearch = useDebounce(search, 300);

  const initialStatus = searchParams?.get("status") || "ALL";
  const [statusFilter, setStatusFilter] = useState<any>(initialStatus);

  const initialOnline = (searchParams?.get("online") || "ALL") as "ALL" | "ONLINE" | "OFFLINE";
  const [onlineFilter, setOnlineFilter] = useState<"ALL" | "ONLINE" | "OFFLINE">(initialOnline);

  const initialSync = (searchParams?.get("sync") || "ALL") as "ALL" | "SYNC_OK" | "SYNC_ISSUES";
  const [syncFilter, setSyncFilter] = useState<"ALL" | "SYNC_OK" | "SYNC_ISSUES">(initialSync);

  const initialCountry = searchParams?.get("country") || "ALL";
  const [countryFilter, setCountryFilter] = useState(initialCountry);

  const initialAssigned = searchParams?.get("user") || searchParams?.get("assigned") || "ALL";
  const [assignedFilter, setAssignedFilter] = useState(initialAssigned);

  const initialTeam = searchParams?.get("team") || "ALL";
  const [teamFilter, setTeamFilter] = useState(initialTeam);

  // Advanced filters
  const initialWarning = (searchParams?.get("warn") || searchParams?.get("warning") || "ALL") as "ALL" | "HAS_WARNING" | "NO_WARNING";
  const [warningFilter, setWarningFilter] = useState<"ALL" | "HAS_WARNING" | "NO_WARNING">(initialWarning);

  const initialGpm = (searchParams?.get("gpm") || "ALL") as "ALL" | "LINKED" | "UNLINKED";
  const [gpmFilter, setGpmFilter] = useState<"ALL" | "LINKED" | "UNLINKED">(initialGpm);

  const initialMinViews = searchParams?.get("minV") || searchParams?.get("minViews") || "";
  const [minViews, setMinViews] = useState<string>(initialMinViews);

  const initialMinRevenue = searchParams?.get("minRev") || searchParams?.get("minRevenue") || "";
  const [minRevenue, setMinRevenue] = useState<string>(initialMinRevenue);

  // Sorting
  const initialSortKey = (searchParams?.get("sort") || searchParams?.get("sortBy") || "updatedAt") as AccountSortKey;
  const initialSortDesc = (searchParams?.get("dir") || searchParams?.get("sortOrder")) === "asc" ? false : true;
  const [sortConfig, setSortConfig] = useState<{ key: AccountSortKey; desc: boolean }>({
    key: initialSortKey,
    desc: initialSortDesc,
  });

  const currentSortOption = useMemo(() => {
    return ACCOUNT_SORT_OPTIONS.find((opt) => opt.key === sortConfig.key) || { key: sortConfig.key, label: "Mặc định" };
  }, [sortConfig.key]);

  const sortDirectionText = sortConfig.desc ? "Giảm dần" : "Tăng dần";

  const initialPage = useMemo(() => {
    const p = searchParams?.get("p") || searchParams?.get("page");
    const num = p ? parseInt(p, 10) : 1;
    return isNaN(num) || num < 1 ? 1 : num;
  }, [searchParams]);

  const initialPageSize = useMemo(() => {
    const ps = searchParams?.get("ps") || searchParams?.get("pageSize");
    const num = ps ? parseInt(ps, 10) : 25;
    return isNaN(num) || num < 1 || ![25, 50, 100, 200].includes(num) ? 25 : num;
  }, [searchParams]);

  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // SaaS URL sync: automatically keep URL in sync with all active state without reloading
  useEffect(() => {
    updateUrlParams(
      {
        v: viewMode,
        p: page,
        ps: pageSize,
        q: search,
        status: statusFilter,
        online: onlineFilter,
        sync: syncFilter,
        country: countryFilter,
        user: assignedFilter,
        team: teamFilter,
        warn: warningFilter,
        gpm: gpmFilter,
        minV: minViews,
        minRev: minRevenue,
        sort: sortConfig.key,
        dir: sortConfig.desc ? "desc" : "asc",
        trash: viewTrash ? "true" : "",
      },
      {
        v: "grid",
        p: 1,
        ps: 25,
        q: "",
        status: "ALL",
        online: "ALL",
        sync: "ALL",
        country: "ALL",
        user: "ALL",
        team: "ALL",
        warn: "ALL",
        gpm: "ALL",
        minV: "",
        minRev: "",
        sort: "updatedAt",
        dir: "desc",
        trash: "",
      }
    );
  }, [
    viewMode,
    page,
    pageSize,
    search,
    statusFilter,
    onlineFilter,
    syncFilter,
    countryFilter,
    assignedFilter,
    teamFilter,
    warningFilter,
    gpmFilter,
    minViews,
    minRevenue,
    sortConfig,
    viewTrash,
    updateUrlParams,
  ]);

  const handleViewModeChange = (mode: "grid" | "list") => {
    setViewMode(mode);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  };

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Column visibility state (username is locked and cannot be unchecked)
  const [visibleColumns, setVisibleColumns] = useState({
    username: true,
    gpmProfileName: true,
    gpmGroup: true,
    gpmProfileId: true,
    country: true,
    status: true,
    syncStatus: true,
    assignedUser: true,
    totalViews: true,
    totalFollowers: true,
    totalVideos: true,
    totalRevenue: true,
    alertsCount: true,
    actions: true,
  });

  const visibleColumnCount = useMemo(() => {
    return 1 /* checkbox */ + Object.values(visibleColumns).filter(Boolean).length;
  }, [visibleColumns]);

  const visibleResizeKeys = useMemo(
    () =>
      (Object.keys(ACCOUNT_COLUMN_RESIZE_CONFIG) as Array<keyof typeof ACCOUNT_COLUMN_RESIZE_CONFIG>).filter(
        (key) => visibleColumns[key]
      ),
    [visibleColumns]
  );

  const tableRef = useRef<HTMLDivElement>(null);
  const { getColumnStyle, getTableVars, renderResizeHandle } = useTableColumnResize({
    tableId: "accounts-v3",
    columns: ACCOUNT_COLUMN_RESIZE_CONFIG,
    tableRef,
    visibleKeys: visibleResizeKeys,
    extraWidth: 40, // checkbox column
  });

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);

  // Bulk modal states
  const [isBulkStatusOpen, setIsBulkStatusOpen] = useState(false);
  const [bulkStatusVal, setBulkStatusVal] = useState("ACTIVE");
  const [isBulkAssignOpen, setIsBulkAssignOpen] = useState(false);
  const [bulkAssignUserVal, setBulkAssignUserVal] = useState("");
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);

  // Single delete modal
  const [accountToDelete, setAccountToDelete] = useState<any>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  // Toast msg
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [copiedGpmId, setCopiedGpmId] = useState<string | null>(null);

  // Form states
  const [newUsername, setNewUsername] = useState("");
  const [newCountry, setNewCountry] = useState("US");
  const [newGroup, setNewGroup] = useState("Default group");
  const [newProfileName, setNewProfileName] = useState("");
  const [newGpmId, setNewGpmId] = useState("");
  const [newAssignedUser, setNewAssignedUser] = useState("");

  // Edit form states
  const [editId, setEditId] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editCountry, setEditCountry] = useState("US");
  const [editGroup, setEditGroup] = useState("");
  const [editProfileName, setEditProfileName] = useState("");
  const [editGpmId, setEditGpmId] = useState("");
  const [editAssignedUser, setEditAssignedUser] = useState("");

  const utils = trpc.useUtils();
  const queryClient = useQueryClient();

  // Listen to global sync event
  useEffect(() => {
    const handleRefresh = () => {
      utils.accounts.list.invalidate();
      utils.user.listStaff.invalidate();
    };
    window.addEventListener("refreshData", handleRefresh);
    return () => window.removeEventListener("refreshData", handleRefresh);
  }, [utils]);

  // tRPC Queries
  const { data: accountsData, isLoading: loading } = trpc.accounts.list.useQuery({
    search: debouncedSearch || undefined,
    status: !viewTrash && statusFilter !== "ALL" ? statusFilter : undefined,
    onlineStatus: !viewTrash && onlineFilter !== "ALL" ? onlineFilter : undefined,
    syncStatus: !viewTrash && syncFilter !== "ALL" ? syncFilter : undefined,
    country: countryFilter !== "ALL" ? countryFilter : undefined,
    assignedUserId: isLeadOrAdmin && assignedFilter !== "ALL" ? assignedFilter : undefined,
    viewTrash: viewTrash && isAdmin ? true : false,
  });

  const { data: users = [] } = trpc.user.listStaff.useQuery();
  const { data: teamsData } = trpc.admin.listTeams.useQuery(undefined, { enabled: isLeadOrAdmin });
  const allTeams = useMemo(() => {
    if (!teamsData) return [];
    if (Array.isArray(teamsData.teamsDetails) && teamsData.teamsDetails.length > 0) {
      return teamsData.teamsDetails.map((t: any, i: number) => ({
        id: String(t.id || t.name || `team-${i}`),
        name: String(t.name || t.teamName || t.id || `Nhóm ${i + 1}`),
      }));
    }
    if (Array.isArray(teamsData.teams)) {
      return teamsData.teams.map((t: any, i: number) => {
        if (typeof t === "string") return { id: t, name: t };
        return {
          id: String(t.id || t.name || `team-${i}`),
          name: String(t.name || t.id || `Nhóm ${i + 1}`),
        };
      });
    }
    return [];
  }, [teamsData]);

  const selectedTeamName = useMemo(() => {
    if (teamFilter === "ALL") return undefined;
    const found = allTeams.find((t: any) => t.id === teamFilter || t.name === teamFilter);
    return found ? found.name : undefined;
  }, [allTeams, teamFilter]);

  const filteredStaffUsers = useMemo(() => {
    if (!isLeadOrAdmin || teamFilter === "ALL") return users;
    return users.filter((u: any) => u.teamId === teamFilter);
  }, [users, teamFilter, isLeadOrAdmin]);

  const handleTeamChange = (newTeam: string) => {
    setTeamFilter(newTeam);
    setPage(1);
    if (newTeam !== "ALL" && assignedFilter !== "ALL") {
      const match = users.some((u: any) => u.id === assignedFilter && u.teamId === newTeam);
      if (!match) {
        setAssignedFilter("ALL");
      }
    }
  };
  const { data: accountLogs = [], isLoading: isLogsLoading } = trpc.accounts.getLogs.useQuery(
    { accountId: selectedAccount?.id || "" },
    { enabled: isLogModalOpen && !!selectedAccount?.id }
  );

  const accounts = accountsData?.items || [];
  const stats = accountsData?.stats;
  const fleetStats = stats?.mode === "fleet" ? stats : null;

  const fleetRevenuePeriods = useMemo(() => {
    const fs = fleetStats as any;
    const r7 =
      typeof fs?.totalRevenue7d === "number"
        ? fs.totalRevenue7d
        : accounts.reduce((sum: number, acc: any) => sum + resolvePeriodRevenue(acc, 7), 0);
    const r28 =
      typeof fs?.totalRevenue28d === "number"
        ? fs.totalRevenue28d
        : accounts.reduce((sum: number, acc: any) => sum + resolvePeriodRevenue(acc, 28), 0);
    const r30 =
      typeof fs?.totalRevenue30d === "number"
        ? fs.totalRevenue30d
        : accounts.reduce((sum: number, acc: any) => sum + resolvePeriodRevenue(acc, 30), 0);
    const rThisMonth =
      typeof fs?.totalRevenueThisMonth === "number"
        ? fs.totalRevenueThisMonth
        : typeof fs?.totalRevenue30d === "number"
          ? fs.totalRevenue30d
          : accounts.reduce((sum: number, acc: any) => sum + resolveThisMonthRevenue(acc), 0);
    const r60 =
      typeof fs?.totalRevenue60d === "number"
        ? fs.totalRevenue60d
        : accounts.reduce((sum: number, acc: any) => sum + resolvePeriodRevenue(acc, 60), 0);
    const r365 =
      typeof fs?.totalRevenue365d === "number"
        ? fs.totalRevenue365d
        : accounts.reduce((sum: number, acc: any) => sum + resolvePeriodRevenue(acc, 365), 0);
    const allTime =
      typeof fs?.totalRevenue === "number"
        ? fs.totalRevenue
        : accounts.reduce((sum: number, acc: any) => sum + resolveAllTimeRevenue(acc), 0);

    return {
      revenue7d: r7,
      revenue28d: r28,
      revenue30d: r30,
      revenueThisMonth: rThisMonth,
      revenue60d: r60,
      revenue365d: r365,
      allTime,
    };
  }, [fleetStats, accounts]);

  const fleetRevenueThisMonth = fleetRevenuePeriods.revenueThisMonth;
  const fleetRevenue30d = fleetRevenuePeriods.revenue30d;
  const fleetRevenueAllTime = fleetRevenuePeriods.allTime;

  const getAssigneeLabel = (acc: any) => {
    if (!acc?.assignedUserId) return "-- Chưa gán --";
    const fromList = users.find((u: any) => u.id === acc.assignedUserId);
    if (fromList?.fullName) return fromList.fullName;
    const u = acc.assignedUser;
    if (!u) return "-- Chưa gán --";
    return (
      u.fullName ||
      u.name ||
      [u.firstName, u.lastName].filter(Boolean).join(" ") ||
      u.username ||
      "-- Chưa gán --"
    );
  };

  const getAssigneeUser = (acc: any) => {
    if (!acc?.assignedUserId) return null;
    const fromList = users.find((u: any) => u.id === acc.assignedUserId);
    if (fromList) return fromList;
    return acc.assignedUser || null;
  };

  const toggleLockMutation = trpc.accounts.toggleLockAssignment.useMutation({
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: [["accounts"]] });
      const snapshot = snapshotAccountQueries(queryClient);
      optimisticallyUpdateAccount(queryClient, { id: vars.id, isAssignmentLocked: vars.isLocked });
      return { snapshot };
    },
    onError: (err: any, _vars, context: any) => {
      if (context?.snapshot) {
        rollbackAccountQueries(queryClient, context.snapshot);
      }
      toast.error(err.message || "Lỗi khi cập nhật khóa");
    },
    onSuccess: (res) => {
      setActionMsg(
        res.isAssignmentLocked
          ? "🔒 Đã khóa phân công — Extension/Agent không tự bàn giao ca."
          : "🔓 Đã mở khóa phân công — đổi ca tự do."
      );
      utils.accounts.list.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onSettled: () => {
      utils.accounts.list.invalidate();
    },
  });

  // tRPC Mutations
  const createMutation = trpc.accounts.create.useMutation({
    onSuccess: () => {
      setIsCreateOpen(false);
      setNewUsername("");
      setNewProfileName("");
      setNewGpmId("");
      setActionMsg("✅ Đã tạo tài khoản TikTok thành công!");
      utils.accounts.list.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateMutation = trpc.accounts.update.useMutation({
    onMutate: async (newAccount) => {
      await queryClient.cancelQueries({ queryKey: [["accounts"]] });
      const snapshot = snapshotAccountQueries(queryClient);
      optimisticallyUpdateAccount(queryClient, newAccount, users);
      return { snapshot };
    },
    onError: (err: any, _newAccount, context: any) => {
      if (context?.snapshot) {
        rollbackAccountQueries(queryClient, context.snapshot);
      }
      toast.error(err.message || "Lỗi khi cập nhật thông tin");
    },
    onSuccess: (updated) => {
      setIsEditOpen(false);
      setActionMsg("✅ Đã cập nhật thông tin tài khoản!");
      if (updated?.id) {
        optimisticallyUpdateAccount(queryClient, updated as any, users);
      }
      utils.accounts.list.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onSettled: () => {
      utils.accounts.list.invalidate();
    },
  });

  // Trash mode modal states
  const [accountToHardDelete, setAccountToHardDelete] = useState<any>(null);
  const [isHardDeleteOpen, setIsHardDeleteOpen] = useState(false);
  const [isBulkHardDeleteOpen, setIsBulkHardDeleteOpen] = useState(false);
  const [forcePurge, setForcePurge] = useState(false);
  const [bulkHardDeleteResult, setBulkHardDeleteResult] = useState<{
    purgedCount: number;
    blockedCount: number;
    blockedAccounts: Array<{ id: string; username: string }>;
  } | null>(null);

  // Auto-restore confirm dialog state for Create Account
  const [autoRestoreConfirm, setAutoRestoreConfirm] = useState<{
    username: string;
  } | null>(null);

  const deleteMutation = trpc.accounts.delete.useMutation({
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: [["accounts"]] });
      const snapshot = snapshotAccountQueries(queryClient);
      if (!viewTrash) {
        optimisticallyDeleteAccounts(queryClient, [vars.id]);
      }
      return { snapshot };
    },
    onError: (err: any, _vars, context: any) => {
      if (context?.snapshot) {
        rollbackAccountQueries(queryClient, context.snapshot);
      }
      toast.error(err.message || "Lỗi khi xóa tài khoản");
    },
    onSuccess: () => {
      setIsDeleteOpen(false);
      setAccountToDelete(null);
      setActionMsg("🗑️ Đã chuyển tài khoản TikTok vào thùng rác!");
      utils.accounts.list.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onSettled: () => {
      utils.accounts.list.invalidate();
    },
  });

  const bulkDeleteMutation = trpc.accounts.bulkDelete.useMutation({
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: [["accounts"]] });
      const snapshot = snapshotAccountQueries(queryClient);
      if (!viewTrash) {
        optimisticallyDeleteAccounts(queryClient, vars.ids);
      }
      return { snapshot };
    },
    onError: (err: any, _vars, context: any) => {
      if (context?.snapshot) {
        rollbackAccountQueries(queryClient, context.snapshot);
      }
      toast.error(err.message || "Lỗi khi xóa hàng loạt");
    },
    onSuccess: (res) => {
      setIsBulkDeleteOpen(false);
      setSelectedIds(new Set());
      setActionMsg(`🗑️ Đã chuyển thành công ${res.count} tài khoản vào thùng rác!`);
      utils.accounts.list.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onSettled: () => {
      utils.accounts.list.invalidate();
    },
  });

  const restoreMutation = trpc.accounts.restore.useMutation({
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: [["accounts"]] });
      const snapshot = snapshotAccountQueries(queryClient);
      if (viewTrash) {
        optimisticallyRestoreAccounts(queryClient, [vars.id]);
      }
      return { snapshot };
    },
    onError: (err: any, _vars, context: any) => {
      if (context?.snapshot) {
        rollbackAccountQueries(queryClient, context.snapshot);
      }
      toast.error(err.message || "Lỗi khi khôi phục tài khoản");
    },
    onSuccess: () => {
      setActionMsg("✅ Đã khôi phục tài khoản thành công!");
      utils.accounts.list.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onSettled: () => {
      utils.accounts.list.invalidate();
    },
  });

  const bulkRestoreMutation = trpc.accounts.bulkRestore.useMutation({
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: [["accounts"]] });
      const snapshot = snapshotAccountQueries(queryClient);
      if (viewTrash) {
        optimisticallyRestoreAccounts(queryClient, vars.ids);
      }
      return { snapshot };
    },
    onError: (err: any, _vars, context: any) => {
      if (context?.snapshot) {
        rollbackAccountQueries(queryClient, context.snapshot);
      }
      toast.error(err.message || "Lỗi khi khôi phục hàng loạt");
    },
    onSuccess: (res) => {
      setSelectedIds(new Set());
      setActionMsg(`✅ Đã khôi phục thành công ${res.restoredCount} tài khoản!`);
      utils.accounts.list.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onSettled: () => {
      utils.accounts.list.invalidate();
    },
  });

  const hardDeleteMutation = trpc.accounts.hardDelete.useMutation({
    onSuccess: () => {
      setIsHardDeleteOpen(false);
      setAccountToHardDelete(null);
      setForcePurge(false);
      setActionMsg("💥 Đã xóa vĩnh viễn tài khoản khỏi hệ thống!");
      utils.accounts.list.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const bulkHardDeleteMutation = trpc.accounts.bulkHardDelete.useMutation({
    onSuccess: (res) => {
      if (res.blockedCount > 0 && !forcePurge) {
        setBulkHardDeleteResult(res);
      } else {
        setIsBulkHardDeleteOpen(false);
        setBulkHardDeleteResult(null);
        setForcePurge(false);
        setSelectedIds(new Set());
        setActionMsg(`💥 Đã xóa vĩnh viễn ${res.purgedCount} tài khoản!`);
        utils.accounts.list.invalidate();
        setTimeout(() => setActionMsg(null), 4000);
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  const bulkUpdateStatusMutation = trpc.accounts.bulkUpdateStatus.useMutation({
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: [["accounts"]] });
      const snapshot = snapshotAccountQueries(queryClient);
      optimisticallyBulkUpdateAccounts(queryClient, vars.ids, { status: vars.status });
      return { snapshot };
    },
    onError: (err: any, _vars, context: any) => {
      if (context?.snapshot) {
        rollbackAccountQueries(queryClient, context.snapshot);
      }
      toast.error(err.message || "Lỗi cập nhật trạng thái");
    },
    onSuccess: (res) => {
      setIsBulkStatusOpen(false);
      setSelectedIds(new Set());
      setActionMsg(`✅ Đã cập nhật trạng thái cho ${res.count} tài khoản!`);
      utils.accounts.list.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onSettled: () => {
      utils.accounts.list.invalidate();
    },
  });

  const bulkAssignMutation = trpc.accounts.bulkAssign.useMutation({
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: [["accounts"]] });
      const snapshot = snapshotAccountQueries(queryClient);
      optimisticallyBulkUpdateAccounts(
        queryClient,
        vars.ids,
        { assignedUserId: vars.assignedUserId },
        users
      );
      return { snapshot };
    },
    onError: (err: any, _vars, context: any) => {
      if (context?.snapshot) {
        rollbackAccountQueries(queryClient, context.snapshot);
      }
      toast.error(err.message || "Lỗi phân công nhân sự");
    },
    onSuccess: (res) => {
      setIsBulkAssignOpen(false);
      setSelectedIds(new Set());
      setActionMsg(`✅ Đã gán thành công cho ${res.count} tài khoản!`);
      utils.accounts.list.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onSettled: () => {
      utils.accounts.list.invalidate();
    },
  });

  const syncMutation = trpc.accounts.syncAccount.useMutation({
    onSuccess: () => {
      setActionMsg("🔄 Đã gửi yêu cầu đồng bộ tài khoản!");
      utils.accounts.list.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const stopSyncMutation = trpc.accounts.stopSyncAccount.useMutation({
    onSuccess: () => {
      setActionMsg("🛑 Đã gửi yêu cầu dừng đồng bộ!");
      utils.accounts.list.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const { data: gpmStatus } = trpc.gpm.checkStatus.useQuery();
  const [startingGpmId, setStartingGpmId] = useState<string | null>(null);

  const startGpmMutation = trpc.gpm.startProfile.useMutation();

  const handleStartGpm = async (gpmProfileId: string, customPort?: number | null) => {
    const targetPort = customPort || gpmStatus?.port || 9495;
    setStartingGpmId(gpmProfileId);
    try {
      await launchGpmProfile(gpmProfileId, {
        port: targetPort,
        startMutation: startGpmMutation,
        onSuccess: (data) => {
          setActionMsg(`🚀 Đã mở profile GPM (cổng ${data?.port || targetPort})!`);
          setTimeout(() => setActionMsg(null), 4000);
        },
        onError: (err: any) => {
          setActionMsg(`Lỗi: ${err.message || "Không thể kết nối GPMLogin"}`);
          setTimeout(() => setActionMsg(null), 5000);
        },
      });
    } catch (err: any) {
      setActionMsg(`Lỗi: ${err.message || "Không thể kết nối GPMLogin"}`);
      setTimeout(() => setActionMsg(null), 5000);
    } finally {
      setStartingGpmId(null);
    }
  };

  const executeCreate = (override?: boolean) => {
    createMutation.mutate({
      username: newUsername.trim(),
      country: newCountry,
      groupName: newGroup || null,
      gpmProfileName: newProfileName.trim() || null,
      gpmProfileId: newGpmId.trim() || null,
      assignedUserId: newAssignedUser || null,
    });
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;

    try {
      const checkRes = await utils.accounts.checkUsername.fetch({ username: newUsername.trim() });
      if (checkRes.canAutoRestore) {
        setAutoRestoreConfirm({ username: newUsername.trim() });
        return;
      }
    } catch {
      // If check fails, fallback to direct create attempt
    }

    executeCreate();
  };

  const handleStatusChange = (accountId: string, newStatus: any) => {
    if (!isLeadOrAdmin) {
      setActionMsg("❌ Chỉ Quản trị viên (Admin) hoặc Trưởng nhóm (Lead) mới có quyền đổi trạng thái.");
      setTimeout(() => setActionMsg(null), 4000);
      return;
    }
    updateMutation.mutate({ id: accountId, status: newStatus });
  };

  const handleAssignUser = (accountId: string, userId: string) => {
    if (!isLeadOrAdmin) {
      setActionMsg("❌ Chỉ Quản trị viên (Admin) hoặc Trưởng nhóm (Lead) mới có quyền phân công nhân sự.");
      setTimeout(() => setActionMsg(null), 4000);
      return;
    }
    updateMutation.mutate({ id: accountId, assignedUserId: userId || null });
  };

  const handleOpenEdit = (acc: any) => {
    if (!isLeadOrAdmin) {
      setActionMsg("❌ Chỉ Quản trị viên (Admin) hoặc Trưởng nhóm (Lead) mới có quyền chỉnh sửa tài khoản.");
      setTimeout(() => setActionMsg(null), 4000);
      return;
    }
    setEditId(acc.id);
    setEditUsername(acc.username);
    setEditCountry(normalizeCountry(acc.country) || "");
    setEditGroup(acc.groupName || "");
    setEditProfileName(acc.gpmProfileName || "");
    setEditGpmId(acc.gpmProfileId || "");
    setEditAssignedUser(acc.assignedUserId || "");
    setIsEditOpen(true);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLeadOrAdmin) {
      setActionMsg("❌ Chỉ Quản trị viên (Admin) hoặc Trưởng nhóm (Lead) mới có quyền chỉnh sửa tài khoản.");
      setTimeout(() => setActionMsg(null), 4000);
      return;
    }
    updateMutation.mutate({
      id: editId,
      country: editCountry,
      groupName: editGroup?.trim() || null,
      gpmProfileName: editProfileName?.trim() || null,
      gpmProfileId: editGpmId?.trim() || null,
      assignedUserId: editAssignedUser || null,
    });
  };

  const handleOpenLogs = (acc: any) => {
    setSelectedAccount(acc);
    setIsLogModalOpen(true);
  };

  const handleSort = (key: AccountSortKey) => {
    setSortConfig((prev) => ({
      key,
      desc: prev.key === key ? !prev.desc : false,
    }));
    setPage(1);
  };

  // Filtered & Sorted accounts
  const filteredAndSortedAccounts = useMemo(() => {
    const s = search.toLowerCase().trim();

    const filtered = accounts.filter((acc: any) => {
      // Data isolation for STAFF: strictly only show accounts assigned to this staff user
      if (!isLeadOrAdmin && session?.user?.id && acc.assignedUserId !== (session.user as any).id) {
        return false;
      }

      const matchSearch = smartSearchMatch(
        search,
        acc.username,
        acc.groupName,
        acc.gpmProfileName,
        acc.gpmProfileId,
        acc.country,
        normalizeCountry(acc.country),
        acc.assignedUser?.fullName,
        acc.assignedUser?.name,
        acc.assignedUser?.username,
        acc.assignedUser?.email,
        getAssigneeLabel(acc)
      );

      const matchStatus = statusFilter === "ALL" || acc.status === statusFilter;
      const matchOnline =
        onlineFilter === "ALL" ||
        (onlineFilter === "ONLINE" ? !!acc.isOnline : !acc.isOnline);
      const matchSync =
        syncFilter === "ALL" ||
        (syncFilter === "SYNC_ISSUES" ? hasAccountSyncIssue(acc) : !hasAccountSyncIssue(acc));
      const matchCountry = countryFilter === "ALL" || normalizeCountry(acc.country) === countryFilter;
      const matchTeam = !isLeadOrAdmin || teamFilter === "ALL" || acc.assignedUser?.teamId === teamFilter;
      const matchAssigned = !isLeadOrAdmin || assignedFilter === "ALL" || acc.assignedUserId === assignedFilter;

      // Advanced filters
      const hasWarning = acc.alerts && acc.alerts.length > 0;
      const matchWarning =
        warningFilter === "ALL" ||
        (warningFilter === "HAS_WARNING" ? hasWarning : !hasWarning);

      const hasGpm = !!acc.gpmProfileId;
      const matchGpm =
        gpmFilter === "ALL" ||
        (gpmFilter === "LINKED" ? hasGpm : !hasGpm);

      const viewsNum = Number(acc.totalViews || 0);
      const matchMinViews = !minViews || viewsNum >= Number(minViews);

      const revNum = resolveAllTimeRevenue(acc as any);
      const matchMinRev = !minRevenue || revNum >= Number(minRevenue);

      return (
        matchSearch &&
        matchStatus &&
        matchOnline &&
        matchSync &&
        matchCountry &&
        matchTeam &&
        matchAssigned &&
        matchWarning &&
        matchGpm &&
        matchMinViews &&
        matchMinRev
      );
    });

    // Sorting
    filtered.sort((a: any, b: any) => {
      const isDesc = sortConfig.desc;

      if (sortConfig.key === "assignedUser") {
        const strA = (getAssigneeLabel(a) || "").trim();
        const strB = (getAssigneeLabel(b) || "").trim();
        const emptyA = !a.assignedUserId || strA === "-- Chưa gán --" || !strA;
        const emptyB = !b.assignedUserId || strB === "-- Chưa gán --" || !strB;
        if (emptyA && emptyB) return 0;
        if (emptyA) return 1;
        if (emptyB) return -1;
        const cmp = strA.localeCompare(strB, "vi", { numeric: true, sensitivity: "base" });
        return isDesc ? -cmp : cmp;
      }

      if (sortConfig.key === "alertsCount") {
        const countA = a.alerts?.length || 0;
        const countB = b.alerts?.length || 0;
        return isDesc ? countB - countA : countA - countB;
      }

      if (sortConfig.key === "totalRevenue") {
        const revA = resolveAllTimeRevenue(a as any);
        const revB = resolveAllTimeRevenue(b as any);
        return isDesc ? revB - revA : revA - revB;
      }

      if (
        sortConfig.key === "totalViews" ||
        sortConfig.key === "totalFollowers" ||
        sortConfig.key === "totalVideos"
      ) {
        const numA = Number(a[sortConfig.key] || 0);
        const numB = Number(b[sortConfig.key] || 0);
        return isDesc ? numB - numA : numA - numB;
      }

      if (sortConfig.key === "updatedAt") {
        const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        if (!timeA && !timeB) return 0;
        if (!timeA) return 1;
        if (!timeB) return -1;
        return isDesc ? timeB - timeA : timeA - timeB;
      }

      if ((sortConfig.key as string) === "lastSyncedAt") {
        const timeA = a.lastSyncedAt ? new Date(a.lastSyncedAt).getTime() : 0;
        const timeB = b.lastSyncedAt ? new Date(b.lastSyncedAt).getTime() : 0;
        if (!timeA && !timeB) return 0;
        if (!timeA) return 1;
        if (!timeB) return -1;
        return isDesc ? timeB - timeA : timeA - timeB;
      }

      if (sortConfig.key === "country") {
        const cA = (normalizeCountry(a.country) || "").trim();
        const cB = (normalizeCountry(b.country) || "").trim();
        if (!cA && !cB) return 0;
        if (!cA) return 1;
        if (!cB) return -1;
        const cmp = cA.localeCompare(cB, "vi", { numeric: true, sensitivity: "base" });
        return isDesc ? -cmp : cmp;
      }

      // String fields: gpmProfileName, groupName, gpmProfileId, username, status
      const valA = a[sortConfig.key];
      const valB = b[sortConfig.key];
      const strA = (valA != null ? String(valA) : "").trim();
      const strB = (valB != null ? String(valB) : "").trim();

      if (!strA && !strB) return 0;
      if (!strA) return 1; // Empty values always at the end
      if (!strB) return -1;

      const cmp = strA.localeCompare(strB, "vi", { numeric: true, sensitivity: "base" });
      return isDesc ? -cmp : cmp;
    });

    return filtered;
  }, [
    accounts,
    search,
    statusFilter,
    onlineFilter,
    syncFilter,
    countryFilter,
    assignedFilter,
    teamFilter,
    warningFilter,
    gpmFilter,
    minViews,
    minRevenue,
    sortConfig,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedAccounts.length / pageSize));
  const paginatedAccounts = useMemo(() => {
    return filteredAndSortedAccounts.slice(
      (page - 1) * pageSize,
      page * pageSize
    );
  }, [filteredAndSortedAccounts, page, pageSize]);

  // Bulk selection helpers
  const isAllPageSelected =
    paginatedAccounts.length > 0 &&
    paginatedAccounts.every((acc: any) => selectedIds.has(acc.id));

  const toggleSelectAll = (checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) {
      paginatedAccounts.forEach((acc: any) => next.add(acc.id));
    } else {
      paginatedAccounts.forEach((acc: any) => next.delete(acc.id));
    }
    setSelectedIds(next);
  };

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Active filter count
  const activeAdvancedCount =
    (isLeadOrAdmin && statusFilter !== "ALL" ? 1 : 0) +
    (onlineFilter !== "ALL" ? 1 : 0) +
    (syncFilter !== "ALL" ? 1 : 0) +
    (countryFilter !== "ALL" ? 1 : 0) +
    (warningFilter !== "ALL" ? 1 : 0) +
    (gpmFilter !== "ALL" ? 1 : 0) +
    (minViews ? 1 : 0) +
    (minRevenue ? 1 : 0);

  const totalActiveFiltersCount =
    (search ? 1 : 0) +
    (!isLeadOrAdmin && statusFilter !== "ALL" ? 1 : 0) +
    (isLeadOrAdmin && teamFilter !== "ALL" ? 1 : 0) +
    (assignedFilter !== "ALL" ? 1 : 0) +
    activeAdvancedCount;

  const clearAdvancedFilters = () => {
    if (isLeadOrAdmin) setStatusFilter("ALL");
    setOnlineFilter("ALL");
    setSyncFilter("ALL");
    setCountryFilter("ALL");
    setWarningFilter("ALL");
    setGpmFilter("ALL");
    setMinViews("");
    setMinRevenue("");
    setPage(1);
  };

  const clearAllFilters = () => {
    setSearch("");
    setStatusFilter("ALL");
    setAssignedFilter("ALL");
    setTeamFilter("ALL");
    clearAdvancedFilters();
  };

  const getCountryFlag = (country: string) => {
    const code = normalizeCountry(country);
    if (!code) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 h-7.5 rounded-xl text-xs font-medium bg-slate-50 text-slate-500 dark:bg-slate-900/60 dark:text-slate-400 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <span className="text-xs">🌐</span> Chưa xác định
        </span>
      );
    }
    const flag = FLAG_MAP[code] || "🌐";
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 h-7.5 rounded-xl text-xs font-bold bg-slate-50 text-slate-800 dark:bg-slate-900/60 dark:text-slate-200 border border-slate-200 dark:border-slate-800 shadow-2xs">
        <span className="text-xs">{flag}</span> {code}
      </span>
    );
  };

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return {
          dot: "bg-emerald-500",
          container:
            "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60",
        };
      case "WARMING":
        return {
          dot: "bg-amber-500",
          container:
            "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800/60",
        };
      case "RESTRICTED":
        return {
          dot: "bg-orange-500",
          container:
            "bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 border-orange-200 dark:border-orange-800/60",
        };
      case "BANNED":
        return {
          dot: "bg-rose-500",
          container:
            "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800/60",
        };
      case "STOPPED":
      default:
        return {
          dot: "bg-slate-400",
          container:
            "bg-slate-100 text-slate-600 dark:bg-slate-800/80 dark:text-slate-400 border-slate-200 dark:border-slate-700/80",
        };
    }
  };

  const renderSortIndicator = (key: AccountSortKey) => {
    if (sortConfig.key !== key) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60 group-hover:opacity-100 transition-opacity" />;
    }
    return sortConfig.desc ? (
      <ArrowDown className="w-3.5 h-3.5 text-pink-500" />
    ) : (
      <ArrowUp className="w-3.5 h-3.5 text-pink-500" />
    );
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header & Controls Section */}
      <div className="space-y-4">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2 min-w-0">
              <Users className="w-6 h-6 text-pink-500 shrink-0" />
              <span className="truncate">Quản Lý Dàn Tài Khoản TikTok</span>
              {loading ? (
                <span className="inline-block w-10 h-6 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse align-middle shrink-0" />
              ) : (
                <span className="shrink-0">({accounts.length})</span>
              )}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 truncate">
              Theo dõi trạng thái, phân công nhân sự, quản lý cảnh báo và đồng bộ số liệu qua GPM-Login.
            </p>
          </div>

          {isLeadOrAdmin && (
            <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
              {isAdmin && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        setViewTrash(!viewTrash);
                        setPage(1);
                        setSelectedIds(new Set());
                      }}
                      className={`h-10 flex items-center gap-2 px-3.5 rounded-xl text-xs font-bold border transition-all cursor-pointer whitespace-nowrap shrink-0 active:scale-95 ${viewTrash
                        ? "bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-600/30 font-extrabold"
                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                        }`}
                    >
                      <Trash2 className={`w-4 h-4 ${viewTrash ? "text-white" : "text-rose-500"}`} />
                      <span>
                        Thùng rác {stats?.trashCount !== undefined && stats.trashCount !== null ? `(${stats.trashCount})` : ""}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {viewTrash
                      ? "Đang xem thùng rác — bấm để quay lại danh sách chính"
                      : "Xem danh sách tài khoản đã xóa (Chỉ Admin)"}
                  </TooltipContent>
                </Tooltip>
              )}

              {!viewTrash && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setIsCreateOpen(true)}
                      className="h-10 flex items-center gap-2 px-4 rounded-xl text-sm font-bold bg-pink-600 hover:bg-pink-500 text-white shadow-lg shadow-pink-600/30 active:scale-95 transition-all cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-4 h-4 shrink-0" />
                      <span className="truncate">Thêm Tài Khoản</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs font-semibold">
                    Thêm tài khoản TikTok mới vào hệ thống
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
        </div>

        {/* Trash Mode Banner */}
        {viewTrash && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200 animate-in fade-in">
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
              <div className="min-w-0">
                <span className="font-bold">Thùng rác:</span>
                <span className="ml-1 text-slate-600 dark:text-slate-300">
                  Hiển thị các tài khoản TikTok đã được xóa tạm thời. Bạn có thể khôi phục tài khoản hoặc xóa vĩnh viễn.
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                setViewTrash(false);
                setPage(1);
                setSelectedIds(new Set());
              }}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-500/40 text-amber-700 dark:text-amber-300 font-bold hover:bg-amber-500/20 transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              ← Quay lại danh sách chính
            </button>
          </div>
        )}

        {actionMsg && (
          <div className="p-3.5 rounded-xl bg-cyan-50 dark:bg-slate-900 border border-cyan-200 dark:border-slate-800 text-xs font-bold text-center text-cyan-800 dark:text-cyan-300 shadow-sm animate-in fade-in">
            {actionMsg}
          </div>
        )}

        {/* KPI Stats Bar */}
        {!viewTrash && (loading || !fleetStats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate whitespace-nowrap">Tổng Số Acc</div>
              <div className="h-7 w-16 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse mt-1" />
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="truncate whitespace-nowrap">Đang Online</span>
              </div>
              <div className="h-7 w-14 bg-emerald-100 dark:bg-emerald-950/60 rounded-lg animate-pulse mt-1" />
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 min-w-0">
                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate whitespace-nowrap">Hoạt Động (Active)</span>
              </div>
              <div className="h-7 w-14 bg-emerald-100 dark:bg-emerald-950/60 rounded-lg animate-pulse mt-1" />
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
              <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 min-w-0">
                <Flame className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate whitespace-nowrap">Nuôi Acc (Warming)</span>
              </div>
              <div className="h-7 w-14 bg-amber-100 dark:bg-amber-950/60 rounded-lg animate-pulse mt-1" />
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
              <div className="text-xs font-semibold text-orange-600 dark:text-orange-400 flex items-center gap-1 min-w-0">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate whitespace-nowrap">Hạn Chế (Restricted)</span>
              </div>
              <div className="h-7 w-14 bg-orange-100 dark:bg-orange-950/60 rounded-lg animate-pulse mt-1" />
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
              <div className="text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1 min-w-0">
                <XCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate whitespace-nowrap">Bị Khóa (Banned)</span>
              </div>
              <div className="h-7 w-14 bg-rose-100 dark:bg-rose-950/60 rounded-lg animate-pulse mt-1" />
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
              <div className="text-xs font-semibold text-pink-600 dark:text-pink-400 flex items-center justify-between gap-1 min-w-0">
                <span className="truncate whitespace-nowrap">Doanh Thu Toàn Dàn</span>
                <Info className="w-3.5 h-3.5 opacity-40 shrink-0" />
              </div>
              <div className="h-7 w-20 bg-pink-100 dark:bg-pink-950/60 rounded-lg animate-pulse mt-1" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate whitespace-nowrap" title="Tổng Số Acc">
                Tổng Số Acc
              </div>
              <div className="text-xl font-black text-slate-900 dark:text-white mt-1">{fleetStats.total}</div>
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 min-w-0" title="Đang Online">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="truncate whitespace-nowrap">Đang Online</span>
              </div>
              <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1 flex items-baseline gap-1">
                <span>{fleetStats.online}</span>
                <span className="text-xs font-normal text-slate-400">/ {fleetStats.total}</span>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 min-w-0" title="Hoạt Động (Active)">
                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate whitespace-nowrap">Hoạt Động (Active)</span>
              </div>
              <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{fleetStats.active}</div>
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
              <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 min-w-0" title="Nuôi Acc (Warming)">
                <Flame className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate whitespace-nowrap">Nuôi Acc (Warming)</span>
              </div>
              <div className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1">{fleetStats.warming}</div>
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
              <div className="text-xs font-semibold text-orange-600 dark:text-orange-400 flex items-center gap-1 min-w-0" title="Hạn Chế (Restricted)">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate whitespace-nowrap">Hạn Chế (Restricted)</span>
              </div>
              <div className="text-xl font-black text-orange-600 dark:text-orange-400 mt-1">{fleetStats.restricted}</div>
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
              <div className="text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1 min-w-0" title="Bị Khóa (Banned)">
                <XCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate whitespace-nowrap">Bị Khóa (Banned)</span>
              </div>
              <div className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1">{fleetStats.banned}</div>
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
              <div className="text-xs font-semibold text-pink-600 dark:text-pink-400 flex items-center justify-between gap-1 min-w-0">
                <span className="truncate whitespace-nowrap" title="Doanh Thu Toàn Dàn (Tháng Này)">
                  Doanh Thu Toàn Dàn
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="text-pink-400 hover:text-pink-600 dark:hover:text-pink-300 transition-colors p-0.5 rounded cursor-help shrink-0"
                      aria-label="Thông tin doanh thu tháng này"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="text-xs max-w-xs space-y-1.5 bg-slate-900 text-white border-slate-800 shadow-xl p-3"
                  >
                    <div className="font-bold text-pink-400 border-b border-slate-700/80 pb-1 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-pink-400" />
                      <span>Doanh Thu Toàn Dàn (Tháng Này)</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Số tiền hiển thị là tổng doanh thu từ <strong>ngày 01 tháng này đến hiện tại</strong> được tổng hợp từ toàn bộ tài khoản TikTok trong hệ thống.
                    </p>
                    <div className="pt-1.5 mt-1 border-t border-slate-800 space-y-1 text-[11px]">
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-400">7 ngày gần nhất:</span>
                        <span className="font-semibold text-cyan-300">
                          ${fleetRevenuePeriods.revenue7d.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-400">28 ngày gần nhất:</span>
                        <span className="font-semibold text-purple-300">
                          ${fleetRevenuePeriods.revenue28d.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-400">Tháng này:</span>
                        <span className="font-bold text-pink-400">
                          ${fleetRevenueThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-400">60 ngày gần nhất:</span>
                        <span className="font-semibold text-indigo-300">
                          ${fleetRevenuePeriods.revenue60d.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-400">365 ngày gần nhất:</span>
                        <span className="font-semibold text-amber-300">
                          ${fleetRevenuePeriods.revenue365d.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      {fleetRevenueAllTime > 0 && (
                        <div className="flex justify-between gap-4 pt-1 border-t border-slate-800 font-bold">
                          <span className="text-slate-300">Toàn bộ (All-time):</span>
                          <span className="font-semibold text-emerald-400">
                            ${fleetRevenueAllTime.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="text-xl font-black text-pink-600 dark:text-pink-400 mt-1">
                ${fleetRevenueThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        ))}

        {/* Filter & Toolbar Area (Sticky only on desktop) */}
        <div className="lg:sticky lg:top-[72px] z-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm space-y-3">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 w-full min-w-0">
            {/* Left Group: Search input + Fast Filters + Advanced Filter */}
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              {/* Search Box */}
              <div className="relative w-full sm:w-44 md:w-48 lg:w-56 min-w-[160px]">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm username, nickname, email..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="w-full h-9 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-8 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-pink-500 transition-colors"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setPage(1);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                    title="Xóa tìm kiếm"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Leader & Admin Team Filter: Replaces Status filter on toolbar */}
              {isLeadOrAdmin && (
                <div className="relative shrink-0">
                  <Select
                    value={teamFilter}
                    onValueChange={handleTeamChange}
                  >
                    <SelectTrigger
                      className={`w-40 sm:w-44 h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer whitespace-nowrap [&>span]:truncate transition-colors ${teamFilter !== "ALL"
                        ? "pr-8 border-pink-200 dark:border-pink-900/60 bg-pink-50/40 dark:bg-pink-950/25 text-pink-700 dark:text-pink-300 [&_svg]:hidden font-medium"
                        : ""
                        }`}
                    >
                      <SelectValue placeholder="Đội nhóm">
                        {selectedTeamName}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-60">
                      <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">
                        Tất cả đội nhóm ({allTeams.length} nhóm)
                      </SelectItem>
                      {allTeams.map((t: any) => (
                        <SelectItem key={t.id} value={t.id} className="text-xs font-normal cursor-pointer">
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {teamFilter !== "ALL" && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            handleTeamChange("ALL");
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200/90 hover:bg-rose-500 hover:text-white dark:bg-slate-800 dark:hover:bg-rose-500 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all z-10 cursor-pointer shadow-2xs hover:scale-110"
                          aria-label="Xóa chọn đội nhóm"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Xóa chọn đội nhóm</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}

              {/* Status Fast Filter (For staff only in Fleet mode) */}
              {!isLeadOrAdmin && !viewTrash && (
                <div className="relative shrink-0">
                  <Select
                    value={statusFilter}
                    onValueChange={(val) => {
                      setStatusFilter(val);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger
                      className={`w-40 h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer whitespace-nowrap [&>span]:truncate transition-colors ${statusFilter !== "ALL"
                        ? "pr-8 border-pink-200 dark:border-pink-900/60 bg-pink-50/40 dark:bg-pink-950/25 text-pink-700 dark:text-pink-300 [&_svg]:hidden"
                        : ""
                        }`}
                    >
                      <SelectValue placeholder="Trạng thái" />
                    </SelectTrigger>
                    <SelectContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
                      <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">Tất cả trạng thái</SelectItem>
                      <SelectItem value="ACTIVE" className="text-xs font-normal cursor-pointer">Active</SelectItem>
                      <SelectItem value="WARMING" className="text-xs font-normal cursor-pointer">Warming</SelectItem>
                      <SelectItem value="RESTRICTED" className="text-xs font-normal cursor-pointer">Restricted</SelectItem>
                      <SelectItem value="BANNED" className="text-xs font-normal cursor-pointer">Banned</SelectItem>
                      <SelectItem value="STOPPED" className="text-xs font-normal cursor-pointer">Stopped</SelectItem>
                    </SelectContent>
                  </Select>
                  {statusFilter !== "ALL" && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setStatusFilter("ALL");
                            setPage(1);
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200/90 hover:bg-rose-500 hover:text-white dark:bg-slate-800 dark:hover:bg-rose-500 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all z-10 cursor-pointer shadow-2xs hover:scale-110"
                          aria-label="Xóa chọn trạng thái"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Xóa chọn trạng thái</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}

              {/* Assigned Staff Fast Filter (Admin and Lead only) */}
              {isLeadOrAdmin && (
                <div className="relative shrink-0">
                  <Select
                    value={assignedFilter}
                    onValueChange={(val) => {
                      setAssignedFilter(val);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger
                      className={`w-40 sm:w-44 h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer whitespace-nowrap [&>span]:truncate transition-colors ${assignedFilter !== "ALL"
                        ? "pr-8 border-pink-200 dark:border-pink-900/60 bg-pink-50/40 dark:bg-pink-950/25 text-pink-700 dark:text-pink-300 [&_svg]:hidden"
                        : ""
                        }`}
                    >
                      <SelectValue placeholder="Nhân sự" />
                    </SelectTrigger>
                    <SelectContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-60">
                      <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">Tất cả nhân sự</SelectItem>
                      {filteredStaffUsers.map((u: any) => (
                        <SelectItem key={u.id} value={u.id} className="text-xs font-normal cursor-pointer">
                          <div className="flex items-center gap-2">
                            {renderUserAvatar(u, "w-4 h-4 text-[8px]")}
                            <span className="truncate">{u.fullName}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {assignedFilter !== "ALL" && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setAssignedFilter("ALL");
                            setPage(1);
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200/90 hover:bg-rose-500 hover:text-white dark:bg-slate-800 dark:hover:bg-rose-500 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all z-10 cursor-pointer shadow-2xs hover:scale-110"
                          aria-label="Xóa chọn nhân sự"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Xóa chọn nhân sự</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}

              {/* Advanced Filter Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={`h-9 inline-flex items-center gap-1.5 px-3 rounded-xl text-xs font-normal border transition-all cursor-pointer shrink-0 whitespace-nowrap ${activeAdvancedCount > 0
                      ? "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800"
                      : "bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900"
                      }`}
                  >
                    <Filter className="w-3.5 h-3.5" />
                    <span>Bộ lọc nâng cao</span>
                    {activeAdvancedCount > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              clearAdvancedFilters();
                            }}
                            className="group/badge relative ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-purple-600 hover:bg-rose-600 text-white text-[10px] font-bold transition-colors cursor-pointer shadow-2xs"
                            aria-label="Xóa tất cả bộ lọc nâng cao"
                          >
                            <span className="group-hover/badge:hidden">{activeAdvancedCount}</span>
                            <X className="w-2.5 h-2.5 hidden group-hover/badge:block stroke-[2.5]" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">Xóa tất cả bộ lọc nâng cao</TooltipContent>
                      </Tooltip>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  side="bottom"
                  sideOffset={6}
                  collisionPadding={16}
                  avoidCollisions={true}
                  className="w-72 sm:w-80 p-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl flex flex-col max-h-[min(380px,calc(100vh-220px),var(--radix-popover-content-available-height,380px))] overflow-hidden"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 p-4 pb-3 shrink-0 bg-white dark:bg-slate-900">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">Bộ lọc chi tiết</h4>
                    {activeAdvancedCount > 0 && (
                      <button
                        onClick={clearAdvancedFilters}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/50 transition-colors cursor-pointer"
                      >
                        Đặt lại
                      </button>
                    )}
                  </div>

                  <div className="p-4 pt-3 overflow-y-auto space-y-3.5 flex-1 overscroll-contain">

                  {/* Trạng thái tài khoản (Khi là Leader hoặc Admin) */}
                  {isLeadOrAdmin && (
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                        Trạng thái tài khoản
                      </label>
                      <div className="relative">
                        <Select
                          value={statusFilter}
                          onValueChange={(val) => {
                            setStatusFilter(val);
                            setPage(1);
                          }}
                        >
                          <SelectTrigger
                            className={`w-full h-8.5 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer transition-colors ${statusFilter !== "ALL"
                              ? "pr-8 border-pink-200 dark:border-pink-900/60 bg-pink-50/40 dark:bg-pink-950/25 text-pink-700 dark:text-pink-300 [&_svg]:hidden"
                              : ""
                              }`}
                          >
                            <SelectValue placeholder="Tất cả trạng thái" />
                          </SelectTrigger>
                          <SelectContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
                            <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">Tất cả trạng thái</SelectItem>
                            <SelectItem value="ACTIVE" className="text-xs font-normal cursor-pointer">Active</SelectItem>
                            <SelectItem value="WARMING" className="text-xs font-normal cursor-pointer">Warming</SelectItem>
                            <SelectItem value="RESTRICTED" className="text-xs font-normal cursor-pointer">Restricted</SelectItem>
                            <SelectItem value="BANNED" className="text-xs font-normal cursor-pointer">Banned</SelectItem>
                            <SelectItem value="STOPPED" className="text-xs font-normal cursor-pointer">Stopped</SelectItem>
                          </SelectContent>
                        </Select>
                        {statusFilter !== "ALL" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setStatusFilter("ALL");
                                  setPage(1);
                                }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200/90 hover:bg-rose-500 hover:text-white dark:bg-slate-800 dark:hover:bg-rose-500 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all z-10 cursor-pointer shadow-2xs hover:scale-110"
                                aria-label="Xóa chọn trạng thái"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Xóa chọn trạng thái</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Trạng thái mở Profile GPM (Online / Offline) */}
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Trình duyệt GPM (Online / Offline)
                    </label>
                    <div className="relative">
                      <Select
                        value={onlineFilter}
                        onValueChange={(val: any) => {
                          setOnlineFilter(val);
                          setPage(1);
                        }}
                      >
                        <SelectTrigger
                          className={`w-full h-8.5 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer transition-colors ${onlineFilter !== "ALL"
                            ? "pr-8 border-pink-200 dark:border-pink-900/60 bg-pink-50/40 dark:bg-pink-950/25 text-pink-700 dark:text-pink-300 [&_svg]:hidden"
                            : ""
                            }`}
                        >
                          <SelectValue placeholder="Tất cả trạng thái mở" />
                        </SelectTrigger>
                        <SelectContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
                          <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">Tất cả (Mở &amp; Đóng)</SelectItem>
                          <SelectItem value="ONLINE" className="text-xs font-normal cursor-pointer">
                            <span className="inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 shadow-xs shadow-emerald-500/50" />
                              <span>Đang mở profile (Online)</span>
                            </span>
                          </SelectItem>
                          <SelectItem value="OFFLINE" className="text-xs font-normal cursor-pointer">
                            <span className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400 font-medium">
                              <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 shrink-0" />
                              <span>Đang đóng (Offline)</span>
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {onlineFilter !== "ALL" && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setOnlineFilter("ALL");
                                setPage(1);
                              }}
                              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200/90 hover:bg-rose-500 hover:text-white dark:bg-slate-800 dark:hover:bg-rose-500 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all z-10 cursor-pointer shadow-2xs hover:scale-110"
                              aria-label="Xóa chọn trạng thái mở"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top">Xóa chọn trạng thái mở</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>

                  {/* Trạng thái đồng bộ (Sync Status) */}
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Trạng thái đồng bộ (Sync)
                    </label>
                    <div className="relative">
                      <Select
                        value={syncFilter}
                        onValueChange={(val: any) => {
                          setSyncFilter(val);
                          setPage(1);
                        }}
                      >
                        <SelectTrigger
                          className={`w-full h-8.5 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer transition-colors ${syncFilter !== "ALL"
                            ? "pr-8 border-pink-200 dark:border-pink-900/60 bg-pink-50/40 dark:bg-pink-950/25 text-pink-700 dark:text-pink-300 [&_svg]:hidden"
                            : ""
                            }`}
                        >
                          <SelectValue placeholder="Tất cả đồng bộ" />
                        </SelectTrigger>
                        <SelectContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
                          <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">Tất cả đồng bộ</SelectItem>
                          <SelectItem value="SYNC_OK" className="text-xs font-normal cursor-pointer">
                            <span className="inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                              <span>Đồng bộ tốt (&lt; 24h)</span>
                            </span>
                          </SelectItem>
                          <SelectItem value="SYNC_ISSUES" className="text-xs font-normal cursor-pointer">
                            <span className="inline-flex items-center gap-2 text-rose-600 dark:text-rose-400 font-medium">
                              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                              <span>Lỗi sync / Cần xử lý</span>
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {syncFilter !== "ALL" && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setSyncFilter("ALL");
                                setPage(1);
                              }}
                              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200/90 hover:bg-rose-500 hover:text-white dark:bg-slate-800 dark:hover:bg-rose-500 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all z-10 cursor-pointer shadow-2xs hover:scale-110"
                              aria-label="Xóa chọn trạng thái sync"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top">Xóa chọn trạng thái sync</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>

                  {/* Quốc gia */}
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Quốc gia
                    </label>
                    <div className="relative">
                      <Select
                        value={countryFilter}
                        onValueChange={(val) => {
                          setCountryFilter(val);
                          setPage(1);
                        }}
                      >
                        <SelectTrigger
                          className={`w-full h-8.5 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer transition-colors ${countryFilter !== "ALL"
                            ? "pr-8 border-pink-200 dark:border-pink-900/60 bg-pink-50/40 dark:bg-pink-950/25 text-pink-700 dark:text-pink-300 [&_svg]:hidden"
                            : ""
                            }`}
                        >
                          <SelectValue placeholder="Tất cả quốc gia" />
                        </SelectTrigger>
                        <SelectContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-60">
                          <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">Tất cả quốc gia</SelectItem>
                          {COUNTRY_OPTIONS.map((c) => (
                            <SelectItem key={c.value} value={c.value} className="text-xs font-normal cursor-pointer">
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {countryFilter !== "ALL" && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setCountryFilter("ALL");
                                setPage(1);
                              }}
                              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200/90 hover:bg-rose-500 hover:text-white dark:bg-slate-800 dark:hover:bg-rose-500 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all z-10 cursor-pointer shadow-2xs hover:scale-110"
                              aria-label="Xóa chọn quốc gia"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top">Xóa chọn quốc gia</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>

                  {/* Cảnh báo vi phạm */}
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Cảnh báo vi phạm
                    </label>
                    <div className="relative">
                      <Select
                        value={warningFilter}
                        onValueChange={(val) => {
                          setWarningFilter(val as any);
                          setPage(1);
                        }}
                      >
                        <SelectTrigger
                          className={`w-full h-8.5 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer transition-colors ${warningFilter !== "ALL"
                            ? "pr-8 border-pink-200 dark:border-pink-900/60 bg-pink-50/40 dark:bg-pink-950/25 text-pink-700 dark:text-pink-300 [&_svg]:hidden"
                            : ""
                            }`}
                        >
                          <SelectValue placeholder="Tất cả" />
                        </SelectTrigger>
                        <SelectContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
                          <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">Tất cả</SelectItem>
                          <SelectItem value="HAS_WARNING" className="text-xs font-normal cursor-pointer">Có cảnh báo vi phạm</SelectItem>
                          <SelectItem value="CLEAN" className="text-xs font-normal cursor-pointer">Sạch sẽ (Không cảnh báo)</SelectItem>
                        </SelectContent>
                      </Select>
                      {warningFilter !== "ALL" && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setWarningFilter("ALL");
                                setPage(1);
                              }}
                              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200/90 hover:bg-rose-500 hover:text-white dark:bg-slate-800 dark:hover:bg-rose-500 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all z-10 cursor-pointer shadow-2xs hover:scale-110"
                              aria-label="Xóa chọn cảnh báo"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top">Xóa chọn cảnh báo</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>

                  {/* Đồng bộ GPM-Login */}
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Đồng bộ GPM-Login
                    </label>
                    <div className="relative">
                      <Select
                        value={gpmFilter}
                        onValueChange={(val) => {
                          setGpmFilter(val as any);
                          setPage(1);
                        }}
                      >
                        <SelectTrigger
                          className={`w-full h-8.5 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer transition-colors ${gpmFilter !== "ALL"
                            ? "pr-8 border-pink-200 dark:border-pink-900/60 bg-pink-50/40 dark:bg-pink-950/25 text-pink-700 dark:text-pink-300 [&_svg]:hidden"
                            : ""
                            }`}
                        >
                          <SelectValue placeholder="Tất cả" />
                        </SelectTrigger>
                        <SelectContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
                          <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">Tất cả</SelectItem>
                          <SelectItem value="LINKED" className="text-xs font-normal cursor-pointer">Đã liên kết Profile GPM</SelectItem>
                          <SelectItem value="NOT_LINKED" className="text-xs font-normal cursor-pointer">Chưa liên kết Profile GPM</SelectItem>
                        </SelectContent>
                      </Select>
                      {gpmFilter !== "ALL" && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setGpmFilter("ALL");
                                setPage(1);
                              }}
                              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200/90 hover:bg-rose-500 hover:text-white dark:bg-slate-800 dark:hover:bg-rose-500 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all z-10 cursor-pointer shadow-2xs hover:scale-110"
                              aria-label="Xóa chọn GPM"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top">Xóa chọn GPM</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>

                  {/* Lượt xem tối thiểu */}
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Lượt xem tối thiểu (Views)
                    </label>
                    <div className="relative">
                      <Input
                        type="number"
                        placeholder="e.g. 10000"
                        value={minViews}
                        onChange={(e) => {
                          setMinViews(e.target.value);
                          setPage(1);
                        }}
                        className={`h-8.5 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 transition-colors ${
                          minViews
                            ? "pr-8 border-pink-200 dark:border-pink-900/60 bg-pink-50/40 dark:bg-pink-950/25 text-pink-700 dark:text-pink-300"
                            : ""
                        }`}
                      />
                      {minViews && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => {
                                setMinViews("");
                                setPage(1);
                              }}
                              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200/90 hover:bg-rose-500 hover:text-white dark:bg-slate-800 dark:hover:bg-rose-500 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all z-10 cursor-pointer shadow-2xs hover:scale-110"
                              aria-label="Xóa lọc views"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top">Xóa lọc views</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>

                  {/* Doanh thu tối thiểu */}
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Doanh thu tối thiểu ($)
                    </label>
                    <div className="relative">
                      <Input
                        type="number"
                        placeholder="e.g. 50"
                        value={minRevenue}
                        onChange={(e) => {
                          setMinRevenue(e.target.value);
                          setPage(1);
                        }}
                        className={`h-8.5 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 transition-colors ${
                          minRevenue
                            ? "pr-8 border-pink-200 dark:border-pink-900/60 bg-pink-50/40 dark:bg-pink-950/25 text-pink-700 dark:text-pink-300"
                            : ""
                        }`}
                      />
                      {minRevenue && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => {
                                setMinRevenue("");
                                setPage(1);
                              }}
                              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200/90 hover:bg-rose-500 hover:text-white dark:bg-slate-800 dark:hover:bg-rose-500 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all z-10 cursor-pointer shadow-2xs hover:scale-110"
                              aria-label="Xóa lọc doanh thu"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top">Xóa lọc doanh thu</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                </div>
              </PopoverContent>
              </Popover>
            </div>

            {/* Action Controls Group: Sort, View Switcher & Column Customizer (Aligned to left on wrapped row) */}
            <div className="flex items-center gap-2.5 shrink-0 self-start xl:self-auto xl:ml-auto">
              {/* Sort Popover with background effect & hover tooltip */}
              <Popover>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={`h-9 inline-flex items-center gap-1.5 px-3 rounded-xl text-xs transition-all cursor-pointer ${sortConfig.key
                          ? "bg-pink-50/80 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800/80 hover:bg-pink-100 dark:hover:bg-pink-900/50 shadow-2xs font-medium"
                          : "bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 font-normal"
                          }`}
                      >
                        <SlidersHorizontal className={`w-3.5 h-3.5 ${sortConfig.key ? "text-pink-600 dark:text-pink-400" : "text-slate-500"}`} />
                        <span>Sắp xếp</span>
                        {currentSortOption && (
                          <span className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-pink-100/90 dark:bg-pink-900/60 text-pink-700 dark:text-pink-300 border border-pink-200/60 dark:border-pink-800/60">
                            {currentSortOption.label} {sortConfig.desc ? "↓" : "↑"}
                          </span>
                        )}
                      </button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Đang sắp xếp: {currentSortOption.label} ({sortDirectionText})
                  </TooltipContent>
                </Tooltip>
                <PopoverContent align="end" className="w-64 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl space-y-1.5">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white pb-1 border-b border-slate-100 dark:border-slate-800">
                    Sắp xếp theo cột
                  </div>
                  {ACCOUNT_SORT_OPTIONS.map((item) => {
                    const isSelected = sortConfig.key === item.key;
                    return (
                      <button
                        key={item.key}
                        onClick={() => handleSort(item.key)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${isSelected
                          ? "bg-pink-50/80 dark:bg-pink-950/50 text-pink-700 dark:text-pink-300 font-semibold border border-pink-200/80 dark:border-pink-900/60"
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent font-normal"
                          }`}
                      >
                        <span>{item.label}</span>
                        {isSelected && (
                          <span className="text-xs font-bold text-pink-600 dark:text-pink-400">
                            {sortConfig.desc ? "Giảm dần ↓" : "Tăng dần ↑"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </PopoverContent>
              </Popover>

              {/* View Mode Switcher with Tooltip */}
              <div className="flex items-center p-0.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => handleViewModeChange("grid")}
                      className={`flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-semibold transition-all cursor-pointer ${viewMode === "grid"
                        ? "bg-white dark:bg-slate-900 text-pink-600 dark:text-pink-400 shadow-xs font-bold"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                        }`}
                      aria-label="Chế độ xem dạng lưới (Cards)"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Lưới</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Chế độ xem dạng lưới (Cards)</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => handleViewModeChange("list")}
                      className={`flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-semibold transition-all cursor-pointer ${viewMode === "list"
                        ? "bg-white dark:bg-slate-900 text-pink-600 dark:text-pink-400 shadow-xs font-bold"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                        }`}
                      aria-label="Chế độ xem dạng danh sách (Bảng)"
                    >
                      <List className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Bảng</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Chế độ xem dạng danh sách (Bảng)</TooltipContent>
                </Tooltip>
              </div>

              {/* Column Visibility Popover (List View Only) */}
              {viewMode === "list" && (
                <Popover>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <button
                          className="flex items-center gap-1.5 h-9 px-3 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 shadow-none cursor-pointer"
                          aria-label="Tùy chỉnh cột hiển thị"
                        >
                          <Columns3 className="w-3.5 h-3.5 text-slate-500" />
                          <span>Cột hiển thị</span>
                        </button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="top">Tùy chỉnh cột hiển thị</TooltipContent>
                  </Tooltip>
                  <PopoverContent
                    align="end"
                    className="w-60 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl space-y-1"
                  >
                    <div className="px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <span>Tùy chỉnh cột hiển thị</span>
                      <button
                        onClick={() =>
                          setVisibleColumns({
                            username: true,
                            gpmProfileName: true,
                            gpmGroup: true,
                            gpmProfileId: true,
                            country: true,
                            status: true,
                            syncStatus: true,
                            assignedUser: true,
                            totalViews: true,
                            totalFollowers: true,
                            totalVideos: true,
                            totalRevenue: true,
                            alertsCount: true,
                            actions: true,
                          })
                        }
                        className="px-2 py-0.5 rounded-md text-xs text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950/40 transition-colors font-medium cursor-pointer"
                      >
                        Mặc định
                      </button>
                    </div>
                    <div className="space-y-1 pt-1 max-h-64 overflow-y-auto pr-1">
                      {[
                        { key: "username", label: "Tài khoản", locked: true },
                        { key: "gpmProfileName", label: "GPM Profile Name" },
                        { key: "gpmGroup", label: "GPM Group" },
                        { key: "gpmProfileId", label: "GPM Profile ID" },
                        { key: "country", label: "Quốc gia" },
                        { key: "status", label: "Trạng thái" },
                        { key: "syncStatus", label: "Trạng thái Đồng bộ" },
                        { key: "assignedUser", label: "Người phụ trách" },
                        { key: "totalViews", label: "Số views" },
                        { key: "totalFollowers", label: "Số followers" },
                        { key: "totalVideos", label: "Số video" },
                        { key: "totalRevenue", label: "Doanh thu" },
                        { key: "alertsCount", label: "Cảnh báo" },
                        { key: "actions", label: "Thao tác" },
                      ].map((col) => (
                        <label
                          key={col.key}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none ${col.locked ? "opacity-70 cursor-not-allowed" : "cursor-pointer"
                            }`}
                        >
                          <Checkbox
                            checked={visibleColumns[col.key as keyof typeof visibleColumns]}
                            disabled={col.locked}
                            onCheckedChange={(checked) => {
                              if (col.locked) return;
                              setVisibleColumns((prev) => ({
                                ...prev,
                                [col.key]: !!checked,
                              }));
                            }}
                          />
                          <span className="text-slate-700 dark:text-slate-300 font-normal">
                            {col.label}
                          </span>
                          {col.locked && (
                            <span className="text-xs text-slate-400 ml-auto font-normal">
                              (Bắt buộc)
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>

          {/* Active Filter Chips */}
          {totalActiveFiltersCount > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {search && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  <span>Tìm: {search}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => setSearch("")} className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/15 hover:text-rose-500 transition-colors cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Xóa bộ lọc</TooltipContent>
                  </Tooltip>
                </span>
              )}
              {isLead && teamFilter !== "ALL" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300">
                  <span>Đội nhóm: {allTeams.find((t: any) => t.id === teamFilter)?.name || teamFilter}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => handleTeamChange("ALL")} className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/15 hover:text-rose-500 transition-colors cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Xóa bộ lọc đội nhóm</TooltipContent>
                  </Tooltip>
                </span>
              )}
              {statusFilter !== "ALL" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300">
                  <span>Trạng thái: {statusFilter}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => setStatusFilter("ALL")} className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/15 hover:text-rose-500 transition-colors cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Xóa bộ lọc</TooltipContent>
                  </Tooltip>
                </span>
              )}
              {onlineFilter !== "ALL" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${onlineFilter === "ONLINE"
                      ? "bg-emerald-500 shadow-xs shadow-emerald-500/50"
                      : "bg-slate-400 dark:bg-slate-500"
                      }`}
                  />
                  <span>
                    {onlineFilter === "ONLINE"
                      ? "Profile GPM: Đang mở (Online)"
                      : "Profile GPM: Đang đóng (Offline)"}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => setOnlineFilter("ALL")} className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/15 hover:text-rose-500 transition-colors cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Xóa bộ lọc</TooltipContent>
                  </Tooltip>
                </span>
              )}
              {syncFilter !== "ALL" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${syncFilter === "SYNC_ISSUES"
                      ? "bg-rose-500 shadow-xs shadow-rose-500/50"
                      : "bg-emerald-500"
                      }`}
                  />
                  <span>
                    {syncFilter === "SYNC_ISSUES"
                      ? "Lỗi sync / Cần xử lý"
                      : "Đồng bộ tốt (< 24h)"}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => setSyncFilter("ALL")} className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/15 hover:text-rose-500 transition-colors cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Xóa bộ lọc</TooltipContent>
                  </Tooltip>
                </span>
              )}
              {countryFilter !== "ALL" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300">
                  <span>Quốc gia: {COUNTRY_OPTIONS.find((c) => c.value === countryFilter)?.label || countryFilter}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => setCountryFilter("ALL")} className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/15 hover:text-rose-500 transition-colors cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Xóa bộ lọc</TooltipContent>
                  </Tooltip>
                </span>
              )}
              {isLeadOrAdmin && assignedFilter !== "ALL" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300">
                  <span>Nhân sự: {users.find((u: any) => u.id === assignedFilter)?.fullName || assignedFilter}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => setAssignedFilter("ALL")} className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/15 hover:text-rose-500 transition-colors cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Xóa bộ lọc</TooltipContent>
                  </Tooltip>
                </span>
              )}
              {warningFilter !== "ALL" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                  <span>{warningFilter === "HAS_WARNING" ? "Có cảnh báo" : "Không có cảnh báo"}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => setWarningFilter("ALL")} className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/15 hover:text-rose-500 transition-colors cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Xóa bộ lọc</TooltipContent>
                  </Tooltip>
                </span>
              )}
              {gpmFilter !== "ALL" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
                  <span>{gpmFilter === "LINKED" ? "GPM Linked" : "Chưa gắn GPM"}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => setGpmFilter("ALL")} className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/15 hover:text-rose-500 transition-colors cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Xóa bộ lọc</TooltipContent>
                  </Tooltip>
                </span>
              )}
              {minViews && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  <span>Views ≥ {Number(minViews).toLocaleString()}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => setMinViews("")} className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/15 hover:text-rose-500 transition-colors cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Xóa bộ lọc</TooltipContent>
                  </Tooltip>
                </span>
              )}
              {minRevenue && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                  <span>Doanh thu ≥ ${minRevenue}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => setMinRevenue("")} className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/15 hover:text-rose-500 transition-colors cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Xóa bộ lọc</TooltipContent>
                  </Tooltip>
                </span>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={clearAllFilters}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer ml-1"
                  >
                    Xóa tất cả
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Xóa tất cả bộ lọc đang áp dụng</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area: Grid or Table */}
      {loading ? (
        viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 pb-4">
            {[...Array(pageSize)].map((_, i) => (
              <div
                key={i}
                className="relative flex flex-col bg-white dark:bg-slate-900/80 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-5 space-y-4 animate-pulse"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-6 w-14 rounded-xl bg-slate-200 dark:bg-slate-800" />
                  </div>
                  <div className="h-6 w-20 rounded-lg bg-slate-200 dark:bg-slate-800" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-slate-200 dark:bg-slate-800 shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-3 w-1/2 rounded bg-slate-100 dark:bg-slate-800/60" />
                  </div>
                </div>
                <div className="h-8 rounded-xl bg-slate-100 dark:bg-slate-800/60" />
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="h-10 rounded-xl bg-slate-100 dark:bg-slate-800/40" />
                  <div className="h-10 rounded-xl bg-slate-100 dark:bg-slate-800/40" />
                  <div className="h-10 rounded-xl bg-slate-100 dark:bg-slate-800/40" />
                  <div className="h-10 rounded-xl bg-slate-100 dark:bg-slate-800/40" />
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="h-7 w-20 rounded-lg bg-slate-200 dark:bg-slate-800" />
                  <div className="h-7 w-16 rounded-lg bg-slate-200 dark:bg-slate-800" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <DataTableSkeleton columnCount={visibleColumnCount} rowCount={pageSize} />
        )
      ) : filteredAndSortedAccounts.length === 0 ? (
        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-8 text-center shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-pink-50 dark:bg-pink-950/40 text-pink-500 dark:text-pink-400 flex items-center justify-center mb-4">
            <Users className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Không tìm thấy tài khoản nào phù hợp
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
            Thử thay đổi từ khóa tìm kiếm hoặc làm mới các tiêu chí bộ lọc để xem kết quả.
          </p>
          {totalActiveFiltersCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="mt-4 px-4 py-2 text-xs font-semibold text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950/40 rounded-xl transition-colors cursor-pointer"
            >
              Xóa tất cả bộ lọc
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 pb-2">
              {paginatedAccounts.map((acc: any) => {
                const isSelected = selectedIds.has(acc.id);
                const cardPunishedVideos = getPunishedVideos30d(acc);
                return (
                  <div
                    key={acc.id}
                    className={`group relative flex flex-col bg-white dark:bg-slate-900/90 rounded-2xl border transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 overflow-hidden ${isSelected
                      ? "border-pink-500 ring-2 ring-pink-500/20 bg-pink-50/10 dark:bg-pink-950/10 shadow-md"
                      : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs"
                      }`}
                  >
                    {/* Top Bar: Checkbox + Online & Status Badges + Actions */}
                    <div className="p-4 pb-0 flex items-center justify-between gap-1.5">
                      <div className="flex items-center shrink-0">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelectRow(acc.id)}
                          aria-label={`Chọn @${acc.username}`}
                        />
                      </div>

                      <div className="flex items-center gap-1.5 min-w-0 justify-end flex-nowrap">
                        <SyncStatusBadge
                          account={acc}
                          mode="compact"
                          className="h-6.5 px-2 text-[11px] font-bold rounded-full border inline-flex items-center gap-1 shadow-2xs shrink-0"
                        />

                        {/* Status Select - Styled as twin badge */}
                        {(() => {
                          const badgeStyle = getStatusBadgeStyle(acc.status);
                          const isBanned = acc.status === "BANNED";
                          const badgeElement = isLeadOrAdmin ? (
                            <Select
                              value={acc.status}
                              onValueChange={(val) => handleStatusChange(acc.id, val)}
                            >
                              <SelectTrigger
                                className={`h-6.5 w-auto px-2 text-[11px] font-bold rounded-full border transition-all shadow-2xs cursor-pointer gap-1 inline-flex items-center shrink-0 [&>svg]:size-2.5 [&>svg]:opacity-70 [&>svg]:text-current ${badgeStyle.container}`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${badgeStyle.dot}`} />
                                <SelectValue className="font-bold text-inherit" />
                              </SelectTrigger>
                              <SelectContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-1">
                                <SelectItem value="ACTIVE" className="text-xs font-semibold cursor-pointer rounded-xl py-1.5">Active</SelectItem>
                                <SelectItem value="WARMING" className="text-xs font-semibold cursor-pointer rounded-xl py-1.5">Warming</SelectItem>
                                <SelectItem value="RESTRICTED" className="text-xs font-semibold cursor-pointer rounded-xl py-1.5">Restricted</SelectItem>
                                <SelectItem value="BANNED" className="text-xs font-semibold cursor-pointer rounded-xl py-1.5">Banned</SelectItem>
                                <SelectItem value="STOPPED" className="text-xs font-semibold cursor-pointer rounded-xl py-1.5">Stopped</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span
                              className={`h-6.5 w-auto px-2 text-[11px] font-bold rounded-full border shadow-2xs gap-1 inline-flex items-center shrink-0 select-none ${badgeStyle.container}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${badgeStyle.dot}`} />
                              <span>{acc.status}</span>
                            </span>
                          );

                          if (isBanned) {
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="inline-flex cursor-help">{badgeElement}</div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs bg-rose-950 text-rose-100 border-rose-800 p-2 shadow-xl max-w-xs">
                                  <div className="font-bold">⚠️ Bị ngừng chương trình TikTok Beta</div>
                                  {acc.bannedReason && (
                                    <div className="text-[11px] text-rose-300 mt-1 font-normal">{acc.bannedReason}</div>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            );
                          }
                          return badgeElement;
                        })()}

                        {/* More Actions Dropdown */}
                        <DropdownMenu>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                  aria-label="Thao tác"
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </button>
                              </DropdownMenuTrigger>
                            </TooltipTrigger>
                            <TooltipContent side="top">Tùy chọn thao tác</TooltipContent>
                          </Tooltip>
                          <DropdownMenuContent align="end" className="w-48 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl p-1.5 shadow-xl">
                            {viewTrash ? (
                              <>
                                <DropdownMenuItem
                                  onClick={() => restoreMutation.mutate({ id: acc.id })}
                                  disabled={restoreMutation.isPending}
                                  className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-xl cursor-pointer"
                                >
                                  <RotateCcw className="w-3.5 h-3.5 text-emerald-500" />
                                  <span>Khôi phục tài khoản</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleOpenLogs(acc)}
                                  className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                                >
                                  <History className="w-3.5 h-3.5 text-slate-400" />
                                  <span>Lịch sử hoạt động</span>
                                </DropdownMenuItem>
                                {isAdmin && (
                                  <>
                                    <DropdownMenuSeparator className="my-1 bg-slate-100 dark:bg-slate-800" />
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setAccountToHardDelete(acc);
                                        setForcePurge(false);
                                        setIsHardDeleteOpen(true);
                                      }}
                                      className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl cursor-pointer"
                                    >
                                      <AlertOctagon className="w-3.5 h-3.5 text-rose-500" />
                                      <span>Xóa vĩnh viễn</span>
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </>
                            ) : (
                              <>
                                <DropdownMenuItem asChild>
                                  <Link
                                    href={`/accounts/${acc.id}`}
                                    className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-slate-400" />
                                    <span>Xem chi tiết</span>
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => syncMutation.mutate({ accountId: acc.id })}
                                  disabled={syncMutation.isPending}
                                  className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                                >
                                  <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${syncMutation.isPending ? "animate-spin text-pink-500" : ""}`} />
                                  <span>{syncMutation.isPending ? "Đang đồng bộ..." : "Đồng bộ số liệu"}</span>
                                </DropdownMenuItem>
                                {syncMutation.isPending && (
                                  <DropdownMenuItem
                                    onClick={() => stopSyncMutation.mutate({ accountId: acc.id })}
                                    className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl cursor-pointer"
                                  >
                                    <Square className="w-3.5 h-3.5 fill-current text-rose-500" />
                                    <span>Dừng đồng bộ</span>
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={() => handleOpenLogs(acc)}
                                  className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                                >
                                  <History className="w-3.5 h-3.5 text-slate-400" />
                                  <span>Lịch sử hoạt động</span>
                                </DropdownMenuItem>
                                {acc.gpmProfileId && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleStartGpm(acc.gpmProfileId, acc.gpmPort || gpmStatus?.port)
                                    }
                                    disabled={
                                      startingGpmId === acc.gpmProfileId || startGpmMutation.isPending
                                    }
                                    className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                                  >
                                    <Play className="w-3.5 h-3.5 text-cyan-500 fill-current" />
                                    <span>Mở Profile GPM</span>
                                  </DropdownMenuItem>
                                )}
                                {isLeadOrAdmin && (
                                  <DropdownMenuItem
                                    onClick={() => handleOpenEdit(acc)}
                                    className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-slate-400" />
                                    <span>Chỉnh sửa</span>
                                  </DropdownMenuItem>
                                )}
                                {isAdmin && (
                                  <>
                                    <DropdownMenuSeparator className="my-1 bg-slate-100 dark:bg-slate-800" />
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setAccountToDelete(acc);
                                        setIsDeleteOpen(true);
                                      }}
                                      className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                      <span>Xóa tài khoản</span>
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Account Identity */}
                    <div className="p-4 pt-3 space-y-3 flex-1 flex flex-col justify-between">
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/accounts/${acc.id}`}
                            className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-pink-500/20 via-rose-500/20 to-purple-500/20 border border-pink-500/30 flex items-center justify-center text-pink-600 dark:text-pink-400 font-black text-sm shrink-0 group-hover:scale-105 transition-transform"
                          >
                            @{acc.username ? acc.username.slice(0, 2).toUpperCase() : "TK"}
                          </Link>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Link
                                href={`/accounts/${acc.id}`}
                                className="font-bold text-sm text-slate-900 dark:text-white hover:text-pink-600 dark:hover:text-pink-400 transition-colors truncate"
                              >
                                @{acc.username}
                              </Link>
                              <OnlineOfflineBadge
                                isOnline={acc.isOnline}
                                size="sm"
                                showLabel={false}
                              />
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span
                                className="text-xs font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 truncate max-w-[140px]"
                                title={acc.gpmProfileName ? `GPM Profile: ${acc.gpmProfileName}` : "Chưa có Profile GPM"}
                              >
                                {acc.gpmProfileName || "--"}
                              </span>
                              {cardPunishedVideos.length > 0 ? (
                                <StrikeWarningPopover
                                  account={acc}
                                  punishedVideos={cardPunishedVideos}
                                  compact
                                  showTooltip
                                />
                              ) : (
                                acc.alerts &&
                                acc.alerts.length > 0 && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 text-xs font-bold border border-amber-200 dark:border-amber-800/50">
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    {acc.alerts.length}
                                  </span>
                                )
                              )}
                            </div>
                            {viewTrash && (
                              <div className="text-[11px] text-rose-500 dark:text-rose-400 font-medium flex items-center gap-1 mt-1">
                                <Trash2 className="w-3 h-3 shrink-0" />
                                <span className="truncate">
                                  Đã xóa bởi {acc.deletedByName || "Hệ thống"}
                                  {acc.deletedAt ? ` (${new Date(acc.deletedAt).toLocaleDateString("vi-VN")})` : ""}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* GPM Profile ID Bar */}
                        {acc.gpmProfileId ? (
                          <div className="flex items-center justify-between p-2 rounded-xl bg-cyan-50/70 dark:bg-cyan-950/40 border border-cyan-200/50 dark:border-cyan-800/40">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Shield className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
                              <span className="font-mono text-xs font-semibold text-cyan-700 dark:text-cyan-300 truncate" title={acc.gpmProfileId}>
                                {acc.gpmProfileId}
                              </span>
                              {(acc.gpmPort || gpmStatus?.port) && (
                                <span className="px-1 rounded text-[10px] font-mono font-bold bg-cyan-100/80 dark:bg-cyan-900/60 text-cyan-800 dark:text-cyan-300 border border-cyan-300/40 dark:border-cyan-700/40" title={`Cổng API: ${acc.gpmPort || gpmStatus?.port}`}>
                                  :{acc.gpmPort || gpmStatus?.port}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(acc.gpmProfileId);
                                      setCopiedGpmId(acc.id);
                                      setTimeout(() => setCopiedGpmId((prev) => (prev === acc.id ? null : prev)), 2000);
                                      setActionMsg(`📋 Đã copy GPM ID: ${acc.gpmProfileId}`);
                                      setTimeout(() => setActionMsg(null), 3000);
                                    }}
                                    className="p-1 text-cyan-600 hover:text-cyan-800 dark:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-900/60 rounded-md transition-colors cursor-pointer"
                                    aria-label="Sao chép GPM ID"
                                  >
                                    {copiedGpmId === acc.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  {copiedGpmId === acc.id ? "Đã sao chép!" : "Sao chép Profile ID"}
                                </TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStartGpm(acc.gpmProfileId, acc.gpmPort || gpmStatus?.port);
                                    }}
                                    disabled={startingGpmId === acc.gpmProfileId || startGpmMutation.isPending}
                                    className="p-1 text-cyan-700 hover:text-cyan-900 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-900/60 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                                    aria-label={`Mở trình duyệt GPM (cổng ${acc.gpmPort || gpmStatus?.port || "auto"})`}
                                  >
                                    <Play className={`w-3 h-3 ${startingGpmId === acc.gpmProfileId ? "animate-pulse text-pink-500" : ""}`} />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top">Mở trình duyệt GPMLogin (cổng {acc.gpmPort || gpmStatus?.port || "auto"})</TooltipContent>
                              </Tooltip>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                            <span>Chưa gắn Profile GPM</span>
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(acc)}
                              className="text-pink-600 dark:text-pink-400 font-semibold hover:underline cursor-pointer"
                            >
                              + Gắn
                            </button>
                          </div>
                        )}

                        {/* Performance Metrics Matrix */}
                        <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                          <HoverCard openDelay={80} closeDelay={80}>
                            <HoverCardTrigger asChild>
                              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/80 cursor-help">
                                <div className="text-xs text-slate-400 flex items-center gap-1">
                                  <Eye className="w-3 h-3" /> Lượt xem
                                </div>
                                <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 truncate border-b border-dotted border-slate-400/40 w-fit">
                                  {Number(acc.totalViews || 0).toLocaleString()}
                                </div>
                              </div>
                            </HoverCardTrigger>
                            <HoverCardContent
                              side="top"
                              className="w-56 text-xs p-2.5 space-y-1 bg-slate-900 text-white border-slate-800 shadow-xl"
                            >
                              <ViewsPeriodTooltipContent account={acc} />
                            </HoverCardContent>
                          </HoverCard>
                          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/80">
                            <div className="text-xs text-slate-400 flex items-center gap-1">
                              <Flame className="w-3 h-3 text-pink-500" /> Followers
                            </div>
                            <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 truncate">
                              {Number(acc.totalFollowers || 0).toLocaleString()}
                            </div>
                          </div>
                          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/80">
                            <div className="text-xs text-slate-400 flex items-center gap-1">
                              <Video className="w-3 h-3" /> Video
                            </div>
                            <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 truncate">
                              {acc.totalVideos || 0}
                            </div>
                          </div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="p-2 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 cursor-help">
                                <div className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                  <DollarSign className="w-3 h-3" /> Doanh thu
                                </div>
                                <div className="font-bold text-emerald-700 dark:text-emerald-300 mt-0.5 truncate">
                                  ${resolveAllTimeRevenue(acc as any).toFixed(2)}
                                </div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs p-2.5 space-y-1 bg-slate-900 text-white border-slate-800 shadow-xl">
                              {(() => {
                                const p = getAccountRevenuePeriods(acc as any);
                                return (
                                  <>
                                    <div className="font-bold text-emerald-400 border-b border-slate-700 pb-1 flex items-center gap-1">
                                      <span>Doanh Thu TikTok Studio</span>
                                    </div>
                                    <div className="flex justify-between gap-4 text-[11px]">
                                      <span className="text-slate-400">7 ngày gần nhất:</span>
                                      <span className="font-semibold text-cyan-300">{formatAmount(p.revenue7d, (acc as any).country)}</span>
                                    </div>
                                    <div className="flex justify-between gap-4 text-[11px]">
                                      <span className="text-slate-400">28 ngày gần nhất:</span>
                                      <span className="font-semibold text-purple-300">{formatAmount(p.revenue28d, (acc as any).country)}</span>
                                    </div>
                                    <div className="flex justify-between gap-4 text-[11px]">
                                      <span className="text-slate-400">Tháng này:</span>
                                      <span className="font-semibold text-pink-400">{formatAmount(p.revenueThisMonth, (acc as any).country)}</span>
                                    </div>
                                    <div className="flex justify-between gap-4 text-[11px]">
                                      <span className="text-slate-400">60 ngày gần nhất:</span>
                                      <span className="font-semibold text-indigo-300">{formatAmount(p.revenue60d, (acc as any).country)}</span>
                                    </div>
                                    <div className="flex justify-between gap-4 text-[11px]">
                                      <span className="text-slate-400">365 ngày gần nhất:</span>
                                      <span className="font-semibold text-amber-300">{formatAmount(p.revenue365d, (acc as any).country)}</span>
                                    </div>
                                    <div className="flex justify-between gap-4 text-[11px] pt-1 border-t border-slate-800 font-bold">
                                      <span className="text-slate-300">Toàn bộ (All-time):</span>
                                      <span className="text-emerald-400">{formatAmount(p.totalRevenue, (acc as any).country)}</span>
                                    </div>
                                  </>
                                );
                              })()}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>

                      {/* Assigned Staff Row */}
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs">
                        <span className="text-xs text-slate-400 shrink-0">Phụ trách:</span>
                        <div className="flex items-center gap-1 min-w-0 flex-1 justify-end">
                          {isLeadOrAdmin ? (
                            <Select
                              value={acc.assignedUserId || "UNASSIGNED"}
                              onValueChange={(val) =>
                                handleAssignUser(acc.id, val === "UNASSIGNED" ? "" : val)
                              }
                              disabled={!!acc.isAssignmentLocked}
                            >
                              <SelectTrigger className="h-6.5 px-2 text-xs font-normal rounded-lg bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer max-w-[150px]">
                                <SelectValue placeholder="-- Chưa gán --">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {renderUserAvatar(getAssigneeUser(acc), "w-3.5 h-3.5 text-[8px]")}
                                    <span className="truncate">{getAssigneeLabel(acc)}</span>
                                  </div>
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-56">
                                <SelectItem value="UNASSIGNED" className="text-xs font-normal cursor-pointer text-slate-400">
                                  -- Chưa gán --
                                </SelectItem>
                                {users.map((u: any) => (
                                  <SelectItem key={u.id} value={u.id} className="text-xs font-normal cursor-pointer">
                                    <div className="flex items-center gap-2">
                                      {renderUserAvatar(u, "w-4 h-4 text-[8px]")}
                                      <span>{u.fullName}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span
                              className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[140px] inline-flex items-center gap-1.5"
                              title={getAssigneeLabel(acc)}
                            >
                              {renderUserAvatar(getAssigneeUser(acc), "w-3.5 h-3.5 text-[8px]")}
                              <span className="truncate">{getAssigneeLabel(acc)}</span>
                            </span>
                          )}
                          {isLeadOrAdmin ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleLockMutation.mutate({
                                      id: acc.id,
                                      isLocked: !acc.isAssignmentLocked,
                                    })
                                  }
                                  disabled={toggleLockMutation.isPending}
                                  className={`shrink-0 p-1 rounded-lg border transition-colors cursor-pointer disabled:opacity-50 ${acc.isAssignmentLocked
                                    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/20"
                                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                                    }`}
                                  aria-label={
                                    acc.isAssignmentLocked
                                      ? "Mở khóa phân công"
                                      : "Khóa phân công"
                                  }
                                >
                                  {acc.isAssignmentLocked ? (
                                    <Lock className="w-3.5 h-3.5" />
                                  ) : (
                                    <Unlock className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                {acc.isAssignmentLocked
                                  ? "Đã khóa — bấm để mở (cho phép bàn giao ca tự động)"
                                  : "Bấm để khóa phân công (chặn Extension/Agent tự đổi người phụ trách)"}
                              </TooltipContent>
                            </Tooltip>
                          ) : acc.isAssignmentLocked ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="shrink-0 p-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                                  <Lock className="w-3.5 h-3.5" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">Phân công đã bị khóa bởi Admin/Lead</TooltipContent>
                            </Tooltip>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* Card Footer Quick Actions */}
                    <div className="mt-auto px-4 py-2.5 bg-slate-50/80 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      <Link
                        href={`/accounts/${acc.id}`}
                        className="inline-flex items-center text-xs font-semibold text-slate-700 dark:text-slate-300 px-2 py-1 rounded-lg hover:bg-pink-50 dark:hover:bg-pink-950/40 hover:text-pink-600 dark:hover:text-pink-400 transition-colors"
                      >
                        Chi tiết →
                      </Link>
                      <div className="flex items-center gap-1.5">
                        {syncMutation.isPending ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => stopSyncMutation.mutate({ accountId: acc.id })}
                                className="p-1.5 text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer animate-pulse"
                                aria-label="Dừng đồng bộ"
                              >
                                <Square className="w-3.5 h-3.5 fill-current" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Dừng đồng bộ</TooltipContent>
                          </Tooltip>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => syncMutation.mutate({ accountId: acc.id })}
                                className="p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                aria-label="Đồng bộ số liệu"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Đồng bộ số liệu tài khoản</TooltipContent>
                          </Tooltip>
                        )}

                        {acc.gpmProfileId && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => handleStartGpm(acc.gpmProfileId, acc.gpmPort || gpmStatus?.port)}
                                disabled={startingGpmId === acc.gpmProfileId || startGpmMutation.isPending}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                                aria-label={`Khởi chạy Profile GPM (cổng ${acc.gpmPort || gpmStatus?.port || "auto"})`}
                              >
                                <Play className={`w-2.5 h-2.5 ${startingGpmId === acc.gpmProfileId ? "animate-pulse" : ""}`} /> {startingGpmId === acc.gpmProfileId ? "Đang mở..." : "GPM"}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Khởi chạy Profile GPMLogin (cổng {acc.gpmPort || gpmStatus?.port || "auto"})</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Table View */
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden relative z-0">
              <div className="overflow-x-auto relative" ref={tableRef} style={getTableVars()}>
                <table
                  className="text-left text-xs text-slate-700 dark:text-slate-300 border-collapse table-fixed"
                  style={{
                    width: "max(100%, var(--resize-table-min-width))",
                    minWidth: "var(--resize-table-min-width)",
                  }}
                >
                  <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-slate-600 dark:text-slate-300 font-semibold text-xs border-b border-slate-200 dark:border-slate-800 select-none">
                    <tr>
                      {/* Checkbox All (Frozen Left) */}
                      <th className="py-3.5 px-4 w-10 min-w-10 max-w-10 sticky left-0 z-20 bg-slate-50 dark:bg-slate-950 after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-slate-200 dark:after:bg-slate-800">
                        <Checkbox
                          checked={isAllPageSelected}
                          onCheckedChange={(val) => toggleSelectAll(!!val)}
                          aria-label="Chọn tất cả trên trang"
                        />
                      </th>

                      {/* Username (Frozen Left, Locked) */}
                      {visibleColumns.username && (
                        <th
                          style={getColumnStyle("username")}
                          onClick={() => handleSort("username")}
                          className="relative group/th px-5 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white sticky left-10 z-20 bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-slate-200 dark:after:bg-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.03)] overflow-hidden"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="truncate">Tài khoản</span>
                            {renderSortIndicator("username")}
                          </div>
                          {renderResizeHandle("username")}
                        </th>
                      )}

                      {/* GPM Profile Name */}
                      {visibleColumns.gpmProfileName && (
                        <th
                          style={getColumnStyle("gpmProfileName")}
                          onClick={() => handleSort("gpmProfileName")}
                          className="relative group/th px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white overflow-hidden"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="truncate">GPM Profile Name</span>
                            {renderSortIndicator("gpmProfileName")}
                          </div>
                          {renderResizeHandle("gpmProfileName")}
                        </th>
                      )}

                      {/* GPM Group */}
                      {visibleColumns.gpmGroup && (
                        <th
                          style={getColumnStyle("gpmGroup")}
                          onClick={() => handleSort("groupName")}
                          className="relative group/th px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white overflow-hidden"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="truncate">GPM Group</span>
                            {renderSortIndicator("groupName")}
                          </div>
                          {renderResizeHandle("gpmGroup")}
                        </th>
                      )}

                      {/* GPM Profile ID */}
                      {visibleColumns.gpmProfileId && (
                        <th
                          style={getColumnStyle("gpmProfileId")}
                          onClick={() => handleSort("gpmProfileId")}
                          className="relative group/th px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="truncate">GPM Profile ID</span>
                            {renderSortIndicator("gpmProfileId")}
                          </div>
                          {renderResizeHandle("gpmProfileId")}
                        </th>
                      )}

                      {/* Country */}
                      {visibleColumns.country && (
                        <th
                          style={getColumnStyle("country")}
                          onClick={() => handleSort("country")}
                          className="relative group/th px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="truncate">Quốc gia</span>
                            {renderSortIndicator("country")}
                          </div>
                          {renderResizeHandle("country")}
                        </th>
                      )}

                      {/* Status */}
                      {visibleColumns.status && (
                        <th
                          style={getColumnStyle("status")}
                          onClick={() => handleSort("status")}
                          className="relative group/th px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="truncate">Trạng thái</span>
                            {renderSortIndicator("status")}
                          </div>
                          {renderResizeHandle("status")}
                        </th>
                      )}

                      {/* Sync Status */}
                      {visibleColumns.syncStatus && (
                        <th
                          style={getColumnStyle("syncStatus")}
                          onClick={() => handleSort("lastSyncedAt" as any)}
                          className="relative group/th px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="truncate">Đồng bộ</span>
                            {renderSortIndicator("lastSyncedAt" as any)}
                          </div>
                          {renderResizeHandle("syncStatus")}
                        </th>
                      )}

                      {/* Assigned User */}
                      {visibleColumns.assignedUser && (
                        <th
                          style={getColumnStyle("assignedUser")}
                          onClick={() => handleSort("assignedUser")}
                          className="relative group/th px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="truncate">Người phụ trách</span>
                            {renderSortIndicator("assignedUser")}
                          </div>
                          {renderResizeHandle("assignedUser")}
                        </th>
                      )}

                      {/* Views */}
                      {visibleColumns.totalViews && (
                        <th
                          style={getColumnStyle("totalViews")}
                          onClick={() => handleSort("totalViews")}
                          className="relative group/th px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="truncate">Số views</span>
                            {renderSortIndicator("totalViews")}
                          </div>
                          {renderResizeHandle("totalViews")}
                        </th>
                      )}

                      {/* Followers */}
                      {visibleColumns.totalFollowers && (
                        <th
                          style={getColumnStyle("totalFollowers")}
                          onClick={() => handleSort("totalFollowers")}
                          className="relative group/th px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white whitespace-nowrap"
                        >
                          <div className="flex items-center gap-1.5 whitespace-nowrap truncate">
                            <span className="whitespace-nowrap truncate">Số followers</span>
                            {renderSortIndicator("totalFollowers")}
                          </div>
                          {renderResizeHandle("totalFollowers")}
                        </th>
                      )}

                      {/* Video Count */}
                      {visibleColumns.totalVideos && (
                        <th
                          style={getColumnStyle("totalVideos")}
                          onClick={() => handleSort("totalVideos")}
                          className="relative group/th px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="truncate">Số video</span>
                            {renderSortIndicator("totalVideos")}
                          </div>
                          {renderResizeHandle("totalVideos")}
                        </th>
                      )}

                      {/* Revenue */}
                      {visibleColumns.totalRevenue && (
                        <th
                          style={getColumnStyle("totalRevenue")}
                          onClick={() => handleSort("totalRevenue")}
                          className="relative group/th px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="truncate">Doanh thu</span>
                            {renderSortIndicator("totalRevenue")}
                          </div>
                          {renderResizeHandle("totalRevenue")}
                        </th>
                      )}

                      {/* Alerts */}
                      {visibleColumns.alertsCount && (
                        <th
                          style={getColumnStyle("alertsCount")}
                          onClick={() => handleSort("alertsCount")}
                          className="relative group/th px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="truncate">Cảnh báo</span>
                            {renderSortIndicator("alertsCount")}
                          </div>
                          {renderResizeHandle("alertsCount")}
                        </th>
                      )}

                      {/* Actions (Frozen Right) */}
                      {visibleColumns.actions && (
                        <th
                          style={getColumnStyle("actions")}
                          className="relative group/th px-6 py-3.5 text-center whitespace-nowrap sticky right-0 z-20 bg-slate-50 dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-slate-200 dark:after:bg-slate-800 shadow-[-2px_0_5px_rgba(0,0,0,0.03)]"
                        >
                          Thao tác
                          {renderResizeHandle("actions", "left")}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {paginatedAccounts.length === 0 ? (
                      <tr>
                        <td
                          colSpan={visibleColumnCount}
                          className="px-6 py-12 text-center text-slate-400 dark:text-slate-500"
                        >
                          Không tìm thấy tài khoản nào phù hợp bộ lọc.
                        </td>
                      </tr>
                    ) : (
                      paginatedAccounts.map((acc: any) => {
                        const isSelected = selectedIds.has(acc.id);
                        const rowBgClass = isSelected
                          ? "bg-pink-50/40 dark:bg-pink-950/20"
                          : "bg-white dark:bg-slate-900";

                        return (
                          <tr
                            key={acc.id}
                            className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 group ${isSelected ? "bg-pink-50/40 dark:bg-pink-950/20" : ""
                              }`}
                          >
                            {/* Checkbox Row (Frozen Left) */}
                            <td className={`py-3.5 px-4 w-10 min-w-10 max-w-10 sticky left-0 z-10 ${rowBgClass} group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors`}>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleSelectRow(acc.id)}
                                aria-label={`Chọn @${acc.username}`}
                              />
                            </td>

                            {/* Username (Frozen Left, Locked) */}
                            {visibleColumns.username && (
                              <td
                                style={getColumnStyle("username")}
                                className={`px-5 py-3.5 sticky left-10 z-10 ${rowBgClass} group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.03)] overflow-hidden`}
                              >
                                <div className="flex items-center gap-2 min-w-0 w-full">
                                  <span className="shrink-0">
                                    <OnlineOfflineBadge isOnline={acc.isOnline} size="sm" showLabel={false} />
                                  </span>
                                  <Link
                                    href={`/accounts/${acc.id}`}
                                    className="font-bold text-slate-900 dark:text-slate-100 hover:text-pink-600 dark:hover:text-pink-400 hover:underline transition-colors truncate min-w-0"
                                    title={`@${acc.username}`}
                                  >
                                    @{acc.username}
                                  </Link>
                                  <SyncStatusBadge account={acc} mode="compact" />
                                  {viewTrash && (
                                    <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/40">
                                      Đã xóa
                                    </span>
                                  )}
                                </div>
                              </td>
                            )}

                            {/* GPM Profile Name */}
                            {visibleColumns.gpmProfileName && (
                              <td style={getColumnStyle("gpmProfileName")} className="px-4 py-3.5 overflow-hidden">
                                <span
                                  className="inline-block max-w-full text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium truncate align-middle"
                                  title={acc.gpmProfileName || undefined}
                                >
                                  {acc.gpmProfileName || "--"}
                                </span>
                              </td>
                            )}

                            {/* GPM Group */}
                            {visibleColumns.gpmGroup && (
                              <td style={getColumnStyle("gpmGroup")} className="px-4 py-3.5 overflow-hidden">
                                <span className="inline-block max-w-full text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium truncate align-middle" title={acc.groupName || undefined}>
                                  {acc.groupName || "--"}
                                </span>
                              </td>
                            )}

                            {/* GPM Profile ID */}
                            {visibleColumns.gpmProfileId && (
                              <td style={getColumnStyle("gpmProfileId")} className="px-4 py-3.5 overflow-hidden">
                                {acc.gpmProfileId ? (
                                  <div className="flex items-center gap-1.5 h-7.5 max-w-full min-w-0 bg-cyan-50/80 dark:bg-cyan-950/50 border border-cyan-200/60 dark:border-cyan-800/40 rounded-xl px-2.5 shadow-2xs">
                                    <span
                                      className="font-mono text-xs font-semibold text-cyan-700 dark:text-cyan-300 min-w-0 flex-1 truncate"
                                      title={acc.gpmProfileId}
                                    >
                                      {acc.gpmProfileId}
                                    </span>
                                    {(acc.gpmPort || gpmStatus?.port) && (
                                      <span className="shrink-0 px-1 rounded text-[10px] font-mono font-bold bg-cyan-100/80 dark:bg-cyan-900/60 text-cyan-800 dark:text-cyan-300 border border-cyan-300/40 dark:border-cyan-700/40" title={`Cổng API: ${acc.gpmPort || gpmStatus?.port}`}>
                                        :{acc.gpmPort || gpmStatus?.port}
                                      </span>
                                    )}
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          onClick={() => handleStartGpm(acc.gpmProfileId, acc.gpmPort || gpmStatus?.port)}
                                          disabled={startingGpmId === acc.gpmProfileId || startGpmMutation.isPending}
                                          className="shrink-0 p-1 text-cyan-700 hover:text-cyan-900 dark:text-cyan-300 hover:bg-cyan-100/60 dark:hover:bg-cyan-900/60 rounded-md transition-colors cursor-pointer"
                                          aria-label={`Mở GPM (cổng ${acc.gpmPort || gpmStatus?.port || "auto"})`}
                                        >
                                          <Play className={`w-3 h-3 ${startingGpmId === acc.gpmProfileId ? "animate-pulse text-pink-500" : ""}`} />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top">Mở profile GPM (cổng {acc.gpmPort || gpmStatus?.port || "auto"})</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            navigator.clipboard.writeText(acc.gpmProfileId);
                                            setCopiedGpmId(acc.id);
                                            setTimeout(() => {
                                              setCopiedGpmId((prev) => (prev === acc.id ? null : prev));
                                            }, 2000);
                                            setActionMsg(`📋 Đã copy GPM ID: ${acc.gpmProfileId}`);
                                            setTimeout(() => setActionMsg(null), 3000);
                                          }}
                                          className="shrink-0 p-1 -mr-1 text-cyan-600/70 hover:text-cyan-700 dark:text-cyan-400/70 dark:hover:text-cyan-300 hover:bg-cyan-100/60 dark:hover:bg-cyan-900/60 rounded-md transition-colors cursor-pointer"
                                          aria-label="Sao chép GPM Profile ID"
                                        >
                                          {copiedGpmId === acc.id ? (
                                            <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                          ) : (
                                            <Copy className="w-3 h-3" />
                                          )}
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="text-xs font-medium">
                                        {copiedGpmId === acc.id ? "Đã sao chép!" : "Sao chép GPM Profile ID"}
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center h-7.5 px-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800/60 text-slate-400 text-xs italic bg-slate-50/50 dark:bg-slate-900/50 truncate max-w-full">-- Chưa gán --</span>
                                )}
                              </td>
                            )}

                            {/* Country */}
                            {visibleColumns.country && (
                              <td style={getColumnStyle("country")} className="px-4 py-3.5 overflow-hidden font-medium text-slate-800 dark:text-slate-200">
                                <div className="truncate">{getCountryFlag(acc.country)}</div>
                              </td>
                            )}

                            {/* Status Dropdown */}
                            {visibleColumns.status && (
                              <td style={getColumnStyle("status")} className="px-4 py-3.5 overflow-hidden">
                                {(() => {
                                  const isBanned = acc.status === "BANNED";
                                  const statusElement = isLeadOrAdmin ? (
                                    <Select
                                      value={acc.status}
                                      onValueChange={(val) => handleStatusChange(acc.id, val)}
                                    >
                                      <SelectTrigger className="h-7.5 w-full max-w-full text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent align="start" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
                                        <SelectItem value="ACTIVE" className="text-xs font-normal cursor-pointer">Active</SelectItem>
                                        <SelectItem value="WARMING" className="text-xs font-normal cursor-pointer">Warming</SelectItem>
                                        <SelectItem value="RESTRICTED" className="text-xs font-normal cursor-pointer">Restricted</SelectItem>
                                        <SelectItem value="BANNED" className="text-xs font-normal cursor-pointer">Banned</SelectItem>
                                        <SelectItem value="STOPPED" className="text-xs font-normal cursor-pointer">Stopped</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    (() => {
                                      const badgeStyle = getStatusBadgeStyle(acc.status);
                                      return (
                                        <span
                                          className={`inline-flex items-center gap-1.5 h-7 px-2.5 text-xs font-bold rounded-full border shadow-2xs select-none ${badgeStyle.container}`}
                                        >
                                          <span className={`w-2 h-2 rounded-full shrink-0 ${badgeStyle.dot}`} />
                                          <span>{acc.status}</span>
                                        </span>
                                      );
                                    })()
                                  );

                                  if (isBanned) {
                                    return (
                                      <div className="flex flex-col gap-0.5">
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <div className="inline-flex cursor-help">{statusElement}</div>
                                          </TooltipTrigger>
                                          <TooltipContent side="top" className="text-xs bg-rose-950 text-rose-100 border-rose-800 p-2 shadow-xl max-w-xs">
                                            <div className="font-bold">⚠️ Bị ngừng chương trình TikTok Beta</div>
                                            {acc.bannedReason && (
                                              <div className="text-[11px] text-rose-300 mt-1 font-normal">{acc.bannedReason}</div>
                                            )}
                                          </TooltipContent>
                                        </Tooltip>
                                        {acc.bannedReason && (
                                          <span className="text-[10px] text-rose-500 font-medium truncate block max-w-full" title={acc.bannedReason}>
                                            {acc.bannedReason}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  }
                                  return statusElement;
                                })()}
                              </td>
                            )}

                            {/* Sync Status Diagnostic */}
                            {visibleColumns.syncStatus && (
                              <td style={getColumnStyle("syncStatus")} className="px-4 py-3.5 overflow-hidden">
                                <SyncStatusBadge account={acc} mode="full" />
                              </td>
                            )}

                            {/* Assigned Staff */}
                            {visibleColumns.assignedUser && (
                              <td style={getColumnStyle("assignedUser")} className="px-4 py-3.5 overflow-hidden">
                                <div className="flex items-center gap-1.5 min-w-0 w-full">
                                  {isLeadOrAdmin ? (
                                    <Select
                                      value={acc.assignedUserId || "UNASSIGNED"}
                                      onValueChange={(val) =>
                                        handleAssignUser(acc.id, val === "UNASSIGNED" ? "" : val)
                                      }
                                      disabled={!!acc.isAssignmentLocked}
                                    >
                                      <SelectTrigger className="h-7.5 min-w-0 flex-1 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer">
                                        <SelectValue placeholder="-- Chưa gán --">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            {renderUserAvatar(getAssigneeUser(acc), "w-4 h-4 text-[8px]")}
                                            <span className="truncate">{getAssigneeLabel(acc)}</span>
                                          </div>
                                        </SelectValue>
                                      </SelectTrigger>
                                      <SelectContent align="start" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-56">
                                        <SelectItem value="UNASSIGNED" className="text-xs font-normal cursor-pointer text-slate-400">
                                          -- Chưa gán --
                                        </SelectItem>
                                        {users.map((u: any) => (
                                          <SelectItem key={u.id} value={u.id} className="text-xs font-normal cursor-pointer">
                                            <div className="flex items-center gap-2">
                                              {renderUserAvatar(u, "w-4 h-4 text-[8px]")}
                                              <span>{u.fullName}</span>
                                            </div>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <span
                                      className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate min-w-0 flex-1 inline-flex items-center gap-1.5"
                                      title={getAssigneeLabel(acc)}
                                    >
                                      {renderUserAvatar(getAssigneeUser(acc), "w-4 h-4 text-[8px]")}
                                      <span className="truncate">{getAssigneeLabel(acc)}</span>
                                    </span>
                                  )}
                                  {isLeadOrAdmin ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            toggleLockMutation.mutate({
                                              id: acc.id,
                                              isLocked: !acc.isAssignmentLocked,
                                            })
                                          }
                                          disabled={toggleLockMutation.isPending}
                                          className={`shrink-0 p-1.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-50 ${acc.isAssignmentLocked
                                            ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/20"
                                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                                            }`}
                                          aria-label={
                                            acc.isAssignmentLocked
                                              ? "Mở khóa phân công"
                                              : "Khóa phân công"
                                          }
                                        >
                                          {acc.isAssignmentLocked ? (
                                            <Lock className="w-3.5 h-3.5" />
                                          ) : (
                                            <Unlock className="w-3.5 h-3.5" />
                                          )}
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top">
                                        {acc.isAssignmentLocked
                                          ? "Đã khóa — bấm để mở (cho phép bàn giao ca tự động)"
                                          : "Bấm để khóa phân công (chặn Extension/Agent tự đổi người phụ trách)"}
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : acc.isAssignmentLocked ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="shrink-0 p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                                          <Lock className="w-3.5 h-3.5" />
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="top">Phân công đã bị khóa bởi Admin/Lead</TooltipContent>
                                    </Tooltip>
                                  ) : null}
                                </div>
                              </td>
                            )}

                            {/* Total Views */}
                            {visibleColumns.totalViews && (
                              <td style={getColumnStyle("totalViews")} className="px-4 py-3.5 overflow-hidden font-medium text-slate-800 dark:text-slate-200">
                                <HoverCard openDelay={80} closeDelay={80}>
                                  <HoverCardTrigger asChild>
                                    <span className="cursor-help border-b border-dotted border-slate-400/50 truncate inline-block max-w-full align-bottom">
                                      {Number(acc.totalViews || 0).toLocaleString()} views
                                    </span>
                                  </HoverCardTrigger>
                                  <HoverCardContent
                                    side="top"
                                    className="w-56 text-xs p-2.5 space-y-1 bg-slate-900 text-white border-slate-800 shadow-xl"
                                  >
                                    <ViewsPeriodTooltipContent account={acc} />
                                  </HoverCardContent>
                                </HoverCard>
                              </td>
                            )}

                            {/* Total Followers */}
                            {visibleColumns.totalFollowers && (
                              <td style={getColumnStyle("totalFollowers")} className="px-4 py-3.5 overflow-hidden font-medium text-slate-800 dark:text-slate-200">
                                <span className="truncate block">{Number(acc.totalFollowers || 0).toLocaleString()} followers</span>
                              </td>
                            )}

                            {/* Total Videos */}
                            {visibleColumns.totalVideos && (
                              <td style={getColumnStyle("totalVideos")} className="px-4 py-3.5 overflow-hidden font-medium text-slate-800 dark:text-slate-200">
                                <span className="truncate block">{acc.totalVideos || 0}</span>
                              </td>
                            )}

                            {/* Total Revenue */}
                            {visibleColumns.totalRevenue && (
                              <td style={getColumnStyle("totalRevenue")} className="px-4 py-3.5 overflow-hidden font-bold text-emerald-600 dark:text-emerald-400">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-help border-b border-dotted border-emerald-500/40 truncate inline-block max-w-full align-bottom">
                                      {formatAmount(resolveAllTimeRevenue(acc as any), (acc as any).country)}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="text-xs p-2.5 space-y-1 bg-slate-900 text-white border-slate-800 shadow-xl">
                                    {(() => {
                                      const p = getAccountRevenuePeriods(acc as any);
                                      return (
                                        <>
                                          <div className="font-bold text-emerald-400 border-b border-slate-700 pb-1">
                                            Doanh Thu TikTok Studio
                                          </div>
                                          <div className="flex justify-between gap-4 text-[11px]">
                                            <span className="text-slate-400">7 ngày gần nhất:</span>
                                            <span className="font-semibold text-cyan-300">{formatAmount(p.revenue7d, (acc as any).country)}</span>
                                          </div>
                                          <div className="flex justify-between gap-4 text-[11px]">
                                            <span className="text-slate-400">28 ngày gần nhất:</span>
                                            <span className="font-semibold text-purple-300">{formatAmount(p.revenue28d, (acc as any).country)}</span>
                                          </div>
                                          <div className="flex justify-between gap-4 text-[11px]">
                                            <span className="text-slate-400">Tháng này:</span>
                                            <span className="font-semibold text-pink-400">{formatAmount(p.revenueThisMonth, (acc as any).country)}</span>
                                          </div>
                                          <div className="flex justify-between gap-4 text-[11px]">
                                            <span className="text-slate-400">60 ngày gần nhất:</span>
                                            <span className="font-semibold text-indigo-300">{formatAmount(p.revenue60d, (acc as any).country)}</span>
                                          </div>
                                          <div className="flex justify-between gap-4 text-[11px]">
                                            <span className="text-slate-400">365 ngày gần nhất:</span>
                                            <span className="font-semibold text-amber-300">{formatAmount(p.revenue365d, (acc as any).country)}</span>
                                          </div>
                                          <div className="flex justify-between gap-4 text-[11px] pt-1 border-t border-slate-800 font-bold">
                                            <span className="text-slate-300">Toàn bộ (All-time):</span>
                                            <span className="text-emerald-400">{formatAmount(p.totalRevenue, (acc as any).country)}</span>
                                          </div>
                                        </>
                                      );
                                    })()}
                                  </TooltipContent>
                                </Tooltip>
                              </td>
                            )}

                            {/* Alerts / Warnings */}
                            {visibleColumns.alertsCount && (
                              <td style={getColumnStyle("alertsCount")} className="px-4 py-3.5 overflow-hidden">
                                {(() => {
                                  const punishedVideos = getPunishedVideos30d(acc);

                                  const isBannedFromCreator =
                                    acc.status === "BANNED" ||
                                    Boolean(acc.bannedReason) ||
                                    ((acc.metadata as any)?.creatorRewardsMissing === true) ||
                                    ((acc.metadata as any)?.creatorRewardsStatus === "BANNED") ||
                                    acc.alerts?.some((al: any) => al.alertType === "PROGRAM_DISQUALIFIED");

                                  // Case 1: Banned / Removed from Creator Program (TURN RED!)
                                  if (isBannedFromCreator) {
                                    return (
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <button
                                            type="button"
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 max-w-full rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-800/80 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-all shadow-sm cursor-pointer group"
                                          >
                                            <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 group-hover:scale-110 transition-transform" />
                                            <span className="truncate">Bị loại khỏi Creator Rewards</span>
                                            {punishedVideos.length > 0 && (
                                              <span className="shrink-0 px-1.5 py-0.2 bg-rose-500 text-white text-[10px] rounded-full font-bold">
                                                +{punishedVideos.length}
                                              </span>
                                            )}
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent
                                          align="start"
                                          className="w-96 p-0 rounded-2xl shadow-2xl border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-900 overflow-hidden z-50 text-xs"
                                        >
                                          <div className="p-3.5 border-b border-rose-200 dark:border-rose-900/40 flex items-start gap-2.5 bg-white dark:bg-slate-900">
                                            <div className="p-2 bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl shrink-0">
                                              <XCircle className="w-5 h-5" />
                                            </div>
                                            <div>
                                              <h4 className="font-bold text-rose-900 dark:text-rose-200 text-sm">
                                                Bị loại khỏi Creator Rewards
                                              </h4>
                                              <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">
                                                Tài khoản @{acc.username} đã bị tắt tính năng kiếm tiền TikTok Beta
                                              </p>
                                            </div>
                                          </div>

                                          <div className="p-3.5 space-y-3">
                                            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                                              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-0.5">Lý do ghi nhận:</span>
                                              <span className="text-xs text-rose-600 dark:text-rose-300 font-medium">
                                                {acc.bannedReason || "Không tìm thấy chương trình Creator Rewards trên TikTok Studio"}
                                              </span>
                                            </div>

                                            {punishedVideos.length > 0 && (
                                              <div>
                                                <div className="flex items-center justify-between mb-1.5">
                                                  <span className="font-semibold text-slate-700 dark:text-slate-200 text-[11px]">
                                                    Video bị phạt / vi phạm trong 30 ngày ({punishedVideos.length}):
                                                  </span>
                                                </div>
                                                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                                                  {punishedVideos.map((v: any, vIdx: number) => {
                                                    const cover = v.coverUrl || v.cover || null;
                                                    return (
                                                      <div
                                                        key={vIdx}
                                                        className="p-2 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/30 flex items-start gap-2"
                                                      >
                                                        <div className="w-10 h-12 rounded-lg bg-slate-200 dark:bg-slate-800 overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700">
                                                          {cover ? (
                                                            <img src={cover} alt={v.title || "Cover"} className="w-full h-full object-cover" />
                                                          ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                                                              <Video className="w-3.5 h-3.5" />
                                                            </div>
                                                          )}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                          <p className="text-xs font-medium text-slate-800 dark:text-slate-200 line-clamp-1" title={v.title}>
                                                            {v.title || `Video #${v.id}`}
                                                          </p>
                                                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                            <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.2 rounded border border-blue-500/20">
                                                              {v.programName || "Creator Rewards"}
                                                            </span>
                                                            {v.postDate && (
                                                              <span className="text-[10px] text-slate-400">
                                                                {v.postDate}
                                                              </span>
                                                            )}
                                                            <span className="text-[10px] font-bold text-rose-500">
                                                              Bị phạt
                                                            </span>
                                                          </div>
                                                        </div>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                            )}

                                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                                              <Link
                                                href={`/accounts/${acc.id}?tab=rewards`}
                                                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline"
                                              >
                                                <span>Xem chi tiết tài khoản</span>
                                                <ExternalLink className="w-3 h-3" />
                                              </Link>
                                            </div>
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    );
                                  }

                                  // Case 2: Punished Videos Warning
                                  if (punishedVideos.length > 0) {
                                    return (
                                      <StrikeWarningPopover
                                        account={acc}
                                        punishedVideos={punishedVideos}
                                      />
                                    );
                                  }

                                  // Case 3: Other alerts
                                  if (acc.alerts && acc.alerts.length > 0) {
                                    return (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="inline-flex items-center gap-1 px-2.5 py-1 max-w-full rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50 cursor-pointer">
                                            <AlertTriangle className="w-3 h-3 shrink-0" />
                                            <span className="truncate">{acc.alerts.length} cảnh báo</span>
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs text-xs space-y-1">
                                          {acc.alerts.map((al: any, idx: number) => (
                                            <div key={idx} className="text-slate-200">
                                              • {al.description || al.message || al.alertType}
                                            </div>
                                          ))}
                                        </TooltipContent>
                                      </Tooltip>
                                    );
                                  }

                                  // Case 4: Clean & Safe
                                  return (
                                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                                      <Shield className="w-3.5 h-3.5 text-emerald-500" />
                                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">An toàn</span>
                                    </span>
                                  );
                                })()}
                              </td>
                            )}

                            {/* Actions (Frozen Right, DropdownMenu) */}
                            {visibleColumns.actions && (
                              <td
                                style={getColumnStyle("actions")}
                                className={`px-6 py-3.5 text-center whitespace-nowrap sticky right-0 z-10 ${rowBgClass} group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors border-l border-slate-200 dark:border-slate-800 shadow-[-2px_0_5px_rgba(0,0,0,0.03)]`}
                              >
                                <div className="flex items-center justify-center gap-1">
                                  <DropdownMenu>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <DropdownMenuTrigger asChild>
                                          <button
                                            type="button"
                                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                            aria-label="Thao tác"
                                          >
                                            <MoreHorizontal className="w-4 h-4" />
                                          </button>
                                        </DropdownMenuTrigger>
                                      </TooltipTrigger>
                                      <TooltipContent side="left">Tùy chọn thao tác</TooltipContent>
                                    </Tooltip>
                                    <DropdownMenuContent align="end" className="w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-1.5 shadow-xl">
                                      {viewTrash ? (
                                        <>
                                          <DropdownMenuItem
                                            onClick={() => restoreMutation.mutate({ id: acc.id })}
                                            disabled={restoreMutation.isPending}
                                            className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-xl cursor-pointer"
                                          >
                                            <RotateCcw className="w-3.5 h-3.5 text-emerald-500" />
                                            <span>Khôi phục tài khoản</span>
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onClick={() => handleOpenLogs(acc)}
                                            className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                                          >
                                            <History className="w-3.5 h-3.5 text-slate-400" />
                                            <span>Lịch sử hoạt động</span>
                                          </DropdownMenuItem>
                                          {isAdmin && (
                                            <>
                                              <DropdownMenuSeparator className="my-1 bg-slate-100 dark:bg-slate-800" />
                                              <DropdownMenuItem
                                                onClick={() => {
                                                  setAccountToHardDelete(acc);
                                                  setForcePurge(false);
                                                  setIsHardDeleteOpen(true);
                                                }}
                                                className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl cursor-pointer"
                                              >
                                                <AlertOctagon className="w-3.5 h-3.5 text-rose-500" />
                                                <span>Xóa vĩnh viễn</span>
                                              </DropdownMenuItem>
                                            </>
                                          )}
                                        </>
                                      ) : (
                                        <>
                                          <DropdownMenuItem asChild>
                                            <Link
                                              href={`/accounts/${acc.id}`}
                                              className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                                            >
                                              <Eye className="w-3.5 h-3.5 text-slate-400" />
                                              <span>Xem chi tiết</span>
                                            </Link>
                                          </DropdownMenuItem>

                                          <DropdownMenuItem
                                            onClick={() => syncMutation.mutate({ accountId: acc.id })}
                                            disabled={syncMutation.isPending}
                                            className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                                          >
                                            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                                            <span>Đồng bộ số liệu</span>
                                          </DropdownMenuItem>

                                          <DropdownMenuItem
                                            onClick={() => handleOpenLogs(acc)}
                                            className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                                          >
                                            <History className="w-3.5 h-3.5 text-slate-400" />
                                            <span>Lịch sử hoạt động</span>
                                          </DropdownMenuItem>

                                          {acc.gpmProfileId && (
                                            <DropdownMenuItem
                                              onClick={() =>
                                                handleStartGpm(
                                                  acc.gpmProfileId,
                                                  acc.gpmPort || gpmStatus?.port
                                                )
                                              }
                                              disabled={
                                                startingGpmId === acc.gpmProfileId ||
                                                startGpmMutation.isPending
                                              }
                                              className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                                            >
                                              <Play className="w-3.5 h-3.5 text-cyan-500 fill-current" />
                                              <span>Mở Profile GPM</span>
                                            </DropdownMenuItem>
                                          )}

                                          {isLeadOrAdmin && (
                                            <DropdownMenuItem
                                              onClick={() => handleOpenEdit(acc)}
                                              className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                                            >
                                              <Pencil className="w-3.5 h-3.5 text-slate-400" />
                                              <span>Chỉnh sửa thông tin</span>
                                            </DropdownMenuItem>
                                          )}

                                          {isAdmin && (
                                            <>
                                              <DropdownMenuSeparator className="my-1 bg-slate-100 dark:bg-slate-800" />

                                              <DropdownMenuItem
                                                onClick={() => {
                                                  setAccountToDelete(acc);
                                                  setIsDeleteOpen(true);
                                                }}
                                                className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl cursor-pointer"
                                              >
                                                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                                <span>Xóa tài khoản</span>
                                              </DropdownMenuItem>
                                            </>
                                          )}
                                        </>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Unified Pagination */}
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              pageSize={pageSize}
              pageSizeOptions={[25, 50, 100, 200]}
              totalItems={filteredAndSortedAccounts.length}
              onPageChange={setPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setPage(1);
              }}
              itemLabel="tài khoản"
            />
          </div>
        </div>
      )}

      {/* Floating Bottom Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-3 shadow-2xl shadow-slate-900/10 dark:shadow-black/60 ring-1 ring-slate-100 dark:ring-slate-800 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <span className="text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">
            Đã chọn {selectedIds.size} tài khoản
          </span>
          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            Bỏ chọn
          </button>

          {viewTrash ? (
            <>
              <button
                onClick={() => bulkRestoreMutation.mutate({ ids: Array.from(selectedIds) })}
                disabled={bulkRestoreMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm active:scale-95 transition-all cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Khôi phục đã chọn ({selectedIds.size})</span>
              </button>
              {isAdmin && (
                <button
                  onClick={() => {
                    setForcePurge(false);
                    setBulkHardDeleteResult(null);
                    setIsBulkHardDeleteOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  <AlertOctagon className="w-3.5 h-3.5" />
                  <span>Xóa vĩnh viễn ({selectedIds.size})</span>
                </button>
              )}
            </>
          ) : (
            <>
              {isLeadOrAdmin && (
                <button
                  onClick={() => setIsBulkStatusOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-all cursor-pointer"
                >
                  <span>Đổi trạng thái</span>
                </button>
              )}

              {isLeadOrAdmin && (
                <button
                  onClick={() => setIsBulkAssignOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-all cursor-pointer"
                >
                  <span>Gán nhân sự</span>
                </button>
              )}

              {isAdmin && (
                <button
                  onClick={() => setIsBulkDeleteOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa đã chọn ({selectedIds.size})</span>
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Modal: Create Account */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-pink-500" />
                Thêm Tài Khoản TikTok
              </h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Username <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. dailyvibes_us"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full h-9 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-pink-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Quốc Gia
                  </label>
                  <Select value={newCountry} onValueChange={setNewCountry}>
                    <SelectTrigger className="w-full h-9 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 text-xs text-slate-900 dark:text-white cursor-pointer">
                      <SelectValue placeholder="Chọn quốc gia" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl max-h-60">
                      {COUNTRY_OPTIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value} className="text-xs cursor-pointer">
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    GPM Group
                  </label>
                  <input
                    type="text"
                    placeholder="Default group"
                    value={newGroup}
                    onChange={(e) => setNewGroup(e.target.value)}
                    className="w-full h-9 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 text-xs text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  GPM Profile Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Profile 5404"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  className="w-full h-9 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-pink-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  GPM Profile ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                  value={newGpmId}
                  onChange={(e) => setNewGpmId(e.target.value)}
                  className="w-full h-9 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 text-xs font-mono text-cyan-700 dark:text-cyan-300 focus:outline-none focus:border-pink-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Phân Công Nhân Sự Phụ Trách
                </label>
                <Select value={newAssignedUser || "UNASSIGNED"} onValueChange={(val) => setNewAssignedUser(val === "UNASSIGNED" ? "" : val)}>
                  <SelectTrigger className="w-full h-9 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 text-xs text-slate-900 dark:text-white cursor-pointer">
                    <SelectValue placeholder="-- Chưa phân công --" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl max-h-60">
                    <SelectItem value="UNASSIGNED" className="text-xs text-slate-400 cursor-pointer">
                      -- Chưa phân công --
                    </SelectItem>
                    {users.map((u: any) => (
                      <SelectItem key={u.id} value={u.id} className="text-xs cursor-pointer">
                        <div className="flex items-center gap-2">
                          {renderUserAvatar(u, "w-4 h-4 text-[8px]")}
                          <span>{u.fullName} ({u.role})</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white shadow-md shadow-pink-600/30 cursor-pointer disabled:opacity-60"
                >
                  {createMutation.isPending ? "Đang tạo..." : "Thêm Tài Khoản"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Account */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Pencil className="w-4 h-4 text-pink-500" />
                Cập Nhật Tài Khoản @{editUsername}
              </h3>
              <button
                onClick={() => setIsEditOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Quốc Gia
                    </label>
                    {!isLeadOrAdmin && (
                      <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> Chỉ đọc
                      </span>
                    )}
                  </div>
                  {isLeadOrAdmin ? (
                    <Select value={editCountry} onValueChange={setEditCountry}>
                      <SelectTrigger className="w-full h-9 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 text-xs text-slate-900 dark:text-white cursor-pointer [&>span]:truncate">
                        <SelectValue placeholder="Chọn quốc gia" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl max-h-60 w-64">
                        {COUNTRY_OPTIONS.map((c) => (
                          <SelectItem key={c.value} value={c.value} className="text-xs cursor-pointer">
                            {c.label}
                          </SelectItem>
                        ))}
                        {!COUNTRY_OPTIONS.some((c) => c.value === editCountry) && editCountry && (
                          <SelectItem value={editCountry} className="text-xs cursor-pointer">
                            🌐 {editCountry}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  ) : (
                    <input
                      type="text"
                      readOnly
                      value={COUNTRY_OPTIONS.find((c) => c.value === editCountry)?.label || editCountry || "--"}
                      className="w-full h-9 bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 text-xs text-slate-500 dark:text-slate-400 cursor-not-allowed select-none focus:outline-none"
                    />
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      GPM Group
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" /> Chỉ đọc
                    </span>
                  </div>
                  <input
                    type="text"
                    readOnly
                    value={editGroup || "-- Không có nhóm --"}
                    className="w-full h-9 bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 text-xs text-slate-500 dark:text-slate-400 cursor-not-allowed select-none focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    GPM Profile Name
                  </label>
                  {!isLeadOrAdmin ? (
                    <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" /> Chỉ đọc
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                      Admin/Lead
                    </span>
                  )}
                </div>
                {isLeadOrAdmin ? (
                  <input
                    type="text"
                    placeholder="Tên profile GPM (ví dụ: Profile 5404)..."
                    value={editProfileName}
                    onChange={(e) => setEditProfileName(e.target.value)}
                    className="w-full h-9 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-pink-500"
                  />
                ) : (
                  <input
                    type="text"
                    readOnly
                    placeholder="Chưa có tên Profile GPM"
                    value={editProfileName}
                    className="w-full h-9 bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 text-xs text-slate-500 dark:text-slate-400 cursor-not-allowed select-none focus:outline-none"
                  />
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    GPM Profile ID
                  </label>
                  {!isLeadOrAdmin ? (
                    <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" /> Chỉ đọc
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                      Admin/Lead
                    </span>
                  )}
                </div>
                {isLeadOrAdmin ? (
                  <input
                    type="text"
                    placeholder="Nhập GPM Profile UUID (ví dụ: 792837c8-0a3a-49ea-b550-a92bda66c149)..."
                    value={editGpmId}
                    onChange={(e) => setEditGpmId(e.target.value)}
                    className="w-full h-9 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-pink-500"
                  />
                ) : (
                  <input
                    type="text"
                    readOnly
                    placeholder="Chưa liên kết GPM Profile"
                    value={editGpmId}
                    className="w-full h-9 bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 text-xs font-mono text-slate-500 dark:text-slate-400 cursor-not-allowed select-none focus:outline-none"
                  />
                )}
              </div>

              {isLeadOrAdmin && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed bg-amber-500/5 border border-amber-500/10 rounded-xl p-2.5">
                  💡 <strong>GPM Profile ID:</strong> Thay đổi Profile UUID sẽ chuyển hướng mở trình duyệt GPM và đồng bộ tự động sang profile mới. Vui lòng kiểm tra kỹ UUID.
                </p>
              )}

              {isLeadOrAdmin && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Phân Công Nhân Sự
                  </label>
                  <Select value={editAssignedUser || "UNASSIGNED"} onValueChange={(val) => setEditAssignedUser(val === "UNASSIGNED" ? "" : val)}>
                    <SelectTrigger className="w-full h-9 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 text-xs text-slate-900 dark:text-white cursor-pointer">
                      <SelectValue placeholder="-- Chưa phân công --" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl max-h-60">
                      <SelectItem value="UNASSIGNED" className="text-xs text-slate-400 cursor-pointer">
                        -- Chưa phân công --
                      </SelectItem>
                      {users.map((u: any) => (
                        <SelectItem key={u.id} value={u.id} className="text-xs cursor-pointer">
                          <div className="flex items-center gap-2">
                            {renderUserAvatar(u, "w-4 h-4 text-[8px]")}
                            <span>{u.fullName} ({u.role})</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white shadow-md shadow-pink-600/30 cursor-pointer disabled:opacity-60"
                >
                  {updateMutation.isPending ? "Đang lưu..." : "Lưu Thay Đổi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirm Soft Delete Single Account */}
      {isDeleteOpen && accountToDelete && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Chuyển vào thùng rác
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Bạn có chắc muốn chuyển @{accountToDelete.username} vào thùng rác?
                </p>
              </div>
            </div>

            <div className="bg-amber-50/80 dark:bg-amber-950/30 rounded-2xl p-4 border border-amber-200/60 dark:border-amber-800/50 text-xs text-amber-900 dark:text-amber-200">
              Tài khoản sẽ được chuyển vào thùng rác và có thể khôi phục bất cứ lúc nào. Dữ liệu số liệu không bị xóa.
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/60 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800 space-y-1 text-xs text-slate-700 dark:text-slate-300">
              <div><span className="font-semibold">Tài khoản:</span> @{accountToDelete.username}</div>
              <div><span className="font-semibold">Quốc gia:</span> {accountToDelete.country}</div>
              <div><span className="font-semibold">Doanh thu hiện tại:</span> ${Number(accountToDelete.totalRevenue || 0).toFixed(2)}</div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteOpen(false);
                  setAccountToDelete(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (accountToDelete) {
                    deleteMutation.mutate({ id: accountToDelete.id });
                  }
                }}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deleteMutation.isPending ? "Đang chuyển..." : "Chuyển vào thùng rác"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Bulk Soft Delete */}
      {isBulkDeleteOpen && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Chuyển hàng loạt vào thùng rác
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Bạn có chắc muốn chuyển {selectedIds.size} tài khoản đã chọn vào thùng rác?
                </p>
              </div>
            </div>

            <div className="bg-amber-50/80 dark:bg-amber-950/30 rounded-2xl p-4 border border-amber-200/60 dark:border-amber-800/50 text-xs text-amber-900 dark:text-amber-200">
              Các tài khoản sẽ được chuyển vào thùng rác và có thể khôi phục bất cứ lúc nào. Đây không phải xóa vĩnh viễn — dữ liệu số liệu vẫn được giữ lại.
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsBulkDeleteOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={bulkDeleteMutation.isPending}
                onClick={() => {
                  bulkDeleteMutation.mutate({ ids: Array.from(selectedIds) });
                }}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{bulkDeleteMutation.isPending ? "Đang chuyển..." : `Chuyển vào thùng rác (${selectedIds.size})`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Bulk Update Status */}
      {isBulkStatusOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Đổi Trạng Thái ({selectedIds.size} tài khoản)
            </h3>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Chọn trạng thái mới
              </label>
              <Select value={bulkStatusVal} onValueChange={setBulkStatusVal}>
                <SelectTrigger className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white cursor-pointer">
                  <SelectValue placeholder="Chọn trạng thái" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  <SelectItem value="ACTIVE" className="text-xs cursor-pointer">Active (Đang hoạt động)</SelectItem>
                  <SelectItem value="WARMING" className="text-xs cursor-pointer">Warming (Đang nuôi acc)</SelectItem>
                  <SelectItem value="RESTRICTED" className="text-xs cursor-pointer">Restricted (Bị hạn chế)</SelectItem>
                  <SelectItem value="BANNED" className="text-xs cursor-pointer">Banned (Bị khóa)</SelectItem>
                  <SelectItem value="STOPPED" className="text-xs cursor-pointer">Stopped (Tạm dừng)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsBulkStatusOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={bulkUpdateStatusMutation.isPending}
                onClick={() => {
                  bulkUpdateStatusMutation.mutate({
                    ids: Array.from(selectedIds),
                    status: bulkStatusVal as any,
                  });
                }}
                className="px-5 py-2 text-xs font-bold text-white bg-pink-600 hover:bg-pink-500 rounded-xl shadow-md active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
              >
                {bulkUpdateStatusMutation.isPending ? "Đang áp dụng..." : "Áp dụng"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Bulk Assign Staff */}
      {isBulkAssignOpen && isLeadOrAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Gán Nhân Sự ({selectedIds.size} tài khoản)
            </h3>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Chọn nhân sự phụ trách
              </label>
              <Select value={bulkAssignUserVal || "UNASSIGNED"} onValueChange={(val) => setBulkAssignUserVal(val === "UNASSIGNED" ? "" : val)}>
                <SelectTrigger className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white cursor-pointer">
                  <SelectValue placeholder="-- Hủy phân công (Chưa gán) --" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl max-h-60">
                  <SelectItem value="UNASSIGNED" className="text-xs text-slate-400 cursor-pointer">
                    -- Hủy phân công (Chưa gán) --
                  </SelectItem>
                  {users.map((u: any) => (
                    <SelectItem key={u.id} value={u.id} className="text-xs cursor-pointer">
                      <div className="flex items-center gap-2">
                        {renderUserAvatar(u, "w-4 h-4 text-[8px]")}
                        <span>{u.fullName} ({u.role})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsBulkAssignOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={bulkAssignMutation.isPending || !isLeadOrAdmin}
                onClick={() => {
                  if (!isLeadOrAdmin) {
                    toast.warning("Chỉ Quản trị viên và Quản lý mới có quyền phân công nhân sự.");
                    return;
                  }
                  bulkAssignMutation.mutate({
                    ids: Array.from(selectedIds),
                    assignedUserId: bulkAssignUserVal || null,
                  });
                }}
                className="px-5 py-2 text-xs font-bold text-white bg-pink-600 hover:bg-pink-500 rounded-xl shadow-md active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
              >
                {bulkAssignMutation.isPending ? "Đang gán..." : "Xác nhận gán"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Hard Delete Single Account */}
      {isHardDeleteOpen && accountToHardDelete && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Xác nhận xóa vĩnh viễn
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Thao tác này sẽ xóa vĩnh viễn @{accountToHardDelete.username} khỏi cơ sở dữ liệu.
                </p>
              </div>
            </div>

            <div className="bg-rose-50/60 dark:bg-rose-950/30 rounded-2xl p-4 border border-rose-200/60 dark:border-rose-800/60 text-xs text-rose-800 dark:text-rose-300 space-y-2">
              <div>⚠️ Hành động này <strong>không thể hoàn tác</strong>. Bản ghi kiểm toán (SystemAuditLog) sẽ lưu vết xóa này.</div>
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={forcePurge}
                onChange={(e) => setForcePurge(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
              />
              <span>Xóa vĩnh viễn cả khi tài khoản có dữ liệu doanh thu hoặc lịch sử KPI (Force Purge)</span>
            </label>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsHardDeleteOpen(false);
                  setAccountToHardDelete(null);
                  setForcePurge(false);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={hardDeleteMutation.isPending}
                onClick={() => {
                  hardDeleteMutation.mutate({
                    id: accountToHardDelete.id,
                    forcePurgeHistoricalData: forcePurge,
                  });
                }}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
              >
                <AlertOctagon className="w-3.5 h-3.5" />
                <span>{hardDeleteMutation.isPending ? "Đang xóa vĩnh viễn..." : "Xóa vĩnh viễn"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Bulk Hard Delete */}
      {isBulkHardDeleteOpen && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Xóa vĩnh viễn hàng loạt
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Bạn có chắc chắn muốn xóa vĩnh viễn {selectedIds.size} tài khoản đã chọn?
                </p>
              </div>
            </div>

            {bulkHardDeleteResult && bulkHardDeleteResult.blockedCount > 0 ? (
              <div className="space-y-2">
                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-2xl p-3 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300">
                  ⚠️ Có {bulkHardDeleteResult.blockedCount} tài khoản bị chặn xóa vì có dữ liệu doanh thu hoặc lịch sử KPI.
                  <div className="mt-1.5 max-h-24 overflow-y-auto space-y-0.5 font-mono text-[11px]">
                    {bulkHardDeleteResult.blockedAccounts.map((a) => (
                      <div key={a.id}>• @{a.username}</div>
                    ))}
                  </div>
                </div>
                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={forcePurge}
                    onChange={(e) => setForcePurge(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                  />
                  <span>Buộc xóa vĩnh viễn tất cả, bao gồm cả dữ liệu doanh thu / KPI (Force Purge)</span>
                </label>
              </div>
            ) : (
              <div className="bg-rose-50/60 dark:bg-rose-950/30 rounded-2xl p-4 border border-rose-200/60 dark:border-rose-800/60 text-xs text-rose-800 dark:text-rose-300">
                ⚠️ Hành động này <strong>không thể hoàn tác</strong>. Dữ liệu sẽ được dọn sạch vĩnh viễn và lưu vết kiểm toán.
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsBulkHardDeleteOpen(false);
                  setBulkHardDeleteResult(null);
                  setForcePurge(false);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={bulkHardDeleteMutation.isPending}
                onClick={() => {
                  bulkHardDeleteMutation.mutate({
                    ids: Array.from(selectedIds),
                    forcePurgeHistoricalData: forcePurge,
                  });
                }}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
              >
                <AlertOctagon className="w-3.5 h-3.5" />
                <span>
                  {bulkHardDeleteMutation.isPending
                    ? "Đang xóa..."
                    : forcePurge
                      ? `Buộc xóa vĩnh viễn (${selectedIds.size})`
                      : `Xác nhận xóa vĩnh viễn (${selectedIds.size})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Auto-restore Confirmation on Create */}
      {autoRestoreConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <ArchiveRestore className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Tài khoản đã tồn tại trong Thùng rác
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Tài khoản @{autoRestoreConfirm.username} hiện đang nằm trong Thùng rác.
                </p>
              </div>
            </div>

            <div className="bg-amber-50/60 dark:bg-amber-950/30 rounded-2xl p-4 border border-amber-200/60 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300">
              Bạn có muốn khôi phục tài khoản này và cập nhật theo thông tin vừa nhập thay vì tạo mới không?
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setAutoRestoreConfirm(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={createMutation.isPending}
                onClick={() => {
                  setAutoRestoreConfirm(null);
                  executeCreate();
                }}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{createMutation.isPending ? "Đang khôi phục..." : "Khôi phục tài khoản"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: View Logs */}
      {isLogModalOpen && selectedAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <History className="w-4 h-4 text-pink-500" />
                Lịch Sử Hoạt Động @{selectedAccount.username}
              </h3>
              <button
                onClick={() => setIsLogModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-2 pr-1 text-xs">
              {isLogsLoading ? (
                <div className="py-8 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-pink-500" />
                  <span>Đang tải lịch sử hoạt động...</span>
                </div>
              ) : accountLogs && accountLogs.length > 0 ? (
                accountLogs.map((log: any) => (
                  <div
                    key={log.id}
                    className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 dark:text-slate-200">{log.logType}</span>
                      <span className="text-xs text-slate-400">
                        {new Date(log.createdAt).toLocaleString("vi-VN")}
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-400">{log.message}</p>
                    <div className="text-xs text-slate-400">Thực hiện bởi: {log.actorName}</div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-slate-400">Chưa có bản ghi hoạt động nào.</div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setIsLogModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AccountsPage() {
  return (
    <Suspense fallback={<DataTableSkeleton columnCount={8} rowCount={12} />}>
      <AccountsPageContent />
    </Suspense>
  );
}