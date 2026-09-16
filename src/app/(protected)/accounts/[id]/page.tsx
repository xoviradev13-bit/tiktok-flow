"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUrlParams } from "@/hooks/useUrlState";
import Link from "next/link";
import {
  ArrowLeft,
  DollarSign,
  Eye,
  Users,
  Video,
  Flame,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Play,
  Square,
  ExternalLink,
  Shield,
  Calendar,
  Sparkles,
  TrendingUp,
  MessageSquare,
  FileText,
  Activity,
  Award,
  Layers,
  Globe,
  UserCheck,
  Send,
  Plus,
  Trash2,
  Check,
  ChevronRight,
  BarChart3,
  Sliders,
  Lock,
  Unlock,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
} from "recharts";
import { trpc } from "@/lib/trpc";
import { launchGpmProfile } from "@/lib/gpm-client-bridge";
import { OnlineOfflineBadge } from "@/components/ui/status-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AccountDetailSkeleton } from "@/components/skeletons/PageSkeletons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { format, subDays } from "date-fns";
import { useCurrency } from "@/contexts/CurrencyContext";

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
  taiwan: "TW", tw: "TW", "đài loan": "TW",
  hongkong: "HK", "hong kong": "HK", hk: "HK",
  cambodia: "KH", kh: "KH", "campuchia": "KH",
  myanmar: "MM", mm: "MM",
  laos: "LA", la: "LA", "lào": "LA",
  belgium: "BE", be: "BE", "bỉ": "BE",
  netherlands: "NL", nl: "NL", "hà lan": "NL",
  spain: "ES", es: "ES", "tây ban nha": "ES",
  italy: "IT", it: "IT", "ý": "IT",
  portugal: "PT", pt: "PT", "bồ đào nha": "PT",
  poland: "PL", pl: "PL", "ba lan": "PL",
  sweden: "SE", se: "SE", "thụy điển": "SE",
  switzerland: "CH", ch: "CH", "thụy sĩ": "CH",
  austria: "AT", at: "AT", "áo": "AT",
  ireland: "IE", ie: "IE",
  russia: "RU", ru: "RU", "nga": "RU",
  turkey: "TR", tr: "TR", "thổ nhĩ kỳ": "TR",
  canada: "CA", ca: "CA",
  australia: "AU", au: "AU", "úc": "AU",
  brazil: "BR", br: "BR",
  mexico: "MX", mx: "MX",
  india: "IN", in: "IN", "ấn độ": "IN",
  pakistan: "PK", pk: "PK",
  bangladesh: "BD", bd: "BD",
  egypt: "EG", eg: "EG", "ai cập": "EG",
};

