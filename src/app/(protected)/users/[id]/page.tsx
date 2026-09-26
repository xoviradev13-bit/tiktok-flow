"use client";

import { useState, useMemo, useEffect, useRef, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useUrlParams } from "@/hooks/useUrlState";
import { useSession } from "next-auth/react";
import {
  Users,
  ArrowLeft,
  Shield,
  ShieldCheck,
  UserCheck,
  Play,
  RefreshCw,
  ExternalLink,
  Eye,
  Search,
  Filter,
  Flame,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Calendar,
  DollarSign,
  TrendingUp,
  Video,
  Activity,
  FileText,
  UserCog,
  Check,
  X,
  SlidersHorizontal,
  ChevronRight,
  Globe,
  Ban,
  CheckCircle2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  Pencil,
  Key,
  KeyRound,
  Trash2,
  MonitorX,
  Monitor,
  Inbox,
  EyeOff,
  Download,
  Square,
  History,
  Sparkles,
  Copy,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import {
  optimisticallyBulkUpdateAccounts,
  optimisticallyDeleteAccounts,
  snapshotAccountQueries,
  rollbackAccountQueries,
} from "@/utils/optimisticAccounts";
import { useTableColumnResize } from "@/hooks/useTableColumnResize";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { OnlineOfflineBadge } from "@/components/ui/status-badge";
import { UserDetailSkeleton } from "@/components/skeletons/PageSkeletons";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useConfirmDialog } from "@/components/ui/confirm-modal";
import { downloadPackage } from "@/lib/download-package";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { format, subDays, addDays, differenceInCalendarDays } from "date-fns";
import { getAccountRevenuePeriods } from "@/lib/resolve-all-time-revenue";
import { getAccountViewsPeriods } from "@/lib/daily-views-breakdown";
import { useCurrency } from "@/contexts/CurrencyContext";

const MAX_CUSTOM_RANGE_DAYS = 365;