const normalizeCountry = (country?: string | null): string => {
  if (!country) return "US";
  const trimmed = country.trim().toLowerCase();
  if (COUNTRY_MAP[trimmed]) return COUNTRY_MAP[trimmed];
  if (trimmed === "unknown") return "US";
  return country.trim().toUpperCase();
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

function AccountDetailPageContent() {
  const { data: session } = useSession();
  const isLeadOrAdmin = (session?.user as any)?.role === "ADMIN" || (session?.user as any)?.role === "LEAD";

  const params = useParams();
  const router = useRouter();
  const accountId = (params?.id as string) || "";

  // SaaS URL Query State Synchronization
  const { searchParams, updateUrlParams } = useUrlParams();

  const validTabs = ["overview", "history", "logs", "alerts"] as const;
  const paramTab = searchParams?.get("tab") as any;
  const initialTab = validTabs.includes(paramTab) ? paramTab : "overview";
  const [activeTab, setActiveTab] = useState<"overview" | "history" | "logs" | "alerts">(initialTab);

  const validRanges = ["7d", "28d", "60d", "365d", "all", "custom"] as const;
  const paramRange = (searchParams?.get("range") || "28d") as any;
  const initialRange = validRanges.includes(paramRange) ? paramRange : "28d";
  const [selectedTimeRange, setSelectedTimeRange] = useState<"7d" | "28d" | "60d" | "365d" | "all" | "custom">(initialRange);

  const initialFrom = searchParams?.get("from") || "";
  const initialTo = searchParams?.get("to") || "";
  const [customStartDate, setCustomStartDate] = useState<string>(initialFrom);
  const [customEndDate, setCustomEndDate] = useState<string>(initialTo);

  const [isRangePickerOpen, setIsRangePickerOpen] = useState(false);
  const [rangeSelection, setRangeSelection] = useState<DateRange | undefined>(() => {
    if (initialFrom && initialTo) {
      return { from: new Date(initialFrom + "T00:00:00"), to: new Date(initialTo + "T00:00:00") };
    }
    const to = new Date();
    const from = subDays(to, 27);
    return { from, to };
  });

  // Auto sync active state to URL
  useEffect(() => {
    updateUrlParams(
      {
        tab: activeTab,
        range: selectedTimeRange,
        from: customStartDate,
        to: customEndDate,
      },
      {
        range: "28d",
        from: "",
        to: "",
      }
    );
  }, [activeTab, selectedTimeRange, customStartDate, customEndDate, updateUrlParams]);

  // Separate time range filter state for "Biểu Đồ & Lịch Sử Doanh Thu" tab
  const [historyTimeRange, setHistoryTimeRange] = useState<"7d" | "28d" | "60d" | "365d" | "all" | "custom">("28d");
  const [historyStartDate, setHistoryStartDate] = useState<string>("");
  const [historyEndDate, setHistoryEndDate] = useState<string>("");
  const [isHistoryRangePickerOpen, setIsHistoryRangePickerOpen] = useState(false);
  const [historyRangeSelection, setHistoryRangeSelection] = useState<DateRange | undefined>(() => {
    const to = new Date();
    const from = subDays(to, 27);
    return { from, to };
  });

  // Modals & Action States
  const [isAddRevenueOpen, setIsAddRevenueOpen] = useState(false);
  const [newRevDate, setNewRevDate] = useState(new Date().toISOString().split("T")[0]);
  const [newRevViews, setNewRevViews] = useState("");
  const [newRevRpm, setNewRevRpm] = useState("");
  const [newRevAmount, setNewRevAmount] = useState("");
  const [newRevSource, setNewRevSource] = useState("CREATOR_REWARDS");

  // Reassignment & Handover Modal States
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [selectedTransferUserId, setSelectedTransferUserId] = useState<string>("");
  const [isLockOnTransfer, setIsLockOnTransfer] = useState(false);

  const [newLogMessage, setNewLogMessage] = useState("");
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  const utils = trpc.useUtils();

  const showToast = (text: string, type: "success" | "error" | "info" = "success") => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const toggleLockMutation = trpc.accounts.toggleLockAssignment.useMutation({
    onSuccess: (data) => {
      showToast(
        data.isAssignmentLocked
          ? "🔒 Đã khóa phân công tài khoản này!"
          : "🔓 Đã mở khóa phân công, cho phép đổi ca tự do!",
        "success"
      );
      utils.accounts.getById.invalidate({ id: accountId });
      utils.accounts.list.invalidate();
    },
    onError: (err) => showToast(err.message, "error"),
  });

  // 1. Fetch Account Details
  const {
    data: account,
    isLoading,
    isError,
    error,
    refetch,
  } = trpc.accounts.getById.useQuery(
    { id: accountId },
    { enabled: !!accountId }
  );

  // 2. Fetch staff list for reassignment
  const { data: staffList = [] } = trpc.user.listStaff.useQuery();

  // Mutations
  const updateMutation = trpc.accounts.update.useMutation({
    onSuccess: () => {
      showToast("Đã cập nhật thông tin tài khoản thành công!", "success");
      utils.accounts.getById.invalidate({ id: accountId });
      utils.accounts.list.invalidate();
    },
    onError: (err) => showToast(err.message || "Lỗi khi cập nhật", "error"),
  });

  const syncMutation = trpc.accounts.syncAccount.useMutation({
    onSuccess: (data) => {
      if (data?.queued) {
        showToast("Đã gửi lệnh đồng bộ vào hàng đợi cho Client Agent!", "success");
      } else {
        showToast("Đã làm mới thông tin tài khoản!", "success");
      }
      utils.accounts.getById.invalidate({ id: accountId });
      utils.accounts.list.invalidate();
    },
    onError: (err) => showToast(err.message || "Lỗi khi đồng bộ", "error"),
  });

  const { data: gpmStatus } = trpc.gpm.checkStatus.useQuery();
  const [startingGpm, setStartingGpm] = useState(false);

  const startGpmMutation = trpc.gpm.startProfile.useMutation();

  const handleStartGpm = async () => {
    if (!account?.gpmProfileId) return;
    const targetPort = (account as any).gpmPort || gpmStatus?.port || 9495;
    setStartingGpm(true);
    try {
      await launchGpmProfile(account.gpmProfileId, {
        port: targetPort,
        startMutation: startGpmMutation,
        onSuccess: (data) => {
          showToast(`🚀 Đã mở profile GPM (cổng ${data?.port || targetPort}) thành công!`, "success");
        },
        onError: (err) => {
          showToast(err.message || "Không thể mở profile GPM", "error");
        },
      });
    } catch (err: any) {
      showToast(err.message || "Không thể mở profile GPM", "error");
    } finally {
      setStartingGpm(false);
    }
  };

  const stopGpmMutation = trpc.gpm.stopProfile.useMutation({
    onSuccess: () => showToast("Đã đóng profile GPM!", "info"),
    onError: (err) => showToast(err.message || "Lỗi khi đóng profile GPM", "error"),
  });

  const resolveAlertMutation = trpc.accounts.resolveAlert.useMutation({
    onSuccess: () => {
      showToast("Đã giải quyết cảnh báo rủi ro!", "success");
      utils.accounts.getById.invalidate({ id: accountId });
    },
    onError: (err) => showToast(err.message || "Lỗi giải quyết cảnh báo", "error"),
  });

  const addLogMutation = trpc.accounts.addLog.useMutation({
    onSuccess: () => {
      setNewLogMessage("");
      showToast("Đã ghi nhật ký / ghi chú mới!", "success");
      utils.accounts.getById.invalidate({ id: accountId });
    },
    onError: (err) => showToast(err.message || "Lỗi ghi nhật ký", "error"),
  });

  const upsertRevenueMutation = trpc.revenue.upsert.useMutation({
    onSuccess: () => {
      setIsAddRevenueOpen(false);
      setNewRevViews("");
      setNewRevRpm("");
      setNewRevAmount("");
      showToast("Đã lưu bản ghi doanh thu!", "success");
      utils.accounts.getById.invalidate({ id: accountId });
      utils.revenue.getOverview.invalidate();
    },
    onError: (err) => showToast(err.message || "Lỗi lưu doanh thu", "error"),
  });

  // Country name helper
  const getCountryName = (country?: string) => {
    const code = (country || "US").toUpperCase();
    const map: Record<string, string> = {
      US: "United States",
      UK: "United Kingdom",
      GB: "United Kingdom",
      VN: "Việt Nam",
      DE: "Germany",
      FR: "France",
      TH: "Thailand",
      ID: "Indonesia",
      MY: "Malaysia",
      PH: "Philippines",
      SG: "Singapore",
      JP: "Japan",
      KR: "South Korea",
      CA: "Canada",
      AU: "Australia",
      BR: "Brazil",
      MX: "Mexico",
      ES: "Spain",
      IT: "Italy",
      NL: "Netherlands",
      PL: "Poland",
      RU: "Russia",
      TR: "Turkey",
    };
    return map[code] || code;
  };

  // Currency symbol helper
  const getCurrencySymbol = (country?: string) => {
    switch (country?.toUpperCase()) {
      case "UK":
        return "£";
      case "DE":
      case "FR":
        return "€";
      case "VN":
        return "₫";
      default:
        return "$";
    }
  };

  const { currency, formatAmount } = useCurrency();
  const nativeCurrencySymbol = getCurrencySymbol(account?.country);
  const currencySymbol = currency === "VND" ? "₫" : "$";

  // Status configuration helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle className="w-3.5 h-3.5" /> Hoạt Động (Active)
          </span>
        );
      case "WARMING":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Flame className="w-3.5 h-3.5" /> Đang Nuôi (Warming)
          </span>
        );
      case "RESTRICTED":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
            <AlertTriangle className="w-3.5 h-3.5" /> Hạn Chế (Restricted)
          </span>
        );
      case "BANNED":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5" /> Bị Khóa (Banned)
          </span>
        );
      case "STOPPED":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
            <Clock className="w-3.5 h-3.5" /> Tạm Dừng (Stopped)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20">
            {status}
          </span>
        );
    }
  };

  // Unified Daily Revenue Records (Manual entries + TikTok Studio API)
  const allRevenueRecords = useMemo(() => {
    const records: Array<{
      id: string;
      date: string;
      sourceType: string;
      views: number;
      rpm: number;
      revenue: number;
      isAutomated: boolean;
      createdTime?: string;
    }> = [];

    const existingKeys = new Set<string>();

    if (account?.dailyRevenues && account.dailyRevenues.length > 0) {
      for (const rec of account.dailyRevenues) {
        const dStr = new Date(rec.date).toISOString().split("T")[0];
        existingKeys.add(dStr);
        records.push({
          id: rec.id,
          date: dStr,
          sourceType: rec.sourceType || "CREATOR_REWARDS",
          views: Number(rec.views || 0),
          rpm: Number(rec.rpm || 0),
          revenue: Number(rec.revenue || 0),
          isAutomated: false,
          createdTime: new Date(rec.createdAt).toLocaleTimeString("vi-VN"),
        });
      }
    }

    const breakdown = (account as any)?.analytics?.dailyBreakdown;
    if (Array.isArray(breakdown)) {
      for (const item of breakdown) {
        if (!item?.date) continue;
        const dStr = item.date;
        if (!existingKeys.has(dStr)) {
          existingKeys.add(dStr);
          const rev = Number(item.revenue || 0);
          const vw = Number(item.views || 0);
          const rpm = vw > 0 ? (rev * 1000) / vw : 0;
          records.push({
            id: `auto-${dStr}`,
            date: dStr,
            sourceType: "CREATOR_REWARDS",
            views: vw,
            rpm: Math.round(rpm * 100) / 100,
            revenue: rev,
            isAutomated: true,
            createdTime: "TikTok Studio API",
          });
        }
      }
    }

    // Sort chronologically ascending for charts
    records.sort((a, b) => a.date.localeCompare(b.date));
    return records;
  }, [account]);

  // Helper to filter records by time range
  const filterRecordsByRange = (
    records: typeof allRevenueRecords,
    range: "7d" | "28d" | "60d" | "365d" | "all" | "custom",
    startDate?: string,
    endDate?: string
  ) => {
    if (range === "custom") {
      if (startDate || endDate) {
        return records.filter((r) => {
          if (startDate && r.date < startDate) return false;
          if (endDate && r.date > endDate) return false;
          return true;
        });
      }
      return records;
    }
    if (range === "7d") return records.slice(-7);
    if (range === "28d") return records.slice(-28);
    if (range === "60d") return records.slice(-60);
    if (range === "365d") return records.slice(-365);
    return records; // "all"
  };

  // Format Daily Revenue Chart Data for Overview Tab (based on selectedTimeRange)
  const chartData = useMemo(() => {
    const filtered = filterRecordsByRange(
      allRevenueRecords,
      selectedTimeRange,
      customStartDate,
      customEndDate
    );
    return filtered.map((r) => {
      const d = new Date(r.date + "T00:00:00");
      const dateStr = d.toLocaleDateString("vi-VN", {
        month: "2-digit",
        day: "2-digit",
      });
      return {
        date: dateStr,
        views: r.views,
        revenue: r.revenue,
        rpm: r.rpm,
      };
    });
  }, [allRevenueRecords, selectedTimeRange, customStartDate, customEndDate]);

  // Format Daily Revenue Chart Data for History Tab (based on historyTimeRange)
  const historyChartData = useMemo(() => {
    const filtered = filterRecordsByRange(
      allRevenueRecords,
      historyTimeRange,
      historyStartDate,
      historyEndDate
    );
    return filtered.map((r) => {
      const d = new Date(r.date + "T00:00:00");
      const dateStr = d.toLocaleDateString("vi-VN", {
        month: "2-digit",
        day: "2-digit",
      });
      return {
        date: dateStr,
        views: r.views,
        revenue: r.revenue,
        rpm: r.rpm,
      };
    });
  }, [allRevenueRecords, historyTimeRange, historyStartDate, historyEndDate]);

  // Filtered rows for History Table (newest date first, based on historyTimeRange)
  const displayedHistoryRows = useMemo(() => {
    const filtered = filterRecordsByRange(
      allRevenueRecords,
      historyTimeRange,
      historyStartDate,
      historyEndDate
    );
    return [...filtered].sort((a, b) => b.date.localeCompare(a.date));
  }, [allRevenueRecords, historyTimeRange, historyStartDate, historyEndDate]);

  // Backward compatibility alias for any existing reference
  const displayedRevenueRows = displayedHistoryRows;

  // Derived Calculations
  const totalViewsNum = Number(account?.totalViews || 0);
  const totalRevNum = Number((account as any)?.analytics?.totalRevenue ?? account?.totalRevenue ?? 0);
  const calculatedRpm =
    totalViewsNum > 0
      ? Math.round(((totalRevNum * 1000) / totalViewsNum) * 100) / 100
      : 0;

  if (isLoading) {
    return <AccountDetailSkeleton />;
  }

  if (isError || !account) {
    return (
      <div className="p-8 max-w-2xl mx-auto bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/50 rounded-2xl text-center space-y-4 shadow-sm mt-12">
        <div className="w-14 h-14 mx-auto rounded-full bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center text-rose-500">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-black text-slate-900 dark:text-white">
          Không tìm thấy tài khoản
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {error?.message || "Tài khoản không tồn tại hoặc bạn không có quyền truy cập."}
        </p>
        <Link
          href="/accounts"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Quay lại danh sách
        </Link>
      </div>
    );
  }

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

      {/* Account Details Header Section (Static / Non-sticky) */}
      <div className="bg-transparent pb-4 border-b border-slate-200/80 dark:border-slate-800/80 space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          {/* Back Button & Account Title */}
          <div className="flex items-center gap-3.5 min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/accounts"
                  className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shadow-sm shrink-0"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Quay lại Quản lý tài khoản
              </TooltipContent>
            </Tooltip>

            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-pink-500 to-rose-400 p-0.5 shadow-md">
                <div className="w-full h-full rounded-[14px] bg-white dark:bg-slate-900 flex items-center justify-center font-black text-pink-600 dark:text-pink-400 text-lg uppercase">
                  {account.username.slice(0, 2)}
                </div>
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white dark:bg-slate-900 flex items-center justify-center shadow">
                <span className="text-xs">{account.country === "UK" ? "🇬🇧" : account.country === "VN" ? "🇻🇳" : account.country === "DE" ? "🇩🇪" : "🇺🇸"}</span>
              </div>
            </div>

            {/* Title & Metadata */}
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  @{account.username}
                </h1>
                <OnlineOfflineBadge isOnline={account.isOnline} size="md" />
                {getStatusBadge(account.status)}
                {account.groupName && (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    {account.groupName}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2.5 sm:gap-3 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                <span>ID: <code className="text-xs font-mono text-slate-700 dark:text-slate-300">{account.id}</code></span>
                <span>•</span>
                <span className="flex items-center gap-1.5">
                  Phụ trách: <strong className="text-slate-800 dark:text-slate-200">{account.assignedUser?.name || account.assignedUser?.fullName || account.assignedUser?.username || "Chưa gán"}</strong>
                </span>
                {isLeadOrAdmin ? (
                  <button
                    onClick={() => toggleLockMutation.mutate({ id: account.id, isLocked: !account.isAssignmentLocked })}
                    disabled={toggleLockMutation.isPending}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${account.isAssignmentLocked
                      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/20"
                      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                      }`}
                    title={account.isAssignmentLocked ? "Click để mở khóa phân công" : "Click để khóa phân công"}
                  >
                    {account.isAssignmentLocked ? (
                      <>
                        <Lock className="w-3 h-3" />
                        <span>Đã khóa phân công</span>
                      </>
                    ) : (
                      <>
                        <Unlock className="w-3 h-3" />
                        <span>Đổi ca tự do</span>
                      </>
                    )}
                  </button>
                ) : account.isAssignmentLocked ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                    <Lock className="w-3 h-3" />
                    <span>Đã khóa</span>
                  </span>
                ) : null}
                <span>•</span>
                <span>Cập nhật: {account.lastSyncedAt ? new Date(account.lastSyncedAt).toLocaleString("vi-VN") : "Chưa đồng bộ"}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons Toolbar */}
          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0 w-full xl:w-auto xl:ml-auto">
            {/* Transfer / Reassign Button for Admin & Lead */}
            {isLeadOrAdmin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      setSelectedTransferUserId(account.assignedUserId || "UNASSIGNED");
                      setIsLockOnTransfer(!!account.isAssignmentLocked);
                      setIsTransferModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 shadow-xs active:scale-95 transition-all cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>Chuyển giao</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Chuyển giao quyền quản lý tài khoản cho nhân sự khác
                </TooltipContent>
              </Tooltip>
            )}

            {/* Sync Live Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => syncMutation.mutate({ accountId: account.id })}
                  disabled={syncMutation.isPending}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white shadow-sm hover:shadow active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 shrink-0 aspect-square ${syncMutation.isPending ? "animate-spin" : ""}`} />
                  <span>{syncMutation.isPending ? "Đang đồng bộ..." : "Đồng Bộ TikTok Studio"}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Đồng bộ dữ liệu thời gian thực từ TikTok Studio
              </TooltipContent>
            </Tooltip>

            {/* Launch / Stop GPM Profile */}
            {account.gpmProfileId && (
              <div className="flex items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleStartGpm}
                      disabled={startingGpm || startGpmMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm hover:shadow active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <Play className={`w-3.5 h-3.5 fill-current shrink-0 ${startingGpm ? "animate-pulse" : ""}`} />
                      <span>{startingGpm ? "Đang mở..." : "Mở Profile GPM"}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Mở profile GPM (cổng {(account as any).gpmPort || gpmStatus?.port || "auto"})
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => stopGpmMutation.mutate({ gpmProfileId: account.gpmProfileId!, port: (account as any).gpmPort || gpmStatus?.port || undefined })}
                      disabled={stopGpmMutation.isPending}
                      className="p-2 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all cursor-pointer disabled:opacity-50"
                      aria-label="Đóng trình duyệt GPM"
                    >
                      <Square className="w-3.5 h-3.5 fill-current shrink-0" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Đóng trình duyệt GPM
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 border-t border-slate-200/60 dark:border-slate-800/60 pt-2.5 overflow-x-auto">
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === "overview"
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"
              }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Tổng Quan & Chỉ Số</span>
          </button>

          <button
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === "history"
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"
              }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Biểu Đồ & Lịch Sử Doanh Thu</span>
            {displayedRevenueRows.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-xs bg-pink-500/20 text-pink-500">
                {displayedRevenueRows.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("alerts")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === "alerts"
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"
              }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span>Cảnh Báo & Rủi Ro</span>
            {account.alerts?.filter((a: any) => a.status === "OPEN").length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-xs bg-rose-500 text-white font-bold">
                {account.alerts.filter((a: any) => a.status === "OPEN").length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("logs")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === "logs"
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"
              }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Nhật Ký & Audit Trail</span>
            {account.logs?.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-xs bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                {account.logs.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Top 6 KPI Cards Overview */}
      {activeTab !== "alerts" && activeTab !== "logs" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {/* Total Views */}
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm relative overflow-hidden min-w-0">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider truncate whitespace-nowrap" title="Tổng Lượt Xem">Tổng Lượt Xem</span>
              <Eye className="w-4 h-4 text-cyan-500 shrink-0" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-cyan-600 dark:text-cyan-400 mt-2 truncate">
              {totalViewsNum.toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1 truncate">
              <Sparkles className="w-3 h-3 text-cyan-500 shrink-0" />
              <span className="truncate">Toàn thời gian (Studio)</span>
            </div>
          </div>

          {/* Total Followers */}
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm relative overflow-hidden min-w-0">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider truncate whitespace-nowrap" title="Followers">Followers</span>
              <Users className="w-4 h-4 text-purple-500 shrink-0" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-purple-600 dark:text-purple-400 mt-2 truncate">
              {Number(account.totalFollowers || 0).toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1 truncate">
              <span className="truncate">Kênh đạt chuẩn quỹ</span>
            </div>
          </div>

          {/* Total Videos */}
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm relative overflow-hidden min-w-0">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider truncate whitespace-nowrap" title="Số Video">Số Video</span>
              <Video className="w-4 h-4 text-indigo-500 shrink-0" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-2 truncate">
              {Number(account.totalVideos || 0).toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1 truncate">
              <span className="truncate">Đã đăng trên kênh</span>
            </div>
          </div>

          {/* Total Revenue */}
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm relative overflow-hidden min-w-0">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider truncate whitespace-nowrap" title="Tổng Doanh Thu">Tổng Doanh Thu</span>
              <DollarSign className="w-4 h-4 text-pink-500 shrink-0" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-pink-600 dark:text-pink-400 mt-2 truncate">
              {formatAmount(totalRevNum, account?.country)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1 truncate">
              <span className="truncate">Creator Rewards</span>
            </div>
          </div>

          {/* Average RPM */}
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm relative overflow-hidden min-w-0">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider truncate whitespace-nowrap" title="RPM Trung Bình">RPM Trung Bình</span>
              <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2 truncate">
              {formatAmount(calculatedRpm, account?.country)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1 truncate">
              <span className="truncate">/ 1,000 views</span>
            </div>
          </div>

          {/* Country Status */}
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm relative overflow-hidden min-w-0">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider truncate whitespace-nowrap" title="Quốc Gia">Quốc Gia</span>
              <Globe className="w-4 h-4 text-amber-500 shrink-0" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 mt-2 truncate">
              {(account.country || "US").toUpperCase()}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
              {getCountryName(account.country)}
            </div>
          </div>
        </div>
      )}

      {/* Main Tab Content */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Columns: Views Breakdown & Performance Dashboard */}
          <div className="lg:col-span-2 space-y-6 flex flex-col">
            {/* Time-Window Breakdown Box */}
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-pink-500" />
                    Phân Tích Chỉ Số Theo Thời Gian
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Số liệu lượt xem và doanh thu của tài khoản
                  </p>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0 overflow-x-auto max-w-full scrollbar-none">
                  {[
                    { id: "7d", label: "7 Ngày" },
                    { id: "28d", label: "28 Ngày" },
                    { id: "60d", label: "60 Ngày" },
                    { id: "365d", label: "365 Ngày" },
                    { id: "all", label: "Toàn Bộ" },
                  ].map((range) => (
                    <button
                      key={range.id}
                      onClick={() => setSelectedTimeRange(range.id as any)}
                      className={`px-3 py-1 rounded-lg text-xs font-normal transition-all cursor-pointer whitespace-nowrap shrink-0 ${selectedTimeRange === range.id
                        ? "bg-amber-500 text-slate-950 shadow-sm font-medium"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                    >
                      {range.label}
                    </button>
                  ))}

                  {/* Custom Date Range Popover */}
                  <Popover open={isRangePickerOpen} onOpenChange={setIsRangePickerOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={`px-3 py-1 rounded-lg text-xs font-normal transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${selectedTimeRange === "custom"
                          ? "bg-amber-500 text-slate-950 shadow-sm font-medium"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                          }`}
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>
                          {selectedTimeRange === "custom" && customStartDate && customEndDate
                            ? `${format(new Date(customStartDate + "T00:00:00"), "dd/MM")} - ${format(new Date(customEndDate + "T00:00:00"), "dd/MM")}`
                            : "Tùy chọn"}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="bottom"
                      sideOffset={6}
                      align="end"
                      avoidCollisions={false}
                      className="w-[325px] p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50"
                    >
                      <div className="flex items-center justify-between gap-2 pb-2 mb-1 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          Chọn khoảng ngày thống kê
                        </span>
                        {rangeSelection?.from && (
                          <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800 whitespace-nowrap shrink-0">
                            {format(rangeSelection.from, "dd/MM/yy")} - {rangeSelection.to ? format(rangeSelection.to, "dd/MM/yy") : "..."}
                          </span>
                        )}
                      </div>

                      <div className="w-full py-0.5">
                        <CalendarPicker
                          mode="range"
                          selected={rangeSelection}
                          onSelect={(range) => {
                            setRangeSelection(range);
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
                              const s = format(rangeSelection.from, "yyyy-MM-dd");
                              const e = rangeSelection.to ? format(rangeSelection.to, "yyyy-MM-dd") : s;
                              setCustomStartDate(s);
                              setCustomEndDate(e);
                              setSelectedTimeRange("custom");
                            }
                            setIsRangePickerOpen(false);
                          }}
                          className="px-4 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-50 rounded-lg shadow-sm cursor-pointer transition-all"
                        >
                          Áp dụng
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Custom Date Range Summary Banner */}
              {selectedTimeRange === "custom" && customStartDate && customEndDate && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-pink-50 dark:bg-pink-950/30 border border-pink-200 dark:border-pink-800/60">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-pink-500/10 text-pink-600 dark:text-pink-400 flex items-center justify-center font-bold shrink-0">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        Khoảng ngày tùy chọn:{" "}
                        <span className="text-pink-600 dark:text-pink-400">
                          {format(new Date(customStartDate + "T00:00:00"), "dd/MM/yyyy")} - {format(new Date(customEndDate + "T00:00:00"), "dd/MM/yyyy")}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {chartData.length} ngày có dữ liệu
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-semibold">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">Doanh thu: </span>
                      <span className="font-black text-pink-600 dark:text-pink-400 text-sm">
                        {currencySymbol}{chartData.reduce((s, i) => s + (i.revenue || 0), 0).toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">Lượt xem: </span>
                      <span className="font-black text-pink-600 dark:text-pink-400 text-sm">
                        {chartData.reduce((s, i) => s + (i.views || 0), 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Metric Comparison Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-3 text-center">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">7 Ngày Qua</div>
                  <div className="text-base sm:text-lg font-black text-cyan-600 dark:text-cyan-400 mt-1">
                    {(account as any).analytics?.revenue7d != null
                      ? formatAmount(Number((account as any).analytics.revenue7d), account?.country)
                      : "—"}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {((account as any).analytics?.views7d != null
                      ? Number((account as any).analytics.views7d).toLocaleString()
                      : account.dailyRevenues?.slice(0, 7).reduce((acc: number, r: any) => acc + Number(r.views || 0), 0)?.toLocaleString()) || "—"}{" "}
                    views
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-3 text-center">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">28 Ngày Qua</div>
                  <div className="text-base sm:text-lg font-black text-purple-600 dark:text-purple-400 mt-1">
                    {(account as any).analytics?.revenue28d != null
                      ? formatAmount(Number((account as any).analytics.revenue28d), account?.country)
                      : "—"}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {((account as any).analytics?.views28d != null
                      ? Number((account as any).analytics.views28d).toLocaleString()
                      : account.dailyRevenues?.slice(0, 28).reduce((acc: number, r: any) => acc + Number(r.views || 0), 0)?.toLocaleString()) || "—"}{" "}
                    views
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-3 text-center">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">60 Ngày Qua</div>
                  <div className="text-base sm:text-lg font-black text-indigo-600 dark:text-indigo-400 mt-1">
                    {(account as any).analytics?.revenue60d != null
                      ? formatAmount(Number((account as any).analytics.revenue60d), account?.country)
                      : "—"}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {((account as any).analytics?.views60d != null
                      ? Number((account as any).analytics.views60d).toLocaleString()
                      : account.dailyRevenues?.slice(0, 60).reduce((acc: number, r: any) => acc + Number(r.views || 0), 0)?.toLocaleString()) || "—"}{" "}
                    views
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-3 text-center">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">365 Ngày (1 Năm)</div>
                  <div className="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400 mt-1">
                    {(account as any).analytics?.revenue365d != null
                      ? formatAmount(Number((account as any).analytics.revenue365d), account?.country)
                      : "—"}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {((account as any).analytics?.views365d != null
                      ? Number((account as any).analytics.views365d).toLocaleString()
                      : account.dailyRevenues?.slice(0, 365).reduce((acc: number, r: any) => acc + Number(r.views || 0), 0)?.toLocaleString()) || "—"}{" "}
                    views
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-3 text-center col-span-2 sm:col-span-1">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Toàn Thời Gian</div>
                  <div className="text-base sm:text-lg font-black text-pink-600 dark:text-pink-400 mt-1">
                    {formatAmount(totalRevNum, account?.country)}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {totalViewsNum.toLocaleString()} views
                  </div>
                </div>
              </div>
            </div>

            {/* Daily Revenue Chart Preview */}
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4 flex-1 flex flex-col justify-between">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                      Biểu Đồ Doanh Thu & Lượt Xem Gần Đây
                    </span>
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                      ({selectedTimeRange === "7d"
                        ? "7 ngày qua"
                        : selectedTimeRange === "28d"
                          ? "28 ngày qua"
                          : selectedTimeRange === "60d"
                            ? "60 ngày qua"
                            : selectedTimeRange === "365d"
                              ? "365 ngày qua"
                              : selectedTimeRange === "all"
                                ? "Toàn bộ"
                                : customStartDate && customEndDate
                                  ? `${format(new Date(customStartDate + "T00:00:00"), "dd/MM")} - ${format(new Date(customEndDate + "T00:00:00"), "dd/MM")}`
                                  : "Tùy chọn"})
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Theo dõi biến động doanh thu ({currencySymbol}) và lượt xem hàng ngày
                  </p>
                </div>
                <button
                  onClick={() => {
                    setActiveTab("history");
                    setHistoryTimeRange(selectedTimeRange);
                    setHistoryStartDate(customStartDate);
                    setHistoryEndDate(customEndDate);
                    setHistoryRangeSelection(rangeSelection);
                  }}
                  className="text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-pink-600 dark:hover:text-pink-400 px-3 py-1.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/80 hover:bg-pink-50 dark:hover:bg-pink-950/50 border border-slate-200/80 dark:border-slate-700/80 hover:border-pink-300 dark:hover:border-pink-800 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                >
                  <span>Xem đầy đủ bảng</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {chartData.length > 0 ? (
                <div className="w-full pt-2 flex-1 min-h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: "rgba(15, 23, 42, 0.95)",
                          borderRadius: "12px",
                          border: "1px solid rgba(255, 255, 255, 0.1)",
                          color: "#fff",
                          fontSize: "12px",
                        }}
                      />
                      <Bar dataKey="revenue" name={`Doanh thu (${currencySymbol})`} fill="#ec4899" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400 dark:text-slate-500 space-y-3 flex-1 flex flex-col items-center justify-center min-h-[260px]">
                  <BarChart3 className="w-10 h-10 mx-auto opacity-40 text-slate-400" />
                  <p className="text-xs">Chưa có bản ghi doanh thu nào theo ngày.</p>
                  {isLeadOrAdmin && (
                    <button
                      onClick={() => setIsAddRevenueOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/40 hover:bg-pink-100 dark:hover:bg-pink-900/50 border border-pink-200/80 dark:border-pink-800/80 transition-all cursor-pointer shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Nhập bản ghi đầu tiên</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Operational Controls & GPM Integration */}
          <div className="space-y-6">
            {/* Account Settings & Quick Edit Card */}
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                <Sliders className="w-4 h-4 text-pink-500" />
                Thông Tin Vận Hành & Quản Lý
              </h3>

              {/* Status Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Trạng thái tài khoản
                </label>
                <Select
                  value={account.status}
                  onValueChange={(val: any) =>
                    updateMutation.mutate({ id: account.id, status: val })
                  }
                >
                  <SelectTrigger className="w-full h-9 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-xs font-normal cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
                    <SelectItem value="ACTIVE" className="text-xs font-normal cursor-pointer">Active (Hoạt động)</SelectItem>
                    <SelectItem value="WARMING" className="text-xs font-normal cursor-pointer">Warming (Nuôi acc)</SelectItem>
                    <SelectItem value="RESTRICTED" className="text-xs font-normal cursor-pointer">Restricted (Hạn chế)</SelectItem>
                    <SelectItem value="BANNED" className="text-xs font-normal cursor-pointer">Banned (Bị khóa)</SelectItem>
                    <SelectItem value="STOPPED" className="text-xs font-normal cursor-pointer">Stopped (Tạm dừng)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Assigned Staff Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Nhân sự phụ trách
                </label>
                {isLeadOrAdmin ? (
                  <Select
                    value={account.assignedUserId || "UNASSIGNED"}
                    onValueChange={(val) =>
                      updateMutation.mutate({
                        id: account.id,
                        assignedUserId: val === "UNASSIGNED" ? null : val,
                      })
                    }
                  >
                    <SelectTrigger className="w-full h-9 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-xs font-normal cursor-pointer">
                      <SelectValue placeholder="-- Chọn nhân sự --">
                        {account.assignedUser ? account.assignedUser.fullName || account.assignedUser.username : "-- Chưa gán --"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-56">
                      <SelectItem value="UNASSIGNED" className="text-xs font-normal cursor-pointer text-slate-400">
                        -- Chưa gán --
                      </SelectItem>
                      {staffList.map((s: any) => (
                        <SelectItem key={s.id} value={s.id} className="text-xs font-normal cursor-pointer">
                          {s.fullName} ({s.username})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="w-full h-9 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 flex items-center text-xs font-normal text-slate-700 dark:text-slate-300 select-none">
                    {account.assignedUser ? account.assignedUser.fullName || account.assignedUser.username : "Chưa gán"}
                  </div>
                )}
              </div>

              {/* Country Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Quốc gia (Country)
                </label>
                <Select
                  value={normalizeCountry(account.country)}
                  onValueChange={(val) =>
                    updateMutation.mutate({ id: account.id, country: val })
                  }
                >
                  <SelectTrigger className="w-full h-9 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-xs font-normal cursor-pointer">
                    <SelectValue placeholder="Chọn quốc gia" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-60">
                    {COUNTRY_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value} className="text-xs font-normal cursor-pointer">
                        {c.label}
                      </SelectItem>
                    ))}
                    {!COUNTRY_OPTIONS.some((c) => c.value === normalizeCountry(account.country)) && account.country && (
                      <SelectItem value={account.country} className="text-xs font-normal cursor-pointer">
                        🌐 {account.country}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Group Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Tên nhóm / Phân loại
                </label>
                <div className="flex gap-2">
                  <Input
                    defaultValue={account.groupName || ""}
                    placeholder="VD: Team US 01, Niche Funny..."
                    onBlur={(e) => {
                      if (e.target.value !== account.groupName) {
                        updateMutation.mutate({ id: account.id, groupName: e.target.value });
                      }
                    }}
                    className="h-9 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* GPM-Login Integration Card */}
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-500" />
                  GPM-Login Integration
                </h3>
                {account.gpmProfileId ? (
                  <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800">
                    Đã Liên Kết
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">
                    Chưa gắn GPM
                  </span>
                )}
              </div>

              {account.gpmProfileId ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 space-y-1.5">
                    <div className="text-xs font-medium text-slate-500">GPM Profile ID</div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono text-cyan-600 dark:text-cyan-400 break-all block font-bold">
                        {account.gpmProfileId}
                      </code>
                      {((account as any).gpmPort || gpmStatus?.port) && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 border border-cyan-300/50 dark:border-cyan-800/50">
                          Port: {(account as any).gpmPort || gpmStatus?.port}
                        </span>
                      )}
                    </div>
                    {(account as { gpmProfileName?: string | null }).gpmProfileName && (
                      <div className="pt-1 text-xs text-slate-600 dark:text-slate-300">
                        Tên profile:{" "}
                        <span className="font-semibold">
                          {(account as { gpmProfileName?: string | null }).gpmProfileName}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={handleStartGpm}
                          disabled={startingGpm || startGpmMutation.isPending}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                        >
                          <Play className={`w-3.5 h-3.5 fill-current ${startingGpm ? "animate-pulse" : ""}`} />
                          <span>{startingGpm ? "Đang mở..." : "Mở GPM"}</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        Mở profile GPM (cổng {(account as any).gpmPort || gpmStatus?.port || "auto"})
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => stopGpmMutation.mutate({ gpmProfileId: account.gpmProfileId!, port: (account as any).gpmPort || gpmStatus?.port || undefined })}
                          disabled={stopGpmMutation.isPending}
                          className="py-2 px-3 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all cursor-pointer"
                        >
                          <Square className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        Đóng trình duyệt GPM
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Gắn GPM Profile ID để cho phép tự động mở trình duyệt và đồng bộ TikTok Studio.
                  </p>
                  <Input
                    placeholder="Nhập GPM Profile UUID..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val) updateMutation.mutate({ id: account.id, gpmProfileId: val });
                      }
                    }}
                    className="h-9 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* History & Daily Revenue Tab */}
      {activeTab === "history" && (
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-amber-500" />
                Lịch Sử Doanh Thu & Views Từng Ngày ({currencySymbol})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Bảng hiển thị chi tiết số liệu theo từng ngày đã được ghi nhận và đồng bộ từ TikTok Studio.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* History Date Filter Toolbar */}
              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0 overflow-x-auto max-w-full scrollbar-none">
                {[
                  { id: "7d", label: "7 Ngày" },
                  { id: "28d", label: "28 Ngày" },
                  { id: "60d", label: "60 Ngày" },
                  { id: "365d", label: "365 Ngày" },
                  { id: "all", label: "Toàn Bộ" },
                ].map((range) => (
                  <button
                    key={range.id}
                    onClick={() => setHistoryTimeRange(range.id as any)}
                    className={`px-3 py-1 rounded-lg text-xs font-normal transition-all cursor-pointer whitespace-nowrap shrink-0 ${historyTimeRange === range.id
                      ? "bg-amber-500 text-slate-950 shadow-sm font-medium"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                  >
                    {range.label}
                  </button>
                ))}

                {/* Custom Date Range Popover */}
                <Popover open={isHistoryRangePickerOpen} onOpenChange={setIsHistoryRangePickerOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={`px-3 py-1 rounded-lg text-xs font-normal transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${historyTimeRange === "custom"
                        ? "bg-amber-500 text-slate-950 shadow-sm font-medium"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>
                        {historyTimeRange === "custom" && historyStartDate && historyEndDate
                          ? `${format(new Date(historyStartDate + "T00:00:00"), "dd/MM")} - ${format(new Date(historyEndDate + "T00:00:00"), "dd/MM")}`
                          : "Tùy chọn"}
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="bottom"
                    sideOffset={6}
                    align="end"
                    avoidCollisions={false}
                    className="w-[325px] p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50"
                  >
                    <div className="flex items-center justify-between gap-2 pb-2 mb-1 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        Chọn khoảng ngày thống kê
                      </span>
                      {historyRangeSelection?.from && (
                        <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800 whitespace-nowrap shrink-0">
                          {format(historyRangeSelection.from, "dd/MM/yy")} - {historyRangeSelection.to ? format(historyRangeSelection.to, "dd/MM/yy") : "..."}
                        </span>
                      )}
                    </div>

                    <div className="w-full py-0.5">
                      <CalendarPicker
                        mode="range"
                        selected={historyRangeSelection}
                        onSelect={(range) => {
                          setHistoryRangeSelection(range);
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
                        onClick={() => setIsHistoryRangePickerOpen(false)}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        disabled={!historyRangeSelection?.from}
                        onClick={() => {
                          if (historyRangeSelection?.from) {
                            const s = format(historyRangeSelection.from, "yyyy-MM-dd");
                            const e = historyRangeSelection.to ? format(historyRangeSelection.to, "yyyy-MM-dd") : s;
                            setHistoryStartDate(s);
                            setHistoryEndDate(e);
                            setHistoryTimeRange("custom");
                          }
                          setIsHistoryRangePickerOpen(false);
                        }}
                        className="px-4 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-50 rounded-lg shadow-sm cursor-pointer transition-all"
                      >
                        Áp dụng
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {isLeadOrAdmin && (
                <button
                  onClick={() => setIsAddRevenueOpen(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white shadow-sm hover:shadow transition-all cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  <span>Thêm Bản Ghi Mới</span>
                </button>
              )}
            </div>
          </div>

          {/* Custom Date Range Summary Banner for History Tab */}
          {historyTimeRange === "custom" && historyStartDate && historyEndDate && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-pink-50 dark:bg-pink-950/30 border border-pink-200 dark:border-pink-800/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-pink-500/10 text-pink-600 dark:text-pink-400 flex items-center justify-center font-bold shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    Khoảng ngày tùy chọn:{" "}
                    <span className="text-pink-600 dark:text-pink-400">
                      {format(new Date(historyStartDate + "T00:00:00"), "dd/MM/yyyy")} - {format(new Date(historyEndDate + "T00:00:00"), "dd/MM/yyyy")}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {displayedHistoryRows.length} ngày có dữ liệu
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs font-semibold">
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Doanh thu: </span>
                  <span className="font-black text-pink-600 dark:text-pink-400 text-sm">
                    {currencySymbol}{displayedHistoryRows.reduce((s, i) => s + (i.revenue || 0), 0).toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Lượt xem: </span>
                  <span className="font-black text-pink-600 dark:text-pink-400 text-sm">
                    {displayedHistoryRows.reduce((s, i) => s + (i.views || 0), 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* History Chart */}
          {historyChartData.length > 0 && (
            <div className="w-full pt-1 min-h-[260px] h-[260px] pb-2 border-b border-slate-100 dark:border-slate-800">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={historyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "rgba(15, 23, 42, 0.95)",
                      borderRadius: "12px",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      color: "#fff",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="revenue" name={`Doanh thu (${currencySymbol})`} fill="#ec4899" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-slate-600 dark:text-slate-300 font-semibold text-xs border-b border-slate-200 dark:border-slate-800 normal-case">
                <tr>
                  <th className="py-3 px-4">Ngày</th>
                  <th className="py-3 px-4">Nguồn thu</th>
                  <th className="py-3 px-4">Lượt xem</th>
                  <th className="py-3 px-4">RPM ({currencySymbol})</th>
                  <th className="py-3 px-4">Doanh thu ({currencySymbol})</th>
                  <th className="py-3 px-4">Thời gian tạo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {displayedRevenueRows.length > 0 ? (
                  displayedRevenueRows.map((rec) => (
                    <tr
                      key={rec.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-slate-100">
                        {new Date(rec.date + "T00:00:00").toLocaleDateString("vi-VN")}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-md text-xs font-bold border ${rec.isAutomated
                            ? "bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800"
                            : "bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400 border border-pink-200 dark:border-pink-800"
                            }`}
                        >
                          {rec.sourceType} {rec.isAutomated ? "• Studio" : "• Thủ công"}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-cyan-600 dark:text-cyan-400">
                        {rec.views > 0 ? rec.views.toLocaleString() : "—"}
                      </td>
                      <td className="py-3 px-4 font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatAmount(Number(rec.rpm || 0), account?.country)}
                      </td>
                      <td className="py-3 px-4 font-black text-pink-600 dark:text-pink-400 text-sm">
                        {formatAmount(Number(rec.revenue || 0), account?.country)}
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-xs">
                        {rec.createdTime || "—"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-14 text-center text-slate-400 dark:text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-3 max-w-md mx-auto">
                        <BarChart3 className="w-10 h-10 opacity-35 text-slate-400 dark:text-slate-500" />
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Chưa có bản ghi doanh thu nào. Bấm nút <strong>"Thêm Bản Ghi Mới"</strong> để ghi nhận hoặc đồng bộ TikTok Studio.
                        </p>
                        {isLeadOrAdmin && (
                          <button
                            type="button"
                            onClick={() => setIsAddRevenueOpen(true)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/40 hover:bg-pink-100 dark:hover:bg-pink-900/50 border border-pink-200/80 dark:border-pink-800/80 transition-all cursor-pointer shadow-xs mt-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Thêm bản ghi đầu tiên</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Alerts & Warnings Tab */}
      {activeTab === "alerts" && (
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
          <div className="pb-4 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Cảnh Báo & Rủi Ro Tài Khoản
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Theo dõi các cảnh báo vi phạm, mất quỹ, checkpoint hoặc sự cố đăng nhập
            </p>
          </div>

          <div className="space-y-3">
            {account.alerts && account.alerts.length > 0 ? (
              account.alerts.map((alt: any) => (
                <div
                  key={alt.id}
                  className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${alt.status === "OPEN"
                    ? "bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60"
                    : "bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 opacity-70"
                    }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${alt.status === "OPEN"
                        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        : "bg-slate-200 dark:bg-slate-800 text-slate-500"
                        }`}
                    >
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {alt.alertType}
                        </span>
                        <span
                          className={`px-2 py-0.2 rounded-full text-xs font-bold ${alt.status === "OPEN"
                            ? "bg-rose-500 text-white"
                            : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                            }`}
                        >
                          {alt.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                        {alt.description}
                      </p>
                      <div className="text-xs text-slate-400 mt-1">
                        Tạo lúc: {new Date(alt.createdAt).toLocaleString("vi-VN")}
                      </div>
                    </div>
                  </div>

                  {alt.status === "OPEN" && (
                    <button
                      onClick={() => resolveAlertMutation.mutate({ alertId: alt.id })}
                      disabled={resolveAlertMutation.isPending}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all cursor-pointer whitespace-nowrap self-end sm:self-auto"
                    >
                      <Check className="w-3.5 h-3.5 inline mr-1" />
                      Đánh dấu đã xử lý
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <CheckCircle className="w-8 h-8 mx-auto text-emerald-500 opacity-60" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Tuyệt vời! Không có cảnh báo rủi ro nào trên tài khoản này.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Audit Logs & Notes Tab */}
      {activeTab === "logs" && (
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
          <div className="pb-4 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-500" />
              Nhật Ký & Lịch Sử Hoạt Động (Audit Trail)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Ghi nhận toàn bộ thao tác thay đổi trạng thái, đồng bộ dữ liệu và ghi chú của nhân sự
            </p>
          </div>

          {/* Add Manual Note */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-pink-500" />
              Thêm ghi chú / nhật ký mới
            </label>
            <div className="flex gap-2">
              <Input
                value={newLogMessage}
                onChange={(e) => setNewLogMessage(e.target.value)}
                placeholder="Nhập ghi chú cho tài khoản này (ví dụ: Đã đổi IP proxy, vừa kháng gậy...)"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newLogMessage.trim()) {
                    addLogMutation.mutate({ accountId: account.id, message: newLogMessage.trim() });
                  }
                }}
                className="h-10 text-xs rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
              />
              <button
                onClick={() => {
                  if (newLogMessage.trim()) {
                    addLogMutation.mutate({ accountId: account.id, message: newLogMessage.trim() });
                  }
                }}
                disabled={!newLogMessage.trim() || addLogMutation.isPending}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 shadow-sm transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Gửi</span>
              </button>
            </div>
          </div>

          {/* Timeline */}
          <div className="space-y-4 pt-2">
            {account.logs && account.logs.length > 0 ? (
              account.logs.map((log: any) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3.5 p-3 rounded-2xl bg-slate-50/60 dark:bg-slate-950/30 border border-slate-100 dark:border-slate-800/60"
                >
                  <div className="w-8 h-8 rounded-xl bg-pink-500/10 text-pink-600 dark:text-pink-400 flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">
                    {log.logType === "SYNC" ? "🔄" : log.logType === "STATUS_CHANGE" ? "⚡" : "📝"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        {log.actorName || "System"}
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        {new Date(log.createdAt).toLocaleString("vi-VN")}
                      </div>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 break-words">
                      {log.message}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-slate-400">
                Chưa có nhật ký hoạt động nào.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Daily Revenue Modal */}
      <Dialog open={isAddRevenueOpen} onOpenChange={setIsAddRevenueOpen}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-pink-500" />
              Nhập Bản Ghi Doanh Thu Ngày
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Ngày ghi nhận
              </label>
              <Input
                type="date"
                value={newRevDate}
                onChange={(e) => setNewRevDate(e.target.value)}
                className="h-9 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Lượt xem (Views)
                </label>
                <Input
                  type="number"
                  placeholder="VD: 50000"
                  value={newRevViews}
                  onChange={(e) => setNewRevViews(e.target.value)}
                  className="h-9 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  RPM ({currencySymbol})
                </label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="VD: 0.85"
                  value={newRevRpm}
                  onChange={(e) => setNewRevRpm(e.target.value)}
                  className="h-9 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Tổng tiền ({currencySymbol})
              </label>
              <Input
                type="number"
                step="0.01"
                placeholder="VD: 42.50 (tự tính nếu bỏ trống)"
                value={newRevAmount}
                onChange={(e) => setNewRevAmount(e.target.value)}
                className="h-9 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Nguồn tiền
              </label>
              <Select value={newRevSource} onValueChange={setNewRevSource}>
                <SelectTrigger className="w-full h-9 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-xs font-medium cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
                  <SelectItem value="CREATOR_REWARDS" className="text-xs cursor-pointer">Creator Rewards Program</SelectItem>
                  <SelectItem value="AFFILIATE" className="text-xs cursor-pointer">TikTok Shop Affiliate</SelectItem>
                  <SelectItem value="SERIES" className="text-xs cursor-pointer">TikTok Series</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <button
              onClick={() => setIsAddRevenueOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              Hủy
            </button>
            <button
              onClick={() => {
                const viewsNum = Number(newRevViews) || 0;
                const rpmNum = Number(newRevRpm) || 0;
                let revNum = Number(newRevAmount) || 0;
                if (!revNum && viewsNum > 0 && rpmNum > 0) {
                  revNum = (viewsNum / 1000) * rpmNum;
                }
                upsertRevenueMutation.mutate({
                  accountId: account.id,
                  date: newRevDate,
                  views: viewsNum,
                  rpm: rpmNum,
                  revenue: revNum,
                  sourceType: newRevSource,
                });
              }}
              disabled={upsertRevenueMutation.isPending}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              {upsertRevenueMutation.isPending ? "Đang lưu..." : "Lưu Bản Ghi"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Handover / Transfer Assignment Modal */}
      <Dialog open={isTransferModalOpen} onOpenChange={setIsTransferModalOpen}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-amber-500" />
              Chuyển Giao Quyền Quản Lý
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
              <div>Tài khoản TikTok: <strong className="text-pink-600 dark:text-pink-400">@{account.username}</strong></div>
              <div>Người phụ trách hiện tại: <strong>{account.assignedUser?.name || account.assignedUser?.fullName || account.assignedUser?.username || "Chưa gán"}</strong></div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Chọn nhân sự mới tiếp nhận:
              </label>
              <Select value={selectedTransferUserId} onValueChange={setSelectedTransferUserId}>
                <SelectTrigger className="w-full h-10 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-xs font-medium cursor-pointer">
                  <SelectValue placeholder="Chọn nhân sự..." />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-60">
                  <SelectItem value="UNASSIGNED" className="text-xs cursor-pointer text-slate-400">
                    -- Chưa phân công (Bỏ gán) --
                  </SelectItem>
                  {staffList.map((s: any) => (
                    <SelectItem key={s.id} value={s.id} className="text-xs cursor-pointer">
                      {s.name || s.username || s.email} ({s.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="lockTransferCheckbox"
                checked={isLockOnTransfer}
                onCheckedChange={(checked) => setIsLockOnTransfer(!!checked)}
              />
              <label
                htmlFor="lockTransferCheckbox"
                className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Khóa phân công tài khoản này (Chỉ Admin/Lead mới được đổi)
              </label>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <button
              onClick={() => setIsTransferModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              Hủy
            </button>
            <button
              onClick={() => {
                const targetUserId = selectedTransferUserId === "UNASSIGNED" ? null : selectedTransferUserId;
                updateMutation.mutate(
                  {
                    id: account.id,
                    assignedUserId: targetUserId,
                    isAssignmentLocked: isLockOnTransfer,
                  },
                  {
                    onSuccess: () => {
                      setIsTransferModalOpen(false);
                      showToast("Đã chuyển giao tài khoản thành công!", "success");
                    },
                  }
                );
              }}
              disabled={updateMutation.isPending}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              {updateMutation.isPending ? "Đang xử lý..." : "Xác Nhận Chuyển Giao"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AccountDetailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400 text-xs">Đang tải chi tiết tài khoản...</div>}>
      <AccountDetailPageContent />
    </Suspense>
  );
}