const COUNTRY_MAP: Record<string, string> = {
  us: "US", "united states": "US", usa: "US", "u.s.": "US", "u.s.a.": "US", america: "US",
  gb: "UK", uk: "UK", "united kingdom": "UK", britain: "UK", england: "UK",
  vn: "VN", vietnam: "VN", "viet nam": "VN", "việt nam": "VN",
  de: "DE", germany: "DE", german: "DE", "đức": "DE",
  fr: "FR", france: "FR", "pháp": "FR",
  be: "BE", belgium: "BE", "bỉ": "BE",
  nl: "NL", netherlands: "NL", holland: "NL", "hà lan": "NL",
  id: "ID", indonesia: "ID",
  th: "TH", thailand: "TH", "thái lan": "TH",
  my: "MY", malaysia: "MY",
  ph: "PH", philippines: "PH",
  sg: "SG", singapore: "SG",
  jp: "JP", japan: "JP", "nhật bản": "JP",
  kr: "KR", "south korea": "KR", korea: "KR", "hàn quốc": "KR",
  br: "BR", brazil: "BR",
  mx: "MX", mexico: "MX",
  ca: "CA", canada: "CA",
  au: "AU", australia: "AU", "úc": "AU",
  in: "IN", india: "IN", "ấn độ": "IN",
  pk: "PK", pakistan: "PK",
  bd: "BD", bangladesh: "BD",
  eg: "EG", egypt: "EG", "ai cập": "EG",
  tr: "TR", turkey: "TR", "thổ nhĩ kỳ": "TR",
  ru: "RU", russia: "RU", "nga": "RU",
  es: "ES", spain: "ES", "tây ban nha": "ES",
  it: "IT", italy: "IT", "ý": "IT",
  pt: "PT", portugal: "PT", "bồ đào nha": "PT",
  pl: "PL", poland: "PL", "ba lan": "PL",
  se: "SE", sweden: "SE", "thụy điển": "SE",
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

const normalizeCountry = (country?: string | null): string => {
  if (!country) return "US";
  const trimmed = country.trim().toLowerCase();
  if (COUNTRY_MAP[trimmed]) return COUNTRY_MAP[trimmed];
  if (trimmed === "unknown") return "US";
  return country.trim().toUpperCase();
};

export type AccountSortKey =
  | "totalRevenue"
  | "totalViews"
  | "totalFollowers"
  | "totalVideos"
  | "username"
  | "gpmProfileName"
  | "groupName"
  | "country"
  | "status"
  | "isOnline"
  | "lastSyncedAt";

const ACCOUNT_SORT_OPTIONS: Array<{ key: AccountSortKey; label: string }> = [
  { key: "totalRevenue", label: "Doanh thu" },
  { key: "totalViews", label: "Lượt xem" },
  { key: "totalFollowers", label: "Lượt theo dõi" },
  { key: "totalVideos", label: "Số lượng video" },
  { key: "username", label: "Tên tài khoản" },
  { key: "gpmProfileName", label: "GPM Profile Name" },
  { key: "groupName", label: "GPM Group" },
  { key: "country", label: "Quốc gia" },
  { key: "status", label: "Trạng thái" },
  { key: "isOnline", label: "Trạng thái Online" },
  { key: "lastSyncedAt", label: "Đồng bộ lần cuối" },
];

// ─── Alert helpers (mirrors accounts/page.tsx) ───────────────────────────────
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

function StrikeWarningPopover({ account, punishedVideos }: { account: any; punishedVideos: any[] }) {
  if (!punishedVideos.length) return null;
  const theme = getStrikeTheme(punishedVideos.length);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all shadow-sm cursor-pointer group ${theme.badge}`}
          aria-label={theme.label}
        >
          <AlertTriangle className={`w-3.5 h-3.5 shrink-0 group-hover:scale-110 transition-transform ${theme.icon}`} />
          <span>{theme.label}</span>
        </button>
      </PopoverTrigger>
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
                <div key={vIdx} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 flex items-start gap-2.5">
                  <div className="w-11 h-14 rounded-lg bg-slate-200 dark:bg-slate-800 overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700">
                    {cover ? (
                      <img src={cover} alt={v.title || "Cover"} className="w-full h-full object-cover" />
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
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border ${isShop ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                          : isSeries ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                            : isGifts ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                              : "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20"
                        }`}>
                        <Sparkles className="w-2.5 h-2.5 shrink-0" />
                        {progName}
                      </span>
                      <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                        Bị huỷ điều kiện
                      </span>
                      {v.postDate && <span className="text-[10px] text-slate-400">{v.postDate}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Phân tách theo từng chương trình kiếm tiền</span>
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

const USER_ACCOUNTS_COLUMN_RESIZE_CONFIG = {
  select: { minWidth: 40, maxWidth: 56, defaultWidth: 44 },
  username: { minWidth: 200, maxWidth: 450, defaultWidth: 260 },
  isOnline: { minWidth: 90, maxWidth: 160, defaultWidth: 100 },
  country: { minWidth: 96, maxWidth: 180, defaultWidth: 110 },
  status: { minWidth: 140, maxWidth: 220, defaultWidth: 155 },
  gpmProfileName: { minWidth: 150, maxWidth: 300, defaultWidth: 170 },
  gpmGroup: { minWidth: 140, maxWidth: 280, defaultWidth: 160 },
  gpmProfileId: { minWidth: 200, maxWidth: 360, defaultWidth: 240 },
  alerts: { minWidth: 110, maxWidth: 280, defaultWidth: 140 },
  totalViews: { minWidth: 120, maxWidth: 240, defaultWidth: 140 },
  totalFollowers: { minWidth: 120, maxWidth: 240, defaultWidth: 140 },
  totalVideos: { minWidth: 90, maxWidth: 180, defaultWidth: 110 },
  totalRevenue: { minWidth: 110, maxWidth: 240, defaultWidth: 130 },
  lastSyncedAt: { minWidth: 130, maxWidth: 260, defaultWidth: 160 },
  actions: { minWidth: 100, maxWidth: 200, defaultWidth: 120 },
} as const;

function UserDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = params?.id as string;
  const { data: session } = useSession();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copiedGpmId, setCopiedGpmId] = useState<string | null>(null);

  // SaaS URL Query State Synchronization
  const { updateUrlParams } = useUrlParams();

  const validTabs = ["accounts", "checklists", "requests", "profile"] as const;
  const paramTab = searchParams?.get("tab") as any;
  const initialTab = validTabs.includes(paramTab) ? paramTab : "accounts";
  const [activeTab, setActiveTab] = useState<"accounts" | "checklists" | "requests" | "profile">(initialTab);

  const initialFrom = searchParams?.get("from") || "";
  const initialTo = searchParams?.get("to") || "";
  const paramDays = searchParams?.get("days");
  const initialIsCustom = Boolean(initialFrom && initialTo);
  const rawInitialDays = initialIsCustom ? -1 : Number(paramDays ?? 28);
  // Legacy days=0 (Toàn Bộ) → 365 (Studio data capped at 365 days)
  const initialDays =
    rawInitialDays === 0 || (!initialIsCustom && !Number.isFinite(rawInitialDays))
      ? 365
      : rawInitialDays;
  const [days, setDays] = useState(initialDays); // -1 = custom
  const [customStartDate, setCustomStartDate] = useState(initialFrom);
  const [customEndDate, setCustomEndDate] = useState(initialTo);
  const [isRangePickerOpen, setIsRangePickerOpen] = useState(false);
  const [rangeSelection, setRangeSelection] = useState<DateRange | undefined>(() => {
    if (initialFrom && initialTo) {
      return {
        from: new Date(initialFrom + "T00:00:00"),
        to: new Date(initialTo + "T00:00:00"),
      };
    }
    return { from: subDays(new Date(), 27), to: new Date() };
  });

  const { formatAmount } = useCurrency();

  const rangeLabelShort = useMemo(() => {
    if (days === -1 && customStartDate && customEndDate) {
      return `${format(new Date(customStartDate + "T00:00:00"), "dd/MM")}–${format(new Date(customEndDate + "T00:00:00"), "dd/MM")}`;
    }
    if (days === 30) return "Tháng này";
    return `${days}d`;
  }, [days, customStartDate, customEndDate]);

  const rangeLabelLong = useMemo(() => {
    if (days === -1 && customStartDate && customEndDate) {
      return `${format(new Date(customStartDate + "T00:00:00"), "dd/MM/yy")} - ${format(new Date(customEndDate + "T00:00:00"), "dd/MM/yy")}`;
    }
    if (days === 30) return "Tháng này (Từ 01 đến nay)";
    return `${days} ngày qua`;
  }, [days, customStartDate, customEndDate]);

  const initialSearch = searchParams?.get("q") || searchParams?.get("search") || "";
  const [accountSearch, setAccountSearch] = useState(initialSearch);

  const initialStatus = searchParams?.get("status") || "ALL";
  const [accountStatusFilter, setAccountStatusFilter] = useState(initialStatus);

  const initialCountry = searchParams?.get("country") || "ALL";
  const [accountCountryFilter, setAccountCountryFilter] = useState(initialCountry);

  // Sorting
  const initialSortKey = (searchParams?.get("sort") || searchParams?.get("sortBy") || "totalRevenue") as AccountSortKey;
  const initialSortDesc = (searchParams?.get("dir") || searchParams?.get("sortOrder")) === "asc" ? false : true;
  const [sortConfig, setSortConfig] = useState<{ key: AccountSortKey; desc: boolean }>({
    key: initialSortKey,
    desc: initialSortDesc,
  });

  const currentSortOption = useMemo(() => {
    return (
      ACCOUNT_SORT_OPTIONS.find((opt) => opt.key === sortConfig.key) || {
        key: sortConfig.key,
        label: "Mặc định",
      }
    );
  }, [sortConfig.key]);

  const sortDirectionText = sortConfig.desc ? "Giảm dần ↓" : "Tăng dần ↑";

  const handleAccountSort = (key: AccountSortKey) => {
    setSortConfig((prev) => ({
      key,
      desc:
        prev.key === key
          ? !prev.desc
          : ["totalRevenue", "totalViews", "totalFollowers", "totalVideos", "lastSyncedAt"].includes(key),
    }));
  };

  const renderAccountSortIndicator = (key: AccountSortKey) => {
    if (sortConfig.key !== key) {
      return (
        <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60 group-hover:opacity-100 transition-opacity" />
      );
    }
    return sortConfig.desc ? (
      <ArrowDown className="w-3.5 h-3.5 text-pink-500" />
    ) : (
      <ArrowUp className="w-3.5 h-3.5 text-pink-500" />
    );
  };

  const tableRef = useRef<HTMLDivElement>(null);
  const { getColumnStyle, getTableVars, renderResizeHandle } = useTableColumnResize({
    tableId: "user_accounts_v3",
    columns: USER_ACCOUNTS_COLUMN_RESIZE_CONFIG,
    tableRef,
    extraWidth: 0, // select column is in the resize config
  });

  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // Auto sync active state to URL
  useEffect(() => {
    updateUrlParams(
      {
        tab: activeTab,
        days: days === -1 ? undefined : days,
        from: days === -1 ? customStartDate : undefined,
        to: days === -1 ? customEndDate : undefined,
        q: accountSearch,
        status: accountStatusFilter,
        country: accountCountryFilter,
        sort: sortConfig.key,
        dir: sortConfig.desc ? "desc" : "asc",
      },
      {
        days: 28,
        from: "",
        to: "",
        q: "",
        status: "ALL",
        country: "ALL",
        sort: "totalRevenue",
        dir: "desc",
      }
    );
  }, [
    activeTab,
    days,
    customStartDate,
    customEndDate,
    accountSearch,
    accountStatusFilter,
    accountCountryFilter,
    sortConfig,
    updateUrlParams,
  ]);

  useEffect(() => {
    if (activeTab === "requests" && session?.user) {
      const allowed =
        (session.user as any).role === "ADMIN" || session.user.id === userId;
      if (!allowed) setActiveTab("accounts");
    }
  }, [activeTab, session?.user, userId]);

  const utils = trpc.useUtils();
  const queryClient = useQueryClient();

  const showToast = (text: string, type: "success" | "error" | "info" = "success") => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const queryInput = useMemo(() => {
    if (days === -1 && customStartDate && customEndDate) {
      return { id: userId, startDate: customStartDate, endDate: customEndDate };
    }
    return { id: userId, days: days < 0 ? 28 : days };
  }, [userId, days, customStartDate, customEndDate]);

  const { data: userDetail, isLoading: loading, error } = trpc.user.getById.useQuery(
    queryInput,
    { enabled: !!userId }
  );

  const canViewUserRequests =
    !!userId &&
    ((session?.user as any)?.role === "ADMIN" || session?.user?.id === userId);

  const { data: userRequests, isLoading: loadingRequests } =
    trpc.user.listRequestsForUser.useQuery(
      { userId },
      { enabled: canViewUserRequests }
    );

  const deleteMachineRequestMutation = trpc.user.deleteMachineChangeRequest.useMutation({
    onSuccess: () => {
      showToast("Đã xóa yêu cầu đổi máy.", "success");
      utils.user.listRequestsForUser.invalidate({ userId });
      utils.admin.listPendingMachineChangeRequests.invalidate();
    },
    onError: (err) => showToast(err.message || "Lỗi xóa yêu cầu", "error"),
  });

  const deleteExtensionRequestMutation = trpc.user.deleteExtensionAccessRequest.useMutation({
    onSuccess: () => {
      showToast("Đã xóa yêu cầu kích hoạt Extension.", "success");
      utils.user.listRequestsForUser.invalidate({ userId });
      utils.admin.listPendingExtensionAccessRequests.invalidate();
    },
    onError: (err) => showToast(err.message || "Lỗi xóa yêu cầu", "error"),
  });

  // GPM Launch mutation
  const startGpmMutation = trpc.gpm.startProfile.useMutation({
    onSuccess: () => showToast("Đã khởi chạy profile GPMLogin!", "success"),
    onError: (err) => showToast(err.message || "Lỗi khởi chạy GPM", "error"),
  });

  // Role update mutation (ADMIN)
  const updateRoleMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      showToast("Đã cập nhật vai trò nhân sự!", "success");
      utils.user.getById.invalidate({ id: userId });
      utils.admin.listUsers.invalidate();
    },
    onError: (err) => showToast(err.message || "Lỗi cập nhật vai trò", "error"),
  });

  // Status toggle mutation (ADMIN)
  const toggleStatusMutation = trpc.admin.toggleUserStatus.useMutation({
    onSuccess: () => {
      showToast("Đã thay đổi trạng thái hoạt động!", "success");
      utils.user.getById.invalidate({ id: userId });
      utils.admin.listUsers.invalidate();
    },
    onError: (err) => showToast(err.message || "Lỗi đổi trạng thái", "error"),
  });

  const deleteUserMutation = trpc.admin.deleteUser.useMutation({
    onSuccess: () => {
      showToast("Đã xóa nhân sự!", "success");
      router.push("/users");
    },
    onError: (err) => showToast(err.message || "Lỗi xóa nhân sự", "error"),
  });

  const unlinkMachineMutation = trpc.admin.unlinkUserMachine.useMutation({
    onSuccess: () => {
      showToast("Đã hủy liên kết máy tính!", "success");
      utils.user.getById.invalidate({ id: userId });
      utils.admin.listUsers.invalidate();
    },
    onError: (err) => showToast(err.message || "Lỗi hủy liên kết máy", "error"),
  });

  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [editRole, setEditRole] = useState<"ADMIN" | "LEAD" | "STAFF">("STAFF");
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [isTokenRevealed, setIsTokenRevealed] = useState(false);
  const [copiedExtensionToken, setCopiedExtensionToken] = useState(false);

  const {
    data: tokenData,
    isLoading: tokenLoading,
    refetch: refetchToken,
  } = trpc.admin.getExtensionToken.useQuery(
    { userId },
    { enabled: isTokenModalOpen && !!userId }
  );

  const regenerateTokenMutation = trpc.admin.regenerateExtensionToken.useMutation({
    onSuccess: () => {
      showToast("Đã cấp Token mới!", "success");
      refetchToken();
      setIsTokenRevealed(true);
    },
    onError: (err) => showToast(err.message || "Lỗi cấp lại Token", "error"),
  });

  const revokeTokenMutation = trpc.admin.revokeExtensionToken.useMutation({
    onSuccess: () => {
      showToast("Đã vô hiệu hóa Extension Token!", "success");
      refetchToken();
      setIsTokenRevealed(false);
    },
    onError: (err) => showToast(err.message || "Lỗi vô hiệu hóa Token", "error"),
  });

  // Sync account mutation
  const syncMutation = trpc.accounts.syncAccount.useMutation({
    onSuccess: (data) => {
      showToast(`Đã đồng bộ tài khoản @${data.account.username}!`, "success");
      utils.user.getById.invalidate({ id: userId });
    },
    onError: (err) => showToast(err.message || "Lỗi đồng bộ tài khoản", "error"),
  });

  const stopSyncMutation = trpc.accounts.stopSyncAccount.useMutation({
    onSuccess: () => showToast("Đã dừng đồng bộ!", "info"),
    onError: (err) => showToast(err.message || "Lỗi dừng đồng bộ", "error"),
  });

  const bulkDeleteMutation = trpc.accounts.bulkDelete.useMutation({
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: [["accounts"]] });
      await queryClient.cancelQueries({ queryKey: [["user", "getById"]] });
      const snapshot = snapshotAccountQueries(queryClient);
      optimisticallyDeleteAccounts(queryClient, vars.ids);
      return { snapshot };
    },
    onError: (err, _vars, context: any) => {
      if (context?.snapshot) {
        rollbackAccountQueries(queryClient, context.snapshot);
      }
      showToast(err.message || "Lỗi xóa hàng loạt", "error");
    },
    onSuccess: () => {
      showToast("Đã xóa các tài khoản đã chọn!", "success");
      setSelectedIds(new Set());
      utils.user.getById.invalidate({ id: userId });
      utils.accounts.list.invalidate();
    },
    onSettled: () => {
      utils.user.getById.invalidate({ id: userId });
      utils.accounts.list.invalidate();
    },
  });

  const bulkUpdateStatusMutation = trpc.accounts.bulkUpdateStatus.useMutation({
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: [["accounts"]] });
      await queryClient.cancelQueries({ queryKey: [["user", "getById"]] });
      const snapshot = snapshotAccountQueries(queryClient);
      optimisticallyBulkUpdateAccounts(queryClient, vars.ids, { status: vars.status });
      return { snapshot };
    },
    onError: (err, _vars, context: any) => {
      if (context?.snapshot) {
        rollbackAccountQueries(queryClient, context.snapshot);
      }
      showToast(err.message || "Lỗi đổi trạng thái", "error");
    },
    onSuccess: () => {
      showToast("Đã cập nhật trạng thái!", "success");
      setSelectedIds(new Set());
      utils.user.getById.invalidate({ id: userId });
      utils.accounts.list.invalidate();
    },
    onSettled: () => {
      utils.user.getById.invalidate({ id: userId });
      utils.accounts.list.invalidate();
    },
  });

  const [isBulkStatusOpen, setIsBulkStatusOpen] = useState(false);
  const [bulkStatusVal, setBulkStatusVal] = useState("ACTIVE");

  // Country badge helper
  const getCountryBadge = (country?: string) => {
    const code = normalizeCountry(country);
    switch (code) {
      case "US":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
            <span className="text-xs">🇺🇸</span> US
          </span>
        );
      case "UK":
      case "GB":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50">
            <span className="text-xs">🇬🇧</span> UK
          </span>
        );
      case "VN":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300 border border-red-200 dark:border-red-800/50">
            <span className="text-xs">🇻🇳</span> VN
          </span>
        );
      case "DE":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
            <span className="text-xs">🇩🇪</span> DE
          </span>
        );
      case "FR":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 border border-sky-200 dark:border-sky-800/50">
            <span className="text-xs">🇫🇷</span> FR
          </span>
        );
      default:
        const flag = FLAG_MAP[code] || "🌐";
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <span className="text-xs">{flag}</span> {code}
          </span>
        );
    }
  };

  // Status badge helper
  const getStatusBadge = (status: string) => {
    const badgeClass =
      "inline-flex max-w-full min-w-0 items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold whitespace-nowrap truncate";
    switch (status) {
      case "ACTIVE":
        return (
          <span className={`${badgeClass} bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20`} title="Hoạt Động">
            <CheckCircle className="w-3 h-3 shrink-0" /> Hoạt Động
          </span>
        );
      case "WARMING":
        return (
          <span className={`${badgeClass} bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20`} title="Đang Nuôi">
            <Flame className="w-3 h-3 shrink-0" /> Đang Nuôi
          </span>
        );
      case "RESTRICTED":
        return (
          <span className={`${badgeClass} bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20`} title="Hạn Chế">
            <AlertTriangle className="w-3 h-3 shrink-0" /> Hạn Chế
          </span>
        );
      case "BANNED":
        return (
          <span className={`${badgeClass} bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20`} title="Bị Khóa">
            <XCircle className="w-3 h-3 shrink-0" /> Bị Khóa
          </span>
        );
      case "STOPPED":
        return (
          <span className={`${badgeClass} bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20`} title="Tạm Dừng">
            <Clock className="w-3 h-3 shrink-0" /> Tạm Dừng
          </span>
        );
      default:
        return (
          <span className={`${badgeClass} bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20`} title={status}>
            {status}
          </span>
        );
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "ADMIN":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60">
            <ShieldCheck className="w-3.5 h-3.5" /> Quản Trị Viên (Admin)
          </span>
        );
      case "LEAD":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-pink-50 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800/60">
            <Shield className="w-3.5 h-3.5" /> Trưởng Nhóm (Lead)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <UserCheck className="w-3.5 h-3.5 text-slate-500" /> Nhân Viên (Staff)
          </span>
        );
    }
  };

  // Filter and sort accounts
  const filteredAccounts = useMemo(() => {
    if (!userDetail?.tiktokAccounts) return [];
    const filtered = userDetail.tiktokAccounts.filter((acc: any) => {
      const matchSearch =
        !accountSearch ||
        acc.username.toLowerCase().includes(accountSearch.toLowerCase()) ||
        (acc.gpmProfileId && acc.gpmProfileId.toLowerCase().includes(accountSearch.toLowerCase())) ||
        (acc.gpmProfileName && acc.gpmProfileName.toLowerCase().includes(accountSearch.toLowerCase())) ||
        (acc.groupName && acc.groupName.toLowerCase().includes(accountSearch.toLowerCase()));

      const matchStatus = accountStatusFilter === "ALL" || acc.status === accountStatusFilter;
      const matchCountry = accountCountryFilter === "ALL" || normalizeCountry(acc.country) === accountCountryFilter;

      return matchSearch && matchStatus && matchCountry;
    });

    // Sorting
    filtered.sort((a: any, b: any) => {
      const isDesc = sortConfig.desc;

      if (sortConfig.key === "totalRevenue") {
        const revA = Number(a.displayRevenue ?? a.analytics?.totalRevenue ?? a.totalRevenue ?? 0);
        const revB = Number(b.displayRevenue ?? b.analytics?.totalRevenue ?? b.totalRevenue ?? 0);
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

      if (sortConfig.key === "isOnline") {
        const onA = a.isOnline ? 1 : 0;
        const onB = b.isOnline ? 1 : 0;
        return isDesc ? onB - onA : onA - onB;
      }

      if (sortConfig.key === "lastSyncedAt") {
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

      // String fields: gpmProfileName, groupName, username, status
      const valA = a[sortConfig.key];
      const valB = b[sortConfig.key];
      const strA = (valA != null ? String(valA) : "").trim();
      const strB = (valB != null ? String(valB) : "").trim();

      if (!strA && !strB) return 0;
      if (!strA) return 1; // Empty values always at bottom
      if (!strB) return -1;

      const cmp = strA.localeCompare(strB, "vi", { numeric: true, sensitivity: "base" });
      return isDesc ? -cmp : cmp;
    });

    return filtered;
  }, [
    userDetail?.tiktokAccounts,
    accountSearch,
    accountStatusFilter,
    accountCountryFilter,
    sortConfig,
  ]);

  const isAllPageSelected =
    filteredAccounts.length > 0 &&
    filteredAccounts.every((acc: any) => selectedIds.has(acc.id));

  const toggleSelectAll = (checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) {
      filteredAccounts.forEach((acc: any) => next.add(acc.id));
    } else {
      filteredAccounts.forEach((acc: any) => next.delete(acc.id));
    }
    setSelectedIds(next);
  };

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkSync = async () => {
    const ids = Array.from(selectedIds);
    for (const accountId of ids) {
      try {
        await syncMutation.mutateAsync({ accountId });
      } catch {
        // continue remaining
      }
    }
  };

  if (loading) {
    return <UserDetailSkeleton />;
  }

  if (error || !userDetail) {
    return (
      <div className="text-center py-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 space-y-4 max-w-lg mx-auto">
        <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <XCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Không tìm thấy nhân sự</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {error?.message || "Tài khoản nhân viên này không tồn tại hoặc bạn không có quyền truy cập."}
        </p>
        <Link
          href="/users"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Quay lại danh sách nhân sự
        </Link>
      </div>
    );
  }

  const { user, stats, dailyChecklists } = userDetail;
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const isLeadOrAdmin =
    (session?.user as any)?.role === "ADMIN" || (session?.user as any)?.role === "LEAD";

  return (
    <div className="space-y-6 animate-fadeIn pb-16">
      {/* Toast Notification */}
      {toastMsg && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-xl border text-xs font-semibold backdrop-blur-md animate-slideUp ${toastMsg.type === "success"
              ? "bg-emerald-500/90 text-white border-emerald-400"
              : toastMsg.type === "error"
                ? "bg-rose-500/90 text-white border-rose-400"
                : "bg-slate-900/90 text-white border-slate-700"
            }`}
        >
          {toastMsg.type === "success" && <CheckCircle className="w-4 h-4 shrink-0" />}
          {toastMsg.type === "error" && <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Header Section */}
      <div className="bg-transparent pb-4 border-b border-slate-200/80 dark:border-slate-800/80 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Back & Profile Info */}
          <div className="flex items-center gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/users"
                  className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shadow-sm shrink-0"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Quay lại Quản lý nhân sự
              </TooltipContent>
            </Tooltip>

            {/* Avatar & Names */}
            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 via-pink-500 to-rose-400 p-0.5 shadow-md shrink-0">
                <div className="w-full h-full rounded-[14px] bg-white dark:bg-slate-900 flex items-center justify-center font-black text-purple-600 dark:text-purple-400 text-xl uppercase">
                  {user.fullName.slice(0, 2)}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                    {user.fullName}
                  </h1>
                  {getRoleBadge(user.role)}
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold ${user.isActive
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50"
                        : "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50"
                      }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${user.isActive ? "bg-emerald-500" : "bg-rose-500"}`} />
                    {user.isActive ? "Đang Hoạt Động" : "Tạm Khóa"}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1 flex-wrap font-mono">
                  <span>@{user.username}</span>
                  <span>•</span>
                  <span>{user.email}</span>
                  {user.phone && (
                    <>
                      <span>•</span>
                      <span>SĐT: {user.phone}</span>
                    </>
                  )}
                  <span>•</span>
                  <span>Gia nhập: {new Date(user.createdAt).toLocaleDateString("vi-VN")}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Direct Checklist link */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={`/checklist?date=${new Date().toISOString().split("T")[0]}`}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm hover:shadow active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Xem Checklist Hôm Nay</span>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-semibold">
                Xem bảng chấm công và thực hiện checklist hôm nay
              </TooltipContent>
            </Tooltip>

            {/* Admin actions — same as users card (without Xem chi tiết) */}
            {isAdmin && (
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="h-9 w-9 flex items-center justify-center rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer shadow-xs"
                        aria-label="Thao tác"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Tùy chọn thao tác</TooltipContent>
                </Tooltip>
                <DropdownMenuContent
                  align="end"
                  className="w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-1"
                >
                  <DropdownMenuItem
                    disabled={session?.user?.id === user.id}
                    onClick={() => {
                      setEditRole(user.role as "ADMIN" | "LEAD" | "STAFF");
                      setIsRoleModalOpen(true);
                    }}
                    className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer font-normal"
                  >
                    <Pencil className="w-3.5 h-3.5 text-slate-400" />
                    <span>Đổi vai trò</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => {
                      setIsTokenRevealed(false);
                      setCopiedExtensionToken(false);
                      setIsTokenModalOpen(true);
                    }}
                    className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer font-normal"
                  >
                    <Key className="w-3.5 h-3.5 text-slate-400" />
                    <span>Quản lý Extension Token</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    disabled={session?.user?.id === user.id}
                    onClick={async () => {
                      const ok = await confirm({
                        title: user.isActive ? "Chặn quyền truy cập" : "Mở lại quyền truy cập",
                        description: user.isActive
                          ? `Xác nhận CHẶN QUYỀN TRUY CẬP của nhân sự ${user.fullName || user.username}? Nhân sự này sẽ bị ngắt phiên làm việc và không thể đăng nhập vào hệ thống!`
                          : `Xác nhận MỞ LẠI QUYỀN TRUY CẬP cho nhân sự ${user.fullName || user.username}?`,
                        confirmLabel: user.isActive ? "Xác nhận chặn" : "Xác nhận mở khóa",
                        variant: user.isActive ? "danger" : "amber",
                        icon: user.isActive ? "ban" : "check",
                      });
                      if (ok) {
                        toggleStatusMutation.mutate({ userId: user.id, isActive: !user.isActive });
                      }
                    }}
                    className={`flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer font-normal ${session?.user?.id === user.id
                        ? "opacity-50 cursor-not-allowed text-slate-400"
                        : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                  >
                    {user.isActive ? (
                      <>
                        <Ban className="w-3.5 h-3.5 text-slate-400" />
                        <span>Chặn quyền truy cập</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>Mở chặn quyền truy cập</span>
                      </>
                    )}
                  </DropdownMenuItem>

                  {user.boundMachineId && (
                    <DropdownMenuItem
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Hủy liên kết máy tính",
                          description: `Hủy liên kết máy "${user.boundMachineName || user.boundMachineId}" cho user này?`,
                          confirmLabel: "Xác nhận hủy liên kết",
                          variant: "warning",
                          icon: "unlink",
                        });
                        if (ok) {
                          unlinkMachineMutation.mutate({
                            userId: user.id,
                            reason: "admin_unlink_ui",
                          });
                        }
                      }}
                      className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer font-normal"
                    >
                      <MonitorX className="w-3.5 h-3.5 text-slate-400" />
                      <span>Hủy Liên Kết Máy Tính</span>
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator className="my-1 border-slate-100 dark:border-slate-800" />

                  <DropdownMenuItem
                    disabled={session?.user?.id === user.id}
                    onClick={async () => {
                      const ok = await confirm({
                        title: "Xác nhận xóa nhân sự",
                        description: `Xóa nhân sự ${user.fullName || user.username}? Các tài khoản TikTok đang phụ trách sẽ về trạng thái Chưa phân công.`,
                        confirmLabel: "Xác nhận xóa",
                        variant: "danger",
                      });
                      if (ok) {
                        deleteUserMutation.mutate({ userId: user.id });
                      }
                    }}
                    className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg cursor-pointer font-normal"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    <span>Xóa nhân sự</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Navigation Tabs & Time Range Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-200/60 dark:border-slate-800/60 pt-2.5">
          <div className="flex items-center gap-1 overflow-x-auto">
            <button
              onClick={() => setActiveTab("accounts")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${activeTab === "accounts"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                }`}
            >
              <Users className="w-3.5 h-3.5 text-pink-500" />
              <span>Tài Khoản Phụ Trách ({stats.totalAssigned})</span>
            </button>

            <button
              onClick={() => setActiveTab("checklists")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${activeTab === "checklists"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                }`}
            >
              <Calendar className="w-3.5 h-3.5 text-emerald-500" />
              <span>Lịch Sử Chấm Công ({dailyChecklists.length})</span>
            </button>

            {canViewUserRequests && (
              <button
                onClick={() => setActiveTab("requests")}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${activeTab === "requests"
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                  }`}
              >
                <Inbox className="w-3.5 h-3.5 text-amber-500" />
                <span>
                  Yêu cầu (
                  {(userRequests?.machineChangeRequests?.length || 0) +
                    (userRequests?.extensionAccessRequests?.length || 0)}
                  )
                </span>
              </button>
            )}

            <button
              onClick={() => setActiveTab("profile")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${activeTab === "profile"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                }`}
            >
              <UserCog className="w-3.5 h-3.5 text-purple-500" />
              <span>Thông Tin Chi Tiết</span>
            </button>
          </div>

          {/* Time Range Filter Chips */}
          {activeTab !== "requests" && (
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 self-start sm:self-auto overflow-x-auto">
              {[
                { value: 7, label: "7 Ngày", desc: "7 ngày gần nhất" },
                { value: 28, label: "28 Ngày", desc: "28 ngày gần nhất" },
                { value: 30, label: "Tháng này", desc: "Tháng này (từ ngày 01 đến hôm nay)" },
                { value: 60, label: "60 Ngày", desc: "60 ngày gần nhất" },
                { value: 365, label: "365 Ngày", desc: "Năm nay (365 ngày gần nhất)" },
              ].map((p) => (
                <Tooltip key={p.value}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setDays(p.value)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-normal transition-all cursor-pointer whitespace-nowrap ${days === p.value
                          ? "bg-amber-500 text-slate-950 shadow-xs font-medium"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                    >
                      {p.label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {p.desc}
                  </TooltipContent>
                </Tooltip>
              ))}

              <Popover open={isRangePickerOpen} onOpenChange={setIsRangePickerOpen}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={`px-2.5 py-1 rounded-lg text-xs font-normal transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${days === -1
                            ? "bg-amber-500 text-slate-950 shadow-xs font-medium"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                          }`}
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>
                          {days === -1 && customStartDate && customEndDate
                            ? `${format(new Date(customStartDate + "T00:00:00"), "dd/MM")} - ${format(new Date(customEndDate + "T00:00:00"), "dd/MM")}`
                            : "Tùy chọn"}
                        </span>
                      </button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Tùy chọn khoảng thời gian (tối đa {MAX_CUSTOM_RANGE_DAYS} ngày)
                  </TooltipContent>
                </Tooltip>
                <PopoverContent
                  side="bottom"
                  sideOffset={6}
                  align="end"
                  avoidCollisions={false}
                  className="w-[325px] p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50"
                >
                  <div className="flex items-center justify-between gap-2 pb-2 mb-1 border-b border-slate-100 dark:border-slate-800">
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        Chọn thời gian
                      </span>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Trong vòng {MAX_CUSTOM_RANGE_DAYS} ngày gần nhất
                      </p>
                    </div>
                    {rangeSelection?.from && (
                      <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800 whitespace-nowrap shrink-0">
                        {format(rangeSelection.from, "dd/MM/yy")} -{" "}
                        {rangeSelection.to ? format(rangeSelection.to, "dd/MM/yy") : "..."}
                      </span>
                    )}
                  </div>

                  <div className="w-full py-0.5">
                    <CalendarPicker
                      mode="range"
                      selected={rangeSelection}
                      onSelect={(range) => {
                        if (!range?.from) {
                          setRangeSelection(range);
                          return;
                        }
                        const minDate = subDays(new Date(), MAX_CUSTOM_RANGE_DAYS);
                        let from = range.from < minDate ? minDate : range.from;
                        if (!range.to) {
                          setRangeSelection({ from, to: undefined });
                          return;
                        }
                        let to = range.to > new Date() ? new Date() : range.to;
                        if (to < minDate) to = minDate;
                        const span = Math.abs(differenceInCalendarDays(to, from));
                        if (span > MAX_CUSTOM_RANGE_DAYS) {
                          const fromFirst = from.getTime() <= to.getTime() ? from : to;
                          setRangeSelection({
                            from: fromFirst,
                            to: addDays(fromFirst, MAX_CUSTOM_RANGE_DAYS),
                          });
                          return;
                        }
                        setRangeSelection(
                          from.getTime() <= to.getTime() ? { from, to } : { from: to, to: from }
                        );
                      }}
                      disabled={(date) => {
                        const today = new Date();
                        const minDate = subDays(today, MAX_CUSTOM_RANGE_DAYS);
                        if (date > today || date < minDate) return true;
                        if (!rangeSelection?.from || rangeSelection.to) return false;
                        const from = rangeSelection.from;
                        return (
                          differenceInCalendarDays(date, from) > MAX_CUSTOM_RANGE_DAYS ||
                          differenceInCalendarDays(from, date) > MAX_CUSTOM_RANGE_DAYS
                        );
                      }}
                      numberOfMonths={1}
                      className="w-full p-0 [--cell-size:2.1rem] [&_.rdp-root]:w-full [&_.rdp-months]:w-full [&_.rdp-month]:w-full [&_.rdp-month_grid]:w-full [&_.rdp-weekdays]:w-full [&_.rdp-weekdays]:justify-between [&_.rdp-week]:w-full [&_.rdp-week]:justify-between [&_.rdp-week]:mt-1 [&_.rdp-day]:flex-1 [&_.rdp-button]:w-full [&_.rdp-button]:h-8 [&_.rdp-button]:min-w-0 [&_.rdp-button]:aspect-auto [&_.rdp-button]:text-xs"
                      classNames={{
                        root: "w-full",
                        months: "relative flex flex-col w-full",
                        month: "w-full flex flex-col gap-1.5",
                        weekdays: "flex w-full justify-between",
                        week: "flex w-full mt-1 justify-between",
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setIsRangePickerOpen(false)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      disabled={!rangeSelection?.from}
                      onClick={() => {
                        if (rangeSelection?.from) {
                          let from = rangeSelection.from;
                          let to = rangeSelection.to || from;
                          if (to.getTime() < from.getTime()) {
                            const tmp = from;
                            from = to;
                            to = tmp;
                          }
                          const minDate = subDays(new Date(), MAX_CUSTOM_RANGE_DAYS);
                          if (from < minDate) from = minDate;
                          if (to > new Date()) to = new Date();
                          if (differenceInCalendarDays(to, from) > MAX_CUSTOM_RANGE_DAYS) {
                            to = addDays(from, MAX_CUSTOM_RANGE_DAYS);
                          }
                          setCustomStartDate(format(from, "yyyy-MM-dd"));
                          setCustomEndDate(format(to, "yyyy-MM-dd"));
                          setRangeSelection({ from, to });
                          setDays(-1);
                        }
                        setIsRangePickerOpen(false);
                      }}
                      className="px-4 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg shadow-sm cursor-pointer transition-all disabled:opacity-50"
                    >
                      Áp dụng
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>
      </div>

      {/* Top 6 KPI Cards Overview */}
      {activeTab !== "requests" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {/* Total Assigned Accounts */}
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider truncate whitespace-nowrap" title="Account Giao Việc">Account Giao Việc</span>
              <Users className="w-4 h-4 text-pink-500 shrink-0" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-pink-600 dark:text-pink-400 mt-2 truncate">
              {stats.totalAssigned}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
              <span className="truncate">{stats.activeAccounts} hoạt động • {stats.warmingAccounts} nuôi</span>
            </div>
          </div>

          {/* Total Views across fleet */}
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider truncate whitespace-nowrap" title={`Views (${rangeLabelShort})`}>
                Views ({rangeLabelShort})
              </span>
              <Eye className="w-4 h-4 text-cyan-500 shrink-0" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-cyan-600 dark:text-cyan-400 mt-2 truncate">
              {Number(stats.totalViews).toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
              <span className="truncate">Dàn kênh {rangeLabelLong}</span>
            </div>
          </div>

          {/* Total Followers */}
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider truncate whitespace-nowrap" title="Tổng Followers">Tổng Followers</span>
              <UserCheck className="w-4 h-4 text-purple-500 shrink-0" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-purple-600 dark:text-purple-400 mt-2 truncate">
              {Number(stats.totalFollowers).toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
              <span className="truncate">Người theo dõi tích lũy</span>
            </div>
          </div>

          {/* Total Revenue */}
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider truncate whitespace-nowrap" title={`Doanh Thu (${rangeLabelShort})`}>
                Doanh Thu ({rangeLabelShort})
              </span>
              <DollarSign className="w-4 h-4 text-emerald-500 shrink-0" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2 truncate">
              ${Number(stats.totalRevenue).toFixed(2)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
              <span className="truncate">Thu nhập {rangeLabelLong}</span>
            </div>
          </div>

          {/* Workday Score */}
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider truncate whitespace-nowrap" title={`Ngày Công (${rangeLabelShort})`}>
                Ngày Công ({rangeLabelShort})
              </span>
              <Calendar className="w-4 h-4 text-amber-500 shrink-0" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 mt-2 truncate">
              {Number(stats.monthlyWorkdays)} Công
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
              <span className="truncate">Chốt theo mốc 10:00 AM</span>
            </div>
          </div>

          {/* Average Completion Rate */}
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider truncate whitespace-nowrap" title={`KPI TB (${rangeLabelShort})`}>
                KPI TB ({rangeLabelShort})
              </span>
              <TrendingUp className="w-4 h-4 text-indigo-500 shrink-0" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-2 truncate">
              {stats.avgCompletionRate}%
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
              <span className="truncate">Tỷ lệ hoàn thành nhiệm vụ</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: Assigned Accounts */}
      {activeTab === "accounts" && (
        <div className="space-y-4">
          {/* Filters & Search Toolbar */}
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  placeholder="Tìm username, profile ID, group..."
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  className="pl-9 pr-8 h-9 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 transition-colors"
                />
                {accountSearch && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setAccountSearch("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200/90 hover:bg-rose-500 hover:text-white dark:bg-slate-800 dark:hover:bg-rose-500 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all cursor-pointer shadow-2xs hover:scale-110"
                        aria-label="Xóa tìm kiếm"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Xóa tìm kiếm</TooltipContent>
                  </Tooltip>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative shrink-0">
                  <Select value={accountStatusFilter} onValueChange={setAccountStatusFilter}>
                    <SelectTrigger
                      className={`h-9 w-36 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 whitespace-nowrap [&>span]:truncate cursor-pointer transition-colors ${accountStatusFilter !== "ALL"
                          ? "pr-8 border-pink-200 dark:border-pink-900/60 bg-pink-50/40 dark:bg-pink-950/25 text-pink-700 dark:text-pink-300 [&_svg]:hidden"
                          : ""
                        }`}
                    >
                      <SelectValue placeholder="Trạng thái" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl">
                      <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">Tất cả trạng thái</SelectItem>
                      <SelectItem value="ACTIVE" className="text-xs font-normal cursor-pointer">Hoạt Động (Active)</SelectItem>
                      <SelectItem value="WARMING" className="text-xs font-normal cursor-pointer">Đang Nuôi (Warming)</SelectItem>
                      <SelectItem value="RESTRICTED" className="text-xs font-normal cursor-pointer">Hạn Chế</SelectItem>
                      <SelectItem value="BANNED" className="text-xs font-normal cursor-pointer">Bị Khóa (Banned)</SelectItem>
                      <SelectItem value="STOPPED" className="text-xs font-normal cursor-pointer">Tạm Dừng</SelectItem>
                    </SelectContent>
                  </Select>
                  {accountStatusFilter !== "ALL" && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setAccountStatusFilter("ALL");
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

                <div className="relative shrink-0">
                  <Select value={accountCountryFilter} onValueChange={setAccountCountryFilter}>
                    <SelectTrigger
                      className={`h-9 w-44 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 whitespace-nowrap [&>span]:truncate cursor-pointer transition-colors ${accountCountryFilter !== "ALL"
                          ? "pr-8 border-pink-200 dark:border-pink-900/60 bg-pink-50/40 dark:bg-pink-950/25 text-pink-700 dark:text-pink-300 [&_svg]:hidden"
                          : ""
                        }`}
                    >
                      <SelectValue placeholder="Tất cả quốc gia" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl max-h-60 overflow-y-auto bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl">
                      <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">Tất cả quốc gia</SelectItem>
                      {COUNTRY_OPTIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value} className="text-xs font-normal cursor-pointer">
                          {c.label}
                        </SelectItem>
                      ))}
                      {userDetail?.tiktokAccounts
                        ?.map((acc: any) => normalizeCountry(acc.country))
                        .filter((c: string, idx: number, arr: string[]) => arr.indexOf(c) === idx && !COUNTRY_OPTIONS.some((opt) => opt.value === c))
                        .map((extraCode: string) => (
                          <SelectItem key={extraCode} value={extraCode} className="text-xs font-normal cursor-pointer">
                            {FLAG_MAP[extraCode] || "🌐"} {extraCode}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {accountCountryFilter !== "ALL" && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setAccountCountryFilter("ALL");
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

                {/* Sort Popover */}
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
                          onClick={() => handleAccountSort(item.key)}
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
              </div>
            </div>

            {/* Active Filter Chips */}
            {(accountSearch || accountStatusFilter !== "ALL" || accountCountryFilter !== "ALL" || sortConfig.key !== "totalRevenue" || !sortConfig.desc) && (
              <div className="flex flex-wrap items-center gap-2">
                {accountSearch && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    <span>Tìm: {accountSearch}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button onClick={() => setAccountSearch("")} className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/15 hover:text-rose-500 transition-colors cursor-pointer">
                          <X className="w-3 h-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Xóa bộ lọc</TooltipContent>
                    </Tooltip>
                  </span>
                )}
                {accountStatusFilter !== "ALL" && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300">
                    <span>Trạng thái: {accountStatusFilter}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button onClick={() => setAccountStatusFilter("ALL")} className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/15 hover:text-rose-500 transition-colors cursor-pointer">
                          <X className="w-3 h-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Xóa bộ lọc</TooltipContent>
                    </Tooltip>
                  </span>
                )}
                {accountCountryFilter !== "ALL" && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300">
                    <span>Quốc gia: {COUNTRY_OPTIONS.find((c) => c.value === accountCountryFilter)?.label || accountCountryFilter}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button onClick={() => setAccountCountryFilter("ALL")} className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/15 hover:text-rose-500 transition-colors cursor-pointer">
                          <X className="w-3 h-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Xóa bộ lọc</TooltipContent>
                    </Tooltip>
                  </span>
                )}
                {(sortConfig.key !== "totalRevenue" || !sortConfig.desc) && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                    <span>Sắp xếp: {currentSortOption.label} ({sortConfig.desc ? "Giảm dần" : "Tăng dần"})</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setSortConfig({ key: "totalRevenue", desc: true })}
                          className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/15 hover:text-rose-500 transition-colors cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Đặt lại sắp xếp mặc định</TooltipContent>
                    </Tooltip>
                  </span>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => {
                        setAccountSearch("");
                        setAccountStatusFilter("ALL");
                        setAccountCountryFilter("ALL");
                        setSortConfig({ key: "totalRevenue", desc: true });
                      }}
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

          {/* Accounts Table */}
          {filteredAccounts.length === 0 ? (
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center space-y-3">
              <Users className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Không có tài khoản TikTok nào phù hợp
              </h3>
              <p className="text-xs text-slate-400">
                Nhân viên này chưa được gán tài khoản hoặc các tài khoản không khớp bộ lọc tìm kiếm.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden relative z-0 isolate">
              <div className="overflow-x-auto" ref={tableRef} style={getTableVars()}>
                <table
                  className="text-left text-xs table-fixed border-collapse"
                  style={{
                    width: "max(100%, var(--resize-table-min-width))",
                    minWidth: "var(--resize-table-min-width)",
                  }}
                >
                  <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-slate-600 dark:text-slate-300 font-semibold text-xs border-b border-slate-200 dark:border-slate-800 normal-case">
                    <tr>
                      <th style={getColumnStyle("select")} className="py-3.5 px-4 sticky left-0 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs overflow-hidden">
                        <Checkbox
                          checked={isAllPageSelected}
                          onCheckedChange={(val) => toggleSelectAll(!!val)}
                          aria-label="Chọn tất cả"
                        />
                      </th>
                      <th
                        style={getColumnStyle("username")}
                        onClick={() => handleAccountSort("username")}
                        className="relative group/th py-3.5 px-4 sticky left-10 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.03)] whitespace-nowrap cursor-pointer select-none group hover:text-slate-900 dark:hover:text-white transition-colors"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="truncate">Tài khoản</span>
                          {renderAccountSortIndicator("username")}
                        </div>
                        {renderResizeHandle("username")}
                      </th>
                      <th
                        style={getColumnStyle("isOnline")}
                        onClick={() => handleAccountSort("isOnline")}
                        className="relative group/th py-3.5 px-4 text-center whitespace-nowrap cursor-pointer select-none group hover:text-slate-900 dark:hover:text-white transition-colors"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span>Online</span>
                          {renderAccountSortIndicator("isOnline")}
                        </div>
                        {renderResizeHandle("isOnline")}
                      </th>
                      <th
                        style={getColumnStyle("country")}
                        onClick={() => handleAccountSort("country")}
                        className="relative group/th py-3.5 px-4 whitespace-nowrap cursor-pointer select-none group hover:text-slate-900 dark:hover:text-white transition-colors"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="truncate">Quốc gia</span>
                          {renderAccountSortIndicator("country")}
                        </div>
                        {renderResizeHandle("country")}
                      </th>
                      <th
                        style={getColumnStyle("status")}
                        onClick={() => handleAccountSort("status")}
                        className="relative group/th py-3.5 px-4 whitespace-nowrap cursor-pointer select-none group hover:text-slate-900 dark:hover:text-white transition-colors"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="truncate">Trạng thái</span>
                          {renderAccountSortIndicator("status")}
                        </div>
                        {renderResizeHandle("status")}
                      </th>
                      {/* GPM Profile Name */}
                      <th
                        style={getColumnStyle("gpmProfileName")}
                        onClick={() => handleAccountSort("gpmProfileName")}
                        className="relative group/th py-3.5 px-4 whitespace-nowrap cursor-pointer select-none group hover:text-slate-900 dark:hover:text-white transition-colors"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="truncate">GPM Profile Name</span>
                          {renderAccountSortIndicator("gpmProfileName")}
                        </div>
                        {renderResizeHandle("gpmProfileName")}
                      </th>
                      <th
                        style={getColumnStyle("gpmGroup")}
                        onClick={() => handleAccountSort("groupName")}
                        className="relative group/th py-3.5 px-4 whitespace-nowrap cursor-pointer select-none group hover:text-slate-900 dark:hover:text-white transition-colors"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="truncate">GPM Group</span>
                          {renderAccountSortIndicator("groupName")}
                        </div>
                        {renderResizeHandle("gpmGroup")}
                      </th>
                      <th
                        style={getColumnStyle("gpmProfileId")}
                        className="relative group/th py-3.5 px-4 whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="truncate">GPM Profile ID</span>
                        </div>
                        {renderResizeHandle("gpmProfileId")}
                      </th>
                      <th
                        style={getColumnStyle("alerts")}
                        className="relative group/th py-3.5 px-4 text-center whitespace-nowrap"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span>Cảnh Báo</span>
                        </div>
                        {renderResizeHandle("alerts")}
                      </th>
                      <th
                        style={getColumnStyle("totalViews")}
                        onClick={() => handleAccountSort("totalViews")}
                        className="relative group/th py-3.5 px-4 whitespace-nowrap cursor-pointer select-none group hover:text-slate-900 dark:hover:text-white transition-colors"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="truncate">Lượt xem</span>
                          {renderAccountSortIndicator("totalViews")}
                        </div>
                        {renderResizeHandle("totalViews")}
                      </th>
                      <th
                        style={getColumnStyle("totalFollowers")}
                        onClick={() => handleAccountSort("totalFollowers")}
                        className="relative group/th py-3.5 px-4 whitespace-nowrap cursor-pointer select-none group hover:text-slate-900 dark:hover:text-white transition-colors"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="truncate">Followers</span>
                          {renderAccountSortIndicator("totalFollowers")}
                        </div>
                        {renderResizeHandle("totalFollowers")}
                      </th>
                      <th
                        style={getColumnStyle("totalVideos")}
                        onClick={() => handleAccountSort("totalVideos")}
                        className="relative group/th py-3.5 px-4 whitespace-nowrap cursor-pointer select-none group hover:text-slate-900 dark:hover:text-white transition-colors"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="truncate">Số video</span>
                          {renderAccountSortIndicator("totalVideos")}
                        </div>
                        {renderResizeHandle("totalVideos")}
                      </th>
                      <th
                        style={getColumnStyle("totalRevenue")}
                        onClick={() => handleAccountSort("totalRevenue")}
                        className="relative group/th py-3.5 px-4 whitespace-nowrap cursor-pointer select-none group hover:text-slate-900 dark:hover:text-white transition-colors"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="truncate">Doanh thu</span>
                          {renderAccountSortIndicator("totalRevenue")}
                        </div>
                        {renderResizeHandle("totalRevenue")}
                      </th>
                      <th
                        style={getColumnStyle("lastSyncedAt")}
                        onClick={() => handleAccountSort("lastSyncedAt")}
                        className="relative group/th py-3.5 px-4 whitespace-nowrap cursor-pointer select-none group hover:text-slate-900 dark:hover:text-white transition-colors"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="truncate">Đồng bộ lần cuối</span>
                          {renderAccountSortIndicator("lastSyncedAt")}
                        </div>
                        {renderResizeHandle("lastSyncedAt")}
                      </th>
                      <th
                        style={getColumnStyle("actions")}
                        className="relative group/th py-3.5 px-4 text-center whitespace-nowrap sticky right-0 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs border-l border-slate-200 dark:border-slate-800 shadow-[-2px_0_5px_rgba(0,0,0,0.03)]"
                      >
                        Thao tác
                        {renderResizeHandle("actions", "left")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {filteredAccounts.map((acc: any) => {
                      const isSelected = selectedIds.has(acc.id);
                      const rowBg = isSelected
                        ? "bg-pink-50/40 dark:bg-pink-950/20"
                        : "bg-white dark:bg-slate-900";
                      return (
                        <tr
                          key={acc.id}
                          className={`group hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${isSelected ? "bg-pink-50/40 dark:bg-pink-950/20" : ""}`}
                        >
                          <td style={getColumnStyle("select")} className={`py-3.5 px-4 sticky left-0 z-10 ${rowBg} group-hover:bg-slate-50 dark:group-hover:bg-slate-800/90 transition-colors overflow-hidden`}>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelectRow(acc.id)}
                              aria-label={`Chọn @${acc.username}`}
                            />
                          </td>
                          {/* Account name - Sticky Left */}
                          <td
                            style={getColumnStyle("username")}
                            className={`py-3.5 px-4 sticky left-10 z-10 ${rowBg} group-hover:bg-slate-50 dark:group-hover:bg-slate-800/90 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.03)] transition-colors overflow-hidden`}
                          >
                            <div className="min-w-0">
                              <Link
                                href={`/accounts/${acc.id}`}
                                className="font-bold text-slate-900 dark:text-white hover:text-pink-600 dark:hover:text-pink-400 flex items-center gap-1.5 transition-colors min-w-0"
                              >
                                <span className="truncate min-w-0" title={`@${acc.username}`}>@{acc.username}</span>
                                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              </Link>
                              {acc.bannedReason && (
                                <div className="text-[10px] text-rose-500 dark:text-rose-400 truncate mt-0.5" title={acc.bannedReason}>
                                  ⚠ {acc.bannedReason}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Separate Online Column */}
                          <td style={getColumnStyle("isOnline")} className="py-3.5 px-4 text-center overflow-hidden">
                            <OnlineOfflineBadge isOnline={acc.isOnline} size="sm" />
                          </td>

                          {/* Country */}
                          <td style={getColumnStyle("country")} className="py-3.5 px-4 overflow-hidden">
                            <div className="truncate">{getCountryBadge(acc.country)}</div>
                          </td>

                          {/* Status */}
                          <td style={getColumnStyle("status")} className="py-3.5 px-4 overflow-hidden">
                            {getStatusBadge(acc.status)}
                          </td>

                          {/* GPM Profile Name */}
                          <td style={getColumnStyle("gpmProfileName")} className="py-3.5 px-4 overflow-hidden">
                            <span
                              className="inline-block max-w-full text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium truncate align-middle"
                              title={acc.gpmProfileName || undefined}
                            >
                              {acc.gpmProfileName || "--"}
                            </span>
                          </td>

                          {/* GPM Group */}
                          <td style={getColumnStyle("gpmGroup")} className="py-3.5 px-4 overflow-hidden">
                            <span className="inline-block max-w-full text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium truncate align-middle" title={acc.groupName || undefined}>
                              {acc.groupName || "--"}
                            </span>
                          </td>

                          {/* GPM Profile ID */}
                          <td style={getColumnStyle("gpmProfileId")} className="py-3.5 px-4 overflow-hidden">
                            {acc.gpmProfileId ? (
                              <div className="flex items-center gap-1.5 h-7.5 max-w-full min-w-0 bg-cyan-50/80 dark:bg-cyan-950/50 border border-cyan-200/60 dark:border-cyan-800/40 rounded-xl px-2.5 shadow-2xs">
                                <span
                                  className="font-mono text-xs font-semibold text-cyan-700 dark:text-cyan-300 min-w-0 flex-1 truncate"
                                  title={acc.gpmProfileId}
                                >
                                  {acc.gpmProfileId}
                                </span>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => startGpmMutation.mutate({ gpmProfileId: acc.gpmProfileId })}
                                      disabled={startGpmMutation.isPending}
                                      className="shrink-0 p-1 text-cyan-700 hover:text-cyan-900 dark:text-cyan-300 hover:bg-cyan-100/60 dark:hover:bg-cyan-900/60 rounded-md transition-colors cursor-pointer"
                                      aria-label="Mở GPM"
                                    >
                                      <Play className={`w-3 h-3 ${startGpmMutation.isPending ? "animate-pulse text-pink-500" : ""}`} />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Mở profile GPMLogin</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        navigator.clipboard.writeText(acc.gpmProfileId);
                                        setCopiedGpmId(acc.id);
                                        setTimeout(() => setCopiedGpmId((prev) => (prev === acc.id ? null : prev)), 2000);
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

                          {/* Alerts */}
                          <td style={getColumnStyle("alerts")} className="py-3.5 px-4 overflow-hidden">
                            {(() => {
                              const punishedVideos = getPunishedVideos30d(acc);
                              const isBannedFromCreator =
                                acc.status === "BANNED" ||
                                Boolean(acc.bannedReason) ||
                                ((acc.metadata as any)?.creatorRewardsMissing === true) ||
                                ((acc.metadata as any)?.creatorRewardsStatus === "BANNED") ||
                                acc.alerts?.some((al: any) => al.alertType === "PROGRAM_DISQUALIFIED");

                              // Case 1: Banned / Removed from Creator Program
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
                                    <PopoverContent align="start" className="w-96 p-0 rounded-2xl shadow-2xl border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-900 overflow-hidden z-50 text-xs">
                                      <div className="p-3.5 border-b border-rose-200 dark:border-rose-900/40 flex items-start gap-2.5 bg-white dark:bg-slate-900">
                                        <div className="p-2 bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl shrink-0">
                                          <XCircle className="w-5 h-5" />
                                        </div>
                                        <div>
                                          <h4 className="font-bold text-rose-900 dark:text-rose-200 text-sm">Bị loại khỏi Creator Rewards</h4>
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
                                              {punishedVideos.map((v: any, vIdx: number) => (
                                                <div key={vIdx} className="p-2 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/30 flex items-start gap-2">
                                                  <div className="w-10 h-12 rounded-lg bg-slate-200 dark:bg-slate-800 overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700">
                                                    {v.coverUrl || v.cover ? (
                                                      <img src={v.coverUrl || v.cover} alt={v.title || "Cover"} className="w-full h-full object-cover" />
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
                                                      {v.postDate && <span className="text-[10px] text-slate-400">{v.postDate}</span>}
                                                      <span className="text-[10px] font-bold text-rose-500">Bị phạt</span>
                                                    </div>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                                          <Link href={`/accounts/${acc.id}?tab=rewards`} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline">
                                            <span>Xem chi tiết tài khoản</span>
                                            <ExternalLink className="w-3 h-3" />
                                          </Link>
                                        </div>
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                );
                              }

                              // Case 2: Punished Videos (Strike Warning)
                              if (punishedVideos.length > 0) {
                                return <StrikeWarningPopover account={acc} punishedVideos={punishedVideos} />;
                              }

                              // Case 3: Other alerts
                              if (acc.alerts && acc.alerts.length > 0) {
                                return (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50 cursor-pointer">
                                        <AlertTriangle className="w-3 h-3" />
                                        <span>{acc.alerts.length} cảnh báo</span>
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

                          {/* Views */}
                          <td style={getColumnStyle("totalViews")} className="py-3.5 px-4 font-bold text-slate-900 dark:text-white overflow-hidden">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help border-b border-dotted border-slate-400/50 truncate inline-block max-w-full align-bottom">
                                  {Number(acc.totalViews || 0).toLocaleString()}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs p-2.5 space-y-1 bg-slate-900 text-white border-slate-800 shadow-xl">
                                {(() => {
                                  const p = getAccountViewsPeriods(acc as any);
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
                                })()}
                              </TooltipContent>
                            </Tooltip>
                          </td>

                          {/* Followers */}
                          <td style={getColumnStyle("totalFollowers")} className="py-3.5 px-4 text-slate-700 dark:text-slate-300 overflow-hidden">
                            <span className="truncate block">{Number(acc.totalFollowers || 0).toLocaleString()}</span>
                          </td>

                          {/* Videos */}
                          <td style={getColumnStyle("totalVideos")} className="py-3.5 px-4 text-slate-700 dark:text-slate-300 overflow-hidden">
                            <span className="truncate block">{Number(acc.totalVideos || 0).toLocaleString()}</span>
                          </td>

                          {/* Revenue */}
                          <td style={getColumnStyle("totalRevenue")} className="py-3.5 px-4 font-bold text-emerald-600 dark:text-emerald-400 overflow-hidden">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help border-b border-dotted border-emerald-500/40 truncate inline-block max-w-full align-bottom">
                                  {formatAmount(
                                    Number(acc.displayRevenue ?? acc.totalRevenue ?? 0),
                                    (acc as any).country
                                  )}
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
                                        <span className="font-semibold text-cyan-300">
                                          {formatAmount(p.revenue7d, (acc as any).country)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between gap-4 text-[11px]">
                                        <span className="text-slate-400">28 ngày gần nhất:</span>
                                        <span className="font-semibold text-purple-300">
                                          {formatAmount(p.revenue28d, (acc as any).country)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between gap-4 text-[11px]">
                                        <span className="text-slate-400">Tháng này:</span>
                                        <span className="font-semibold text-pink-400">
                                          {formatAmount(p.revenueThisMonth, (acc as any).country)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between gap-4 text-[11px]">
                                        <span className="text-slate-400">60 ngày gần nhất:</span>
                                        <span className="font-semibold text-indigo-300">
                                          {formatAmount(p.revenue60d, (acc as any).country)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between gap-4 text-[11px]">
                                        <span className="text-slate-400">365 ngày gần nhất:</span>
                                        <span className="font-semibold text-amber-300">
                                          {formatAmount(p.revenue365d, (acc as any).country)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between gap-4 text-[11px] pt-1 border-t border-slate-800 font-bold">
                                        <span className="text-slate-300">Toàn bộ (All-time):</span>
                                        <span className="text-emerald-400">
                                          {formatAmount(p.totalRevenue, (acc as any).country)}
                                        </span>
                                      </div>
                                    </>
                                  );
                                })()}
                              </TooltipContent>
                            </Tooltip>
                          </td>

                          {/* Last Synced */}
                          <td style={getColumnStyle("lastSyncedAt")} className="py-3.5 px-4 text-xs text-slate-500 dark:text-slate-400 overflow-hidden">
                            <span className="truncate block">
                              {acc.lastSyncedAt
                                ? new Date(acc.lastSyncedAt).toLocaleString("vi-VN", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  day: "2-digit",
                                  month: "2-digit",
                                })
                                : "Chưa sync"}
                            </span>
                          </td>

                          {/* Action Buttons - Sticky Right */}
                          <td
                            style={getColumnStyle("actions")}
                            className={`py-3.5 px-4 text-center sticky right-0 z-10 ${rowBg} group-hover:bg-slate-50 dark:group-hover:bg-slate-800/90 border-l border-slate-200 dark:border-slate-800 shadow-[-2px_0_5px_rgba(0,0,0,0.03)] whitespace-nowrap transition-colors`}
                          >
                            <div className="flex items-center justify-center">
                              <DropdownMenu>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        type="button"
                                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                        aria-label="Thao tác"
                                      >
                                        <MoreHorizontal className="w-4 h-4" />
                                      </button>
                                    </DropdownMenuTrigger>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Tùy chọn thao tác</TooltipContent>
                                </Tooltip>
                                <DropdownMenuContent
                                  align="end"
                                  className="w-48 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl p-1.5 shadow-xl"
                                >
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
                                  {acc.gpmProfileId && (
                                    <DropdownMenuItem
                                      onClick={() => startGpmMutation.mutate({ gpmProfileId: acc.gpmProfileId })}
                                      disabled={startGpmMutation.isPending}
                                      className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                                    >
                                      <Play className="w-3.5 h-3.5 text-cyan-500 fill-current" />
                                      <span>Mở Profile GPM</span>
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem asChild>
                                    <Link
                                      href={`/accounts/${acc.id}?tab=logs`}
                                      className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                                    >
                                      <History className="w-3.5 h-3.5 text-slate-400" />
                                      <span>Lịch sử hoạt động</span>
                                    </Link>
                                  </DropdownMenuItem>
                                  {isAdmin && (
                                    <>
                                      <DropdownMenuSeparator className="my-1 bg-slate-100 dark:bg-slate-800" />
                                      <DropdownMenuItem
                                        onClick={async () => {
                                          const ok = await confirm({
                                            title: "Xác nhận xóa tài khoản",
                                            description: `Bạn có chắc chắn muốn xóa @${acc.username}?`,
                                            confirmLabel: "Xác nhận xóa",
                                            variant: "danger",
                                          });
                                          if (ok) {
                                            bulkDeleteMutation.mutate({ ids: [acc.id] });
                                          }
                                        }}
                                        className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                        <span>Xóa tài khoản</span>
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Daily Checklists History */}
      {activeTab === "checklists" && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-500" />
                Lịch Sử Chấm Công 30 Ngày Gần Nhất
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Điểm ngày công tự động chốt theo mốc 10:00 AM mỗi ngày
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 block font-semibold">Tổng công tháng này</span>
              <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                {Number(stats.monthlyWorkdays)} Ngày Công
              </span>
            </div>
          </div>

          {dailyChecklists.length === 0 ? (
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center space-y-3">
              <Calendar className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Chưa có dữ liệu chấm công
              </h3>
              <p className="text-xs text-slate-400">
                Nhân viên này chưa có bản ghi checklist nào được tạo.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden relative z-0 isolate">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-slate-600 dark:text-slate-300 font-semibold text-xs border-b border-slate-200 dark:border-slate-800 normal-case">
                    <tr>
                      <th className="py-3.5 px-4 sticky left-0 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.03)] min-w-[160px] whitespace-nowrap">
                        Ngày làm việc
                      </th>
                      <th className="py-3.5 px-4 whitespace-nowrap min-w-[130px]">Số acc phụ trách</th>
                      <th className="py-3.5 px-4 whitespace-nowrap min-w-[150px]">Tài khoản hoàn thành</th>
                      <th className="py-3.5 px-4 whitespace-nowrap min-w-[150px]">Tỷ lệ hoàn thành (%)</th>
                      <th className="py-3.5 px-4 whitespace-nowrap min-w-[140px]">Điểm ngày công chốt</th>
                      <th className="py-3.5 px-4 whitespace-nowrap min-w-[160px]">Trạng thái chốt 10:00 AM</th>
                      <th className="py-3.5 px-4 text-center whitespace-nowrap sticky right-0 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs border-l border-slate-200 dark:border-slate-800 shadow-[-2px_0_5px_rgba(0,0,0,0.03)] min-w-[130px]">
                        Chi tiết
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {dailyChecklists.map((c: any) => {
                      const score = Number(c.workdayScore || 0);
                      const rate = Number(c.completionRate || 0);
                      const dateFormatted = new Date(c.date).toLocaleDateString("vi-VN", {
                        weekday: "short",
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      });

                      return (
                        <tr
                          key={c.id}
                          className="group hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          {/* Sticky Left: Ngày làm việc */}
                          <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white sticky left-0 z-10 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/90 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.03)] min-w-[160px] whitespace-nowrap transition-colors">
                            {dateFormatted}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap min-w-[130px]">
                            {c.totalAssigned} accounts
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap min-w-[150px]">
                            {c.completedCount} / {c.totalAssigned}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap min-w-[150px]">
                            <div className="flex items-center gap-2">
                              <span className="font-bold">{rate}%</span>
                              <div className="w-16 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${rate >= 85
                                      ? "bg-emerald-500"
                                      : rate >= 50
                                        ? "bg-amber-500"
                                        : "bg-rose-500"
                                    }`}
                                  style={{ width: `${Math.min(rate, 100)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap min-w-[140px]">
                            <span
                              className={`px-2.5 py-1 rounded-lg text-xs font-black ${score >= 1.0
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                                  : score >= 0.5
                                    ? "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                                    : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                                }`}
                            >
                              {score} Ngày Công
                            </span>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap min-w-[160px]">
                            {c.isLocked ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                                <Clock className="w-3.5 h-3.5 text-slate-400" /> Đã chốt (Locked)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                <Flame className="w-3.5 h-3.5 text-emerald-500" /> Đang chạy (Open)
                              </span>
                            )}
                          </td>

                          {/* Sticky Right: Chi tiết */}
                          <td className="py-3.5 px-4 text-center sticky right-0 z-10 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/90 border-l border-slate-200 dark:border-slate-800 shadow-[-2px_0_5px_rgba(0,0,0,0.03)] min-w-[130px] whitespace-nowrap transition-colors">
                            <Link
                              href={`/checklist?date=${new Date(c.date).toISOString().split("T")[0]}`}
                              className="inline-flex items-center gap-1 text-xs font-bold text-pink-600 dark:text-pink-400 hover:underline"
                            >
                              <span>Mở Checklist</span>
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: Yêu cầu (machine change + extension access) */}
      {activeTab === "requests" && canViewUserRequests && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Inbox className="w-4 h-4 text-amber-500" />
              Danh sách yêu cầu
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Đổi máy tính và kích hoạt Extension của {user.fullName}
            </p>
          </div>

          {loadingRequests ? (
            <DataTableSkeleton columns={3} rows={3} />
          ) : (() => {
            const machineItems = (userRequests?.machineChangeRequests || []).map((req: any) => ({
              kind: "MACHINE_CHANGE" as const,
              id: req.id,
              createdAt: req.createdAt,
              raw: req,
            }));
            const extensionItems = (userRequests?.extensionAccessRequests || []).map((req: any) => ({
              kind: "EXTENSION_ACCESS" as const,
              id: req.id,
              createdAt: req.createdAt,
              raw: req,
            }));
            const all = [...machineItems, ...extensionItems].sort(
              (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
            );
            const canDelete =
              isAdmin || session?.user?.id === userId;

            if (all.length === 0) {
              return (
                <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center space-y-3">
                  <Inbox className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    Không có yêu cầu nào
                  </h3>
                  <p className="text-xs text-slate-400">
                    Nhân sự này chưa gửi yêu cầu đổi máy hoặc kích hoạt Extension.
                  </p>
                </div>
              );
            }

            const statusBadge = (status: string) => {
              if (status === "APPROVED") {
                return (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
                    Đã duyệt
                  </span>
                );
              }
              if (status === "REJECTED") {
                return (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    Từ chối
                  </span>
                );
              }
              return (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
                  Đang chờ
                </span>
              );
            };

            return (
              <div className="space-y-2.5">
                {all.map((item) => {
                  if (item.kind === "MACHINE_CHANGE") {
                    const req = item.raw;
                    return (
                      <div
                        key={`m-${req.id}`}
                        className="rounded-2xl border border-amber-200/80 dark:border-amber-900/40 bg-white dark:bg-slate-900/80 px-4 py-3.5 shadow-sm space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                              <Monitor className="w-4.5 h-4.5" />
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
                                Đổi máy
                              </span>
                              {statusBadge(req.status)}
                            </div>
                          </div>
                          {canDelete && (
                            <button
                              type="button"
                              disabled={deleteMachineRequestMutation.isPending}
                              onClick={async () => {
                                const ok = await confirm({
                                  title: "Xóa yêu cầu đổi máy",
                                  description: "Xóa yêu cầu này khỏi danh sách?",
                                  confirmLabel: "Xóa yêu cầu",
                                  variant: "danger",
                                });
                                if (ok) deleteMachineRequestMutation.mutate({ requestId: req.id });
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer shrink-0"
                              aria-label="Xóa yêu cầu"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 min-w-0">
                            {user.avatar ? (
                              <img
                                src={user.avatar}
                                alt={user.fullName}
                                className="w-6 h-6 rounded-full object-cover shrink-0"
                              />
                            ) : (
                              <span className="w-6 h-6 rounded-full bg-gradient-to-tr from-pink-500 to-rose-500 text-white text-[9px] font-bold flex items-center justify-center shrink-0 uppercase select-none">
                                {(user.fullName || "U").slice(0, 2)}
                              </span>
                            )}
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                {user.fullName}
                              </div>
                              {user.email && (
                                <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                  {user.email}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                            {req.fromMachineName || req.fromMachineId}
                            {req.fromOsUsername ? ` · ${req.fromOsUsername}` : ""}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-300">{req.reason}</div>
                          {req.createdAt && (
                            <div className="text-[10px] text-slate-400">
                              {new Date(req.createdAt).toLocaleString("vi-VN")}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }

                  const req = item.raw;
                  return (
                    <div
                      key={`e-${req.id}`}
                      className="rounded-2xl border border-rose-200/80 dark:border-rose-900/40 bg-white dark:bg-slate-900/80 px-4 py-3.5 shadow-sm space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                            <KeyRound className="w-4.5 h-4.5" />
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50">
                              Kích hoạt Extension
                            </span>
                            {statusBadge(req.status)}
                          </div>
                        </div>
                        {canDelete && (
                          <button
                            type="button"
                            disabled={deleteExtensionRequestMutation.isPending}
                            onClick={async () => {
                              const ok = await confirm({
                                title: "Xóa yêu cầu kích hoạt",
                                description: "Xóa yêu cầu này khỏi danh sách?",
                                confirmLabel: "Xóa yêu cầu",
                                variant: "danger",
                              });
                              if (ok) deleteExtensionRequestMutation.mutate({ requestId: req.id });
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer shrink-0"
                            aria-label="Xóa yêu cầu"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 min-w-0">
                          {user.avatar ? (
                            <img
                              src={user.avatar}
                              alt={user.fullName}
                              className="w-6 h-6 rounded-full object-cover shrink-0"
                            />
                          ) : (
                            <span className="w-6 h-6 rounded-full bg-gradient-to-tr from-pink-500 to-rose-500 text-white text-[9px] font-bold flex items-center justify-center shrink-0 uppercase select-none">
                              {(user.fullName || "U").slice(0, 2)}
                            </span>
                          )}
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {user.fullName}
                            </div>
                            {user.email && (
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                {user.email}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-300">
                          {req.reason || "Cần Admin mở khóa & cấp lại Personal Token."}
                        </div>
                        {req.createdAt && (
                          <div className="text-[10px] text-slate-400">
                            {new Date(req.createdAt).toLocaleString("vi-VN")}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* TAB 3: Profile Details & System Roles */}
      {activeTab === "profile" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-pink-500" />
              Thông Tin Định Danh Nhân Sự
            </h3>
            <div className="space-y-3 text-xs divide-y divide-slate-100 dark:divide-slate-800/80">
              <div className="pt-2 flex justify-between">
                <span className="text-slate-500">Mã Nhân Sự (ID):</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{user.id}</span>
              </div>
              <div className="pt-2 flex justify-between">
                <span className="text-slate-500">Họ và Tên:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{user.fullName}</span>
              </div>
              <div className="pt-2 flex justify-between">
                <span className="text-slate-500">Tên Đăng Nhập:</span>
                <span className="font-mono text-slate-800 dark:text-slate-200">@{user.username}</span>
              </div>
              <div className="pt-2 flex justify-between">
                <span className="text-slate-500">Địa Chỉ Email:</span>
                <span className="text-slate-800 dark:text-slate-200">{user.email}</span>
              </div>
              <div className="pt-2 flex justify-between">
                <span className="text-slate-500">Số Điện Thoại:</span>
                <span className="text-slate-800 dark:text-slate-200">{user.phone || "Chưa cập nhật"}</span>
              </div>
              <div className="pt-2 flex justify-between">
                <span className="text-slate-500">Ngày Tạo Tài Khoản:</span>
                <span className="text-slate-800 dark:text-slate-200">{new Date(user.createdAt).toLocaleString("vi-VN")}</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-purple-500" />
              Phân Quyền & Vận Hành Fleet
            </h3>
            <div className="space-y-3 text-xs divide-y divide-slate-100 dark:divide-slate-800/80">
              <div className="pt-2 flex justify-between items-center">
                <span className="text-slate-500">Cấp Bậc (Role):</span>
                <span>{getRoleBadge(user.role)}</span>
              </div>
              <div className="pt-2 flex justify-between items-center">
                <span className="text-slate-500">Trạng Thái Hệ Thống:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {user.isActive ? "Được phép đăng nhập" : "Đã bị khóa"}
                </span>
              </div>
              <div className="pt-2 flex justify-between">
                <span className="text-slate-500">Quyền Chấm Công:</span>
                <span className="text-slate-800 dark:text-slate-200">
                  {user.role === "STAFF" ? "Tự chấm công dàn account được giao" : "Quản lý & chốt công toàn đội"}
                </span>
              </div>
              <div className="pt-2 flex justify-between">
                <span className="text-slate-500">Quyền GPM-Login:</span>
                <span className="text-slate-800 dark:text-slate-200">Mở và đồng bộ các profile được phân quyền</span>
              </div>
            </div>
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
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            Bỏ chọn
          </button>
          <button
            type="button"
            onClick={handleBulkSync}
            disabled={syncMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            <span>Đồng bộ</span>
          </button>
          {isLeadOrAdmin && (
            <button
              type="button"
              onClick={() => setIsBulkStatusOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-all cursor-pointer"
            >
              <span>Đổi trạng thái</span>
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={async () => {
                const ok = await confirm({
                  title: "Xóa hàng loạt",
                  description: `Xóa ${selectedIds.size} tài khoản đã chọn? Thao tác không thể hoàn tác.`,
                  confirmLabel: `Xác nhận xóa (${selectedIds.size})`,
                  variant: "danger",
                });
                if (ok) {
                  bulkDeleteMutation.mutate({ ids: Array.from(selectedIds) });
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa đã chọn ({selectedIds.size})</span>
            </button>
          )}
        </div>
      )}

      {/* Bulk status dialog */}
      <Dialog open={isBulkStatusOpen} onOpenChange={setIsBulkStatusOpen}>
        <DialogContent className="sm:max-w-sm rounded-3xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Đổi trạng thái hàng loạt</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-slate-500">Áp dụng cho {selectedIds.size} tài khoản đã chọn.</p>
            <Select value={bulkStatusVal} onValueChange={setBulkStatusVal}>
              <SelectTrigger className="w-full h-10 rounded-xl text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="ACTIVE" className="text-xs cursor-pointer">Hoạt động</SelectItem>
                <SelectItem value="WARMING" className="text-xs cursor-pointer">Nuôi nick</SelectItem>
                <SelectItem value="RESTRICTED" className="text-xs cursor-pointer">Hạn chế</SelectItem>
                <SelectItem value="BANNED" className="text-xs cursor-pointer">Banned</SelectItem>
                <SelectItem value="STOPPED" className="text-xs cursor-pointer">Ngừng</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setIsBulkStatusOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={bulkUpdateStatusMutation.isPending}
              onClick={() =>
                bulkUpdateStatusMutation.mutate(
                  { ids: Array.from(selectedIds), status: bulkStatusVal as any },
                  { onSuccess: () => setIsBulkStatusOpen(false) }
                )
              }
              className="px-4 py-2 text-xs font-bold bg-pink-600 text-white rounded-xl hover:bg-pink-500 disabled:opacity-50 cursor-pointer"
            >
              {bulkUpdateStatusMutation.isPending ? "Đang cập nhật..." : "Áp dụng"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialog}

      {/* Role change dialog */}
      <Dialog open={isRoleModalOpen} onOpenChange={setIsRoleModalOpen}>
        <DialogContent className="sm:max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
              Đổi vai trò
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {userDetail?.user?.fullName || userDetail?.user?.username}
            </p>
            <Select value={editRole} onValueChange={(v: any) => setEditRole(v)}>
              <SelectTrigger className="w-full h-9 text-xs rounded-xl cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="STAFF" className="text-xs cursor-pointer">Nhân Viên (Staff)</SelectItem>
                <SelectItem value="LEAD" className="text-xs cursor-pointer">Trưởng Nhóm (Lead)</SelectItem>
                <SelectItem value="ADMIN" className="text-xs cursor-pointer">Quản Trị Viên (Admin)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setIsRoleModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={updateRoleMutation.isPending}
              onClick={() => {
                updateRoleMutation.mutate(
                  { userId, role: editRole },
                  { onSuccess: () => setIsRoleModalOpen(false) }
                );
              }}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-pink-600 hover:bg-pink-500 text-white cursor-pointer disabled:opacity-50"
            >
              {updateRoleMutation.isPending ? "Đang lưu..." : "Lưu"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extension token modal */}
      <Dialog open={isTokenModalOpen} onOpenChange={setIsTokenModalOpen}>
        <DialogContent className="sm:max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-500" />
              Quản Lý Extension Token
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {userDetail?.user?.fullName || userDetail?.user?.username} ({userDetail?.user?.email})
            </p>
            <div className="relative flex items-center">
              <input
                type={isTokenRevealed ? "text" : "password"}
                readOnly
                value={tokenLoading ? "Đang tải..." : tokenData?.token || ""}
                placeholder={tokenData?.accessEnabled === false ? "Quyền đã bị khóa" : "Chưa có token"}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono pr-20"
              />
              <div className="absolute right-2 flex items-center gap-1">
                <button
                  type="button"
                  disabled={!tokenData?.token}
                  onClick={() => setIsTokenRevealed(!isTokenRevealed)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer disabled:opacity-40"
                >
                  {isTokenRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  disabled={!tokenData?.token}
                  onClick={() => {
                    if (tokenData?.token) {
                      navigator.clipboard.writeText(tokenData.token);
                      setCopiedExtensionToken(true);
                      setTimeout(() => setCopiedExtensionToken(false), 2000);
                    }
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer disabled:opacity-40"
                >
                  {copiedExtensionToken ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <FileText className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                disabled={regenerateTokenMutation.isPending}
                onClick={async () => {
                  const unlocking = tokenData?.accessEnabled === false;
                  const ok = await confirm({
                    title: unlocking ? "Mở khóa & cấp Token" : "Cấp lại Token mới",
                    description: unlocking
                      ? "Mở lại quyền và cấp Token mới?"
                      : "Thu hồi và tạo Token mới?",
                    confirmLabel: unlocking ? "Mở khóa & Cấp Token" : "Cấp lại Token",
                    variant: "amber",
                  });
                  if (ok) regenerateTokenMutation.mutate({ userId });
                }}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 cursor-pointer disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${regenerateTokenMutation.isPending ? "animate-spin" : ""}`} />
                {tokenData?.accessEnabled === false ? "Mở khóa & Cấp Token" : "Cấp lại Token mới"}
              </button>
              {tokenData?.accessEnabled !== false && (
                <button
                  type="button"
                  disabled={revokeTokenMutation.isPending}
                  onClick={async () => {
                    const ok = await confirm({
                      title: "Vô hiệu hóa Extension",
                      description: "Vô hiệu hóa hoàn toàn quyền Extension? Nhân sự sẽ không thể tự tạo lại token.",
                      confirmLabel: "Vô hiệu hóa",
                      variant: "danger",
                      icon: "ban",
                    });
                    if (ok) revokeTokenMutation.mutate({ userId });
                  }}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 cursor-pointer disabled:opacity-60"
                >
                  <Ban className="w-3.5 h-3.5" />
                  Vô hiệu hóa
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (tokenData?.accessEnabled === false) return;
                  downloadPackage(
                    `/api/extension/download?userId=${userId}`,
                    `TikTokFlow-Extension-${userId}.zip`
                  );
                }}
                disabled={tokenData?.accessEnabled === false}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${tokenData?.accessEnabled === false
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : "text-white bg-gradient-to-r from-pink-600 to-rose-600 cursor-pointer active:scale-95"
                  }`}
              >
                <Download className="w-3.5 h-3.5" />
                Tải Extension hộ
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function UserDetailPage() {
  return (
    <Suspense fallback={<UserDetailSkeleton />}>
      <UserDetailPageContent />
    </Suspense>
  );
}
