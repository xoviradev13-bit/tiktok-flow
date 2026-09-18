"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
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
} from "lucide-react";
import { useSession } from "next-auth/react";
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
import { trpc } from "@/lib/trpc";
import { launchGpmProfile } from "@/lib/gpm-client-bridge";
import { OnlineOfflineBadge } from "@/components/ui/status-badge";
import { useCurrency } from "@/contexts/CurrencyContext";

type AccountSortKey =
  | "username"
  | "groupName"
  | "gpmProfileId"
  | "country"
  | "status"
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
  { key: "totalFollowers", label: "Lượt theo dõi" },
  { key: "totalVideos", label: "Số lượng video" },
  { key: "username", label: "Tên tài khoản" },
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

function AccountsPageContent() {
  const { formatAmount } = useCurrency();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { data: session } = useSession();
  const isLeadOrAdmin =
    (session?.user as any)?.role === "ADMIN" || (session?.user as any)?.role === "LEAD";

  // SaaS URL Query State Synchronization
  const { updateUrlParams } = useUrlParams();

  // View Mode: read initial value from URL Search Params ("v" or "view")
  const initialViewMode = ((searchParams?.get("v") || searchParams?.get("view")) === "list" ? "list" : "grid") as "grid" | "list";
  const [viewMode, setViewMode] = useState<"grid" | "list">(initialViewMode);

  // Fast filters
  const initialSearch = searchParams?.get("q") || searchParams?.get("search") || "";
  const [search, setSearch] = useState(initialSearch);

  const initialStatus = searchParams?.get("status") || "ALL";
  const [statusFilter, setStatusFilter] = useState<any>(initialStatus);

  const initialOnline = (searchParams?.get("online") || "ALL") as "ALL" | "ONLINE" | "OFFLINE";
  const [onlineFilter, setOnlineFilter] = useState<"ALL" | "ONLINE" | "OFFLINE">(initialOnline);

  const initialCountry = searchParams?.get("country") || "ALL";
  const [countryFilter, setCountryFilter] = useState(initialCountry);

  const initialAssigned = searchParams?.get("user") || searchParams?.get("assigned") || "ALL";
  const [assignedFilter, setAssignedFilter] = useState(initialAssigned);

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
    const fallback = initialViewMode === "grid" ? 12 : 10;
    const num = ps ? parseInt(ps, 10) : fallback;
    return isNaN(num) || num < 1 ? fallback : num;
  }, [searchParams, initialViewMode]);

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
        country: countryFilter,
        user: assignedFilter,
        warn: warningFilter,
        gpm: gpmFilter,
        minV: minViews,
        minRev: minRevenue,
        sort: sortConfig.key,
        dir: sortConfig.desc ? "desc" : "asc",
      },
      {
        v: "grid",
        p: 1,
        ps: viewMode === "grid" ? 12 : 10,
        q: "",
        status: "ALL",
        online: "ALL",
        country: "ALL",
        user: "ALL",
        warn: "ALL",
        gpm: "ALL",
        minV: "",
        minRev: "",
        sort: "updatedAt",
        dir: "desc",
      }
    );
  }, [
    viewMode,
    page,
    pageSize,
    search,
    statusFilter,
    onlineFilter,
    countryFilter,
    assignedFilter,
    warningFilter,
    gpmFilter,
    minViews,
    minRevenue,
    sortConfig,
    updateUrlParams,
  ]);

  const handleViewModeChange = (mode: "grid" | "list") => {
    setViewMode(mode);
    const defaultSize = mode === "grid" ? 12 : 10;
    setPageSize(defaultSize);
    setPage(1);
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
    gpmGroup: true,
    gpmProfileId: true,
    country: true,
    status: true,
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
  const [newGpmId, setNewGpmId] = useState("");
  const [newAssignedUser, setNewAssignedUser] = useState("");

  // Edit form states
  const [editId, setEditId] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editCountry, setEditCountry] = useState("US");
  const [editGroup, setEditGroup] = useState("");
  const [editGpmId, setEditGpmId] = useState("");
  const [editAssignedUser, setEditAssignedUser] = useState("");

  const utils = trpc.useUtils();

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
    search: search || undefined,
    status: statusFilter !== "ALL" ? statusFilter : undefined,
    onlineStatus: onlineFilter !== "ALL" ? onlineFilter : undefined,
    country: countryFilter !== "ALL" ? countryFilter : undefined,
    assignedUserId: isLeadOrAdmin && assignedFilter !== "ALL" ? assignedFilter : undefined,
  });

  const { data: users = [] } = trpc.user.listStaff.useQuery();
  const { data: accountLogs = [], isLoading: isLogsLoading } = trpc.accounts.getLogs.useQuery(
    { accountId: selectedAccount?.id || "" },
    { enabled: isLogModalOpen && !!selectedAccount?.id }
  );

  const accounts = accountsData?.items || [];
  const stats = accountsData?.stats;

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
    onSuccess: (res) => {
      setActionMsg(
        res.isAssignmentLocked
          ? "🔒 Đã khóa phân công — Extension/Agent không tự bàn giao ca."
          : "🔓 Đã mở khóa phân công — đổi ca tự do."
      );
      utils.accounts.list.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => alert(err.message),
  });

  // tRPC Mutations
  const createMutation = trpc.accounts.create.useMutation({
    onSuccess: () => {
      setIsCreateOpen(false);
      setNewUsername("");
      setNewGpmId("");
      setActionMsg("✅ Đã tạo tài khoản TikTok thành công!");
      utils.accounts.list.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => alert(err.message),
  });

  const updateMutation = trpc.accounts.update.useMutation({
    onSuccess: () => {
      setIsEditOpen(false);
      setActionMsg("✅ Đã cập nhật thông tin tài khoản!");
      utils.accounts.list.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => alert(err.message),
  });

  const deleteMutation = trpc.accounts.delete.useMutation({
    onSuccess: () => {
      setIsDeleteOpen(false);
      setAccountToDelete(null);
      setActionMsg("🗑️ Đã xóa tài khoản TikTok thành công!");
      utils.accounts.list.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => alert(err.message),
  });

  const bulkDeleteMutation = trpc.accounts.bulkDelete.useMutation({
    onSuccess: (res) => {
      setIsBulkDeleteOpen(false);
      setSelectedIds(new Set());
      setActionMsg(`🗑️ Đã xóa thành công ${res.count} tài khoản!`);
      utils.accounts.list.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => alert(err.message),
  });

  const bulkUpdateStatusMutation = trpc.accounts.bulkUpdateStatus.useMutation({
    onSuccess: (res) => {
      setIsBulkStatusOpen(false);
      setSelectedIds(new Set());
      setActionMsg(`✅ Đã cập nhật trạng thái cho ${res.count} tài khoản!`);
      utils.accounts.list.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => alert(err.message),
  });

  const bulkAssignMutation = trpc.accounts.bulkAssign.useMutation({
    onSuccess: (res) => {
      setIsBulkAssignOpen(false);
      setSelectedIds(new Set());
      setActionMsg(`✅ Đã gán thành công cho ${res.count} tài khoản!`);
      utils.accounts.list.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => alert(err.message),
  });

  const syncMutation = trpc.accounts.syncAccount.useMutation({
    onSuccess: () => {
      setActionMsg("🔄 Đã gửi yêu cầu đồng bộ tài khoản!");
      utils.accounts.list.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => alert(err.message),
  });

  const stopSyncMutation = trpc.accounts.stopSyncAccount.useMutation({
    onSuccess: () => {
      setActionMsg("🛑 Đã gửi yêu cầu dừng đồng bộ!");
      utils.accounts.list.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => alert(err.message),
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

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;
    createMutation.mutate({
      username: newUsername.trim(),
      country: newCountry,
      groupName: newGroup || null,
      gpmProfileId: newGpmId.trim() || null,
      assignedUserId: newAssignedUser || null,
    });
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
  };

  // Filtered & Sorted accounts
  const filteredAndSortedAccounts = useMemo(() => {
    const s = search.toLowerCase().trim();

    const filtered = accounts.filter((acc: any) => {
      // Data isolation for STAFF: strictly only show accounts assigned to this staff user
      if (!isLeadOrAdmin && session?.user?.id && acc.assignedUserId !== (session.user as any).id) {
        return false;
      }

      const matchSearch =
        !s ||
        acc.username.toLowerCase().includes(s) ||
        (acc.groupName && acc.groupName.toLowerCase().includes(s));

      const matchStatus = statusFilter === "ALL" || acc.status === statusFilter;
      const matchOnline =
        onlineFilter === "ALL" ||
        (onlineFilter === "ONLINE" ? !!acc.isOnline : !acc.isOnline);
      const matchCountry = countryFilter === "ALL" || normalizeCountry(acc.country) === countryFilter;
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

      const revNum = Number((acc as any).analytics?.totalRevenue ?? acc.totalRevenue ?? 0);
      const matchMinRev = !minRevenue || revNum >= Number(minRevenue);

      return (
        matchSearch &&
        matchStatus &&
        matchOnline &&
        matchCountry &&
        matchAssigned &&
        matchWarning &&
        matchGpm &&
        matchMinViews &&
        matchMinRev
      );
    });

    // Sorting
    filtered.sort((a: any, b: any) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      if (sortConfig.key === "assignedUser") {
        aVal = a.assignedUser?.name || a.assignedUser?.username || "";
        bVal = b.assignedUser?.name || b.assignedUser?.username || "";
      } else if (sortConfig.key === "alertsCount") {
        aVal = a.alerts?.length || 0;
        bVal = b.alerts?.length || 0;
      } else if (sortConfig.key === "totalRevenue") {
        aVal = Number(a.analytics?.totalRevenue ?? a.totalRevenue ?? 0);
        bVal = Number(b.analytics?.totalRevenue ?? b.totalRevenue ?? 0);
      } else if (sortConfig.key === "totalViews" || sortConfig.key === "totalFollowers" || sortConfig.key === "totalVideos") {
        aVal = Number(aVal || 0);
        bVal = Number(bVal || 0);
      } else if (sortConfig.key === "updatedAt") {
        aVal = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        bVal = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      } else {
        aVal = (aVal || "").toString().toLowerCase();
        bVal = (bVal || "").toString().toLowerCase();
      }

      if (aVal < bVal) return sortConfig.desc ? 1 : -1;
      if (aVal > bVal) return sortConfig.desc ? -1 : 1;
      return 0;
    });

    return filtered;
  }, [
    accounts,
    search,
    statusFilter,
    onlineFilter,
    countryFilter,
    assignedFilter,
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
    (onlineFilter !== "ALL" ? 1 : 0) +
    (countryFilter !== "ALL" ? 1 : 0) +
    (warningFilter !== "ALL" ? 1 : 0) +
    (gpmFilter !== "ALL" ? 1 : 0) +
    (minViews ? 1 : 0) +
    (minRevenue ? 1 : 0);

  const totalActiveFiltersCount =
    (search ? 1 : 0) +
    (statusFilter !== "ALL" ? 1 : 0) +
    (assignedFilter !== "ALL" ? 1 : 0) +
    activeAdvancedCount;

  const clearAllFilters = () => {
    setSearch("");
    setStatusFilter("ALL");
    setOnlineFilter("ALL");
    setCountryFilter("ALL");
    setAssignedFilter("ALL");
    setWarningFilter("ALL");
    setGpmFilter("ALL");
    setMinViews("");
    setMinRevenue("");
    setPage(1);
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
            <div className="flex items-center gap-3 shrink-0">
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
            </div>
          )}
        </div>

        {actionMsg && (
          <div className="p-3.5 rounded-xl bg-cyan-50 dark:bg-slate-900 border border-cyan-200 dark:border-slate-800 text-xs font-bold text-center text-cyan-800 dark:text-cyan-300 shadow-sm animate-in fade-in">
            {actionMsg}
          </div>
        )}

        {/* KPI Stats Bar */}
        {loading || !stats ? (
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
              <div className="text-xs font-semibold text-pink-600 dark:text-pink-400 truncate whitespace-nowrap">Doanh Thu Toàn Dàn</div>
              <div className="h-7 w-20 bg-pink-100 dark:bg-pink-950/60 rounded-lg animate-pulse mt-1" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate whitespace-nowrap" title="Tổng Số Acc">
                Tổng Số Acc
              </div>
              <div className="text-xl font-black text-slate-900 dark:text-white mt-1">{stats.total}</div>
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
                <span>{stats.online || 0}</span>
                <span className="text-xs font-normal text-slate-400">/ {stats.total || 0}</span>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 min-w-0" title="Hoạt Động (Active)">
                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate whitespace-nowrap">Hoạt Động (Active)</span>
              </div>
              <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{stats.active}</div>
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
              <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 min-w-0" title="Nuôi Acc (Warming)">
                <Flame className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate whitespace-nowrap">Nuôi Acc (Warming)</span>
              </div>
              <div className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1">{stats.warming}</div>
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
              <div className="text-xs font-semibold text-orange-600 dark:text-orange-400 flex items-center gap-1 min-w-0" title="Hạn Chế (Restricted)">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate whitespace-nowrap">Hạn Chế (Restricted)</span>
              </div>
              <div className="text-xl font-black text-orange-600 dark:text-orange-400 mt-1">{stats.restricted}</div>
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
              <div className="text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1 min-w-0" title="Bị Khóa (Banned)">
                <XCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate whitespace-nowrap">Bị Khóa (Banned)</span>
              </div>
              <div className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1">{stats.banned}</div>
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
              <div className="text-xs font-semibold text-pink-600 dark:text-pink-400 truncate whitespace-nowrap" title="Doanh Thu Toàn Dàn">
                Doanh Thu Toàn Dàn
              </div>
              <div className="text-xl font-black text-pink-600 dark:text-pink-400 mt-1">${stats.totalRevenue.toLocaleString()}</div>
            </div>
          </div>
        )}

        {/* Filter & Toolbar Area (Sticky only on desktop) */}
        <div className="lg:sticky lg:top-[72px] z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm space-y-3">
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

              {/* Status Fast Filter */}
              <div className="relative shrink-0">
                <Select
                  value={statusFilter}
                  onValueChange={(val) => {
                    setStatusFilter(val);
                    setPage(1);
                  }}
                >
                  <SelectTrigger
                    className={`w-40 h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer whitespace-nowrap [&>span]:truncate transition-colors ${
                      statusFilter !== "ALL"
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
                      className={`w-40 sm:w-44 h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer whitespace-nowrap [&>span]:truncate transition-colors ${
                        assignedFilter !== "ALL"
                          ? "pr-8 border-pink-200 dark:border-pink-900/60 bg-pink-50/40 dark:bg-pink-950/25 text-pink-700 dark:text-pink-300 [&_svg]:hidden"
                          : ""
                      }`}
                    >
                      <SelectValue placeholder="Nhân sự" />
                    </SelectTrigger>
                    <SelectContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-60">
                      <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">Tất cả nhân sự</SelectItem>
                      {users.map((u: any) => (
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
                              setOnlineFilter("ALL");
                              setCountryFilter("ALL");
                              setWarningFilter("ALL");
                              setGpmFilter("ALL");
                              setMinViews("");
                              setMinRevenue("");
                              setPage(1);
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
                <PopoverContent align="end" className="w-72 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl space-y-3.5">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">Bộ lọc chi tiết</h4>
                    {activeAdvancedCount > 0 && (
                      <button
                        onClick={() => {
                          setOnlineFilter("ALL");
                          setCountryFilter("ALL");
                          setWarningFilter("ALL");
                          setGpmFilter("ALL");
                          setMinViews("");
                          setMinRevenue("");
                          setPage(1);
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/50 transition-colors cursor-pointer"
                      >
                        Đặt lại
                      </button>
                    )}
                  </div>

                  {/* Trạng thái kết nối (Online / Offline) */}
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Trạng thái kết nối
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
                          className={`w-full h-8.5 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer transition-colors ${
                            onlineFilter !== "ALL"
                              ? "pr-8 border-pink-200 dark:border-pink-900/60 bg-pink-50/40 dark:bg-pink-950/25 text-pink-700 dark:text-pink-300 [&_svg]:hidden"
                              : ""
                          }`}
                        >
                          <SelectValue placeholder="Tất cả kết nối" />
                        </SelectTrigger>
                        <SelectContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
                          <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">Tất cả kết nối</SelectItem>
                          <SelectItem value="ONLINE" className="text-xs font-normal cursor-pointer">
                            <span className="inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 shadow-xs shadow-emerald-500/50" />
                              <span>Đang Online</span>
                            </span>
                          </SelectItem>
                          <SelectItem value="OFFLINE" className="text-xs font-normal cursor-pointer">
                            <span className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400 font-medium">
                              <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 shrink-0" />
                              <span>Đang Offline</span>
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
                              aria-label="Xóa chọn kết nối"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top">Xóa chọn kết nối</TooltipContent>
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
                          className={`w-full h-8.5 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer transition-colors ${
                            countryFilter !== "ALL"
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
                          className={`w-full h-8.5 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer transition-colors ${
                            warningFilter !== "ALL"
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
                          className={`w-full h-8.5 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer transition-colors ${
                            gpmFilter !== "ALL"
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
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Lượt xem tối thiểu (Views)
                    </label>
                    <Input
                      type="number"
                      placeholder="e.g. 10000"
                      value={minViews}
                      onChange={(e) => {
                        setMinViews(e.target.value);
                        setPage(1);
                      }}
                      className="h-8.5 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />
                  </div>

                  {/* Doanh thu tối thiểu */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Doanh thu tối thiểu ($)
                    </label>
                    <Input
                      type="number"
                      placeholder="e.g. 50"
                      value={minRevenue}
                      onChange={(e) => {
                        setMinRevenue(e.target.value);
                        setPage(1);
                      }}
                      className="h-8.5 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />
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
                        className={`h-9 inline-flex items-center gap-1.5 px-3 rounded-xl text-xs transition-all cursor-pointer ${
                          sortConfig.key
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
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                          isSelected
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
                            gpmGroup: true,
                            gpmProfileId: true,
                            country: true,
                            status: true,
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
                        { key: "username", label: "Tài khoản & nhóm", locked: true },
                        { key: "gpmGroup", label: "GPM Group" },
                        { key: "gpmProfileId", label: "GPM Profile ID" },
                        { key: "country", label: "Quốc gia" },
                        { key: "status", label: "Trạng thái" },
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
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${onlineFilter === "ONLINE" ? "bg-emerald-500 shadow-xs shadow-emerald-500/50" : "bg-slate-400 dark:bg-slate-500"}`} />
                  <span>{onlineFilter === "ONLINE" ? "Đang Online" : "Đang Offline"}</span>
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
                return (
                  <div
                    key={acc.id}
                    className={`group relative flex flex-col bg-white dark:bg-slate-900/90 rounded-2xl border transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 overflow-hidden ${isSelected
                      ? "border-pink-500 ring-2 ring-pink-500/20 bg-pink-50/10 dark:bg-pink-950/10 shadow-md"
                      : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs"
                      }`}
                  >
                    {/* Top Bar: Checkbox + Online & Status Badges + Actions */}
                    <div className="p-4 pb-0 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelectRow(acc.id)}
                          aria-label={`Chọn @${acc.username}`}
                        />
                      </div>

                      <div className="flex items-center gap-1.5">
                        <OnlineOfflineBadge
                          isOnline={acc.isOnline}
                          size="sm"
                          className="h-7 px-2.5 text-xs font-bold rounded-full border inline-flex items-center gap-1.5 shadow-2xs"
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
                                className={`h-7 w-auto px-2.5 text-xs font-bold rounded-full border transition-all shadow-2xs cursor-pointer gap-1.5 inline-flex items-center [&>svg]:size-3 [&>svg]:opacity-70 [&>svg]:text-current ${badgeStyle.container}`}
                              >
                                <span className={`w-2 h-2 rounded-full shrink-0 ${badgeStyle.dot}`} />
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
                              className={`h-7 w-auto px-2.5 text-xs font-bold rounded-full border shadow-2xs gap-1.5 inline-flex items-center select-none ${badgeStyle.container}`}
                            >
                              <span className={`w-2 h-2 rounded-full shrink-0 ${badgeStyle.dot}`} />
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
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                  aria-label="Thao tác"
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </button>
                              </DropdownMenuTrigger>
                            </TooltipTrigger>
                            <TooltipContent side="top">Tùy chọn thao tác</TooltipContent>
                          </Tooltip>
                          <DropdownMenuContent align="end" className="w-48 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl p-1.5 shadow-xl">
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
                            {isLeadOrAdmin && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => handleOpenEdit(acc)}
                                  className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                                >
                                  <Pencil className="w-3.5 h-3.5 text-slate-400" />
                                  <span>Chỉnh sửa</span>
                                </DropdownMenuItem>
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
                            <Link
                              href={`/accounts/${acc.id}`}
                              className="font-bold text-sm text-slate-900 dark:text-white hover:text-pink-600 dark:hover:text-pink-400 transition-colors truncate block"
                            >
                              @{acc.username}
                            </Link>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 truncate max-w-[130px]">
                                {acc.groupName || "Chưa phân nhóm"}
                              </span>
                              {acc.alerts && acc.alerts.length > 0 && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 text-xs font-bold border border-amber-200 dark:border-amber-800/50">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  {acc.alerts.length}
                                </span>
                              )}
                            </div>
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
                          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/80">
                            <div className="text-xs text-slate-400 flex items-center gap-1">
                              <Eye className="w-3 h-3" /> Lượt xem
                            </div>
                            <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 truncate">
                              {Number(acc.totalViews || 0).toLocaleString()}
                            </div>
                          </div>
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
                                  ${Number((acc as any).analytics?.totalRevenue ?? acc.totalRevenue ?? 0).toFixed(2)}
                                </div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs p-2.5 space-y-1 bg-slate-900 text-white border-slate-800 shadow-xl">
                              <div className="font-bold text-emerald-400 border-b border-slate-700 pb-1 flex items-center gap-1">
                                <span>Doanh Thu TikTok Studio</span>
                              </div>
                              <div className="flex justify-between gap-4 text-[11px]">
                                <span className="text-slate-400">7 ngày:</span>
                                <span className="font-semibold text-cyan-300">{formatAmount((acc as any).analytics?.revenue7d ?? 0, (acc as any).country)}</span>
                              </div>
                              <div className="flex justify-between gap-4 text-[11px]">
                                <span className="text-slate-400">28 ngày:</span>
                                <span className="font-semibold text-purple-300">{formatAmount((acc as any).analytics?.revenue28d ?? 0, (acc as any).country)}</span>
                              </div>
                              <div className="flex justify-between gap-4 text-[11px]">
                                <span className="text-slate-400">60 ngày:</span>
                                <span className="font-semibold text-indigo-300">{formatAmount((acc as any).analytics?.revenue60d ?? 0, (acc as any).country)}</span>
                              </div>
                              <div className="flex justify-between gap-4 text-[11px]">
                                <span className="text-slate-400">365 ngày:</span>
                                <span className="font-semibold text-amber-300">{formatAmount((acc as any).analytics?.revenue365d ?? 0, (acc as any).country)}</span>
                              </div>
                              <div className="flex justify-between gap-4 text-[11px] pt-1 border-t border-slate-800 font-bold">
                                <span className="text-slate-300">Toàn bộ:</span>
                                <span className="text-emerald-400">{formatAmount((acc as any).analytics?.totalRevenue ?? acc.totalRevenue ?? 0, (acc as any).country)}</span>
                              </div>
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
                        className="text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-pink-600 dark:hover:text-pink-400 transition-colors"
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
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden relative z-0 isolate">
              <div className="overflow-x-auto relative">
                <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300 border-collapse min-w-[1050px]">
                  <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-slate-600 dark:text-slate-300 font-semibold text-xs border-b border-slate-200 dark:border-slate-800 select-none">
                    <tr>
                      {/* Checkbox All (Frozen Left) */}
                      <th className="py-3.5 px-4 w-10 sticky left-0 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-slate-200 dark:after:bg-slate-800">
                        <Checkbox
                          checked={isAllPageSelected}
                          onCheckedChange={(val) => toggleSelectAll(!!val)}
                          aria-label="Chọn tất cả trên trang"
                        />
                      </th>

                      {/* Username & Group (Frozen Left, Locked) */}
                      {visibleColumns.username && (
                        <th
                          onClick={() => handleSort("username")}
                          className="px-5 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white sticky left-10 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs border-r border-slate-200 dark:border-slate-800 after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-slate-200 dark:after:bg-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.03)] min-w-[200px]"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Tài khoản & nhóm</span>
                            {renderSortIndicator("username")}
                          </div>
                        </th>
                      )}

                      {/* GPM Group */}
                      {visibleColumns.gpmGroup && (
                        <th
                          onClick={() => handleSort("groupName")}
                          className="px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white min-w-[130px] whitespace-nowrap"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>GPM Group</span>
                            {renderSortIndicator("groupName")}
                          </div>
                        </th>
                      )}

                      {/* GPM Profile ID */}
                      {visibleColumns.gpmProfileId && (
                        <th
                          onClick={() => handleSort("gpmProfileId")}
                          className="px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white min-w-[160px]"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>GPM Profile ID</span>
                            {renderSortIndicator("gpmProfileId")}
                          </div>
                        </th>
                      )}

                      {/* Country */}
                      {visibleColumns.country && (
                        <th
                          onClick={() => handleSort("country")}
                          className="px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white min-w-[110px]"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Quốc gia</span>
                            {renderSortIndicator("country")}
                          </div>
                        </th>
                      )}

                      {/* Status */}
                      {visibleColumns.status && (
                        <th
                          onClick={() => handleSort("status")}
                          className="px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white min-w-[130px]"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Trạng thái</span>
                            {renderSortIndicator("status")}
                          </div>
                        </th>
                      )}

                      {/* Assigned User */}
                      {visibleColumns.assignedUser && (
                        <th
                          onClick={() => handleSort("assignedUser")}
                          className="px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white min-w-[170px]"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Người phụ trách</span>
                            {renderSortIndicator("assignedUser")}
                          </div>
                        </th>
                      )}

                      {/* Views */}
                      {visibleColumns.totalViews && (
                        <th
                          onClick={() => handleSort("totalViews")}
                          className="px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white min-w-[110px]"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Số views</span>
                            {renderSortIndicator("totalViews")}
                          </div>
                        </th>
                      )}

                      {/* Followers */}
                      {visibleColumns.totalFollowers && (
                        <th
                          onClick={() => handleSort("totalFollowers")}
                          className="px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white min-w-[150px] whitespace-nowrap"
                        >
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <span className="whitespace-nowrap">Số followers</span>
                            {renderSortIndicator("totalFollowers")}
                          </div>
                        </th>
                      )}

                      {/* Video Count */}
                      {visibleColumns.totalVideos && (
                        <th
                          onClick={() => handleSort("totalVideos")}
                          className="px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white min-w-[110px]"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Số video</span>
                            {renderSortIndicator("totalVideos")}
                          </div>
                        </th>
                      )}

                      {/* Revenue */}
                      {visibleColumns.totalRevenue && (
                        <th
                          onClick={() => handleSort("totalRevenue")}
                          className="px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white min-w-[120px]"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Doanh thu</span>
                            {renderSortIndicator("totalRevenue")}
                          </div>
                        </th>
                      )}

                      {/* Alerts */}
                      {visibleColumns.alertsCount && (
                        <th
                          onClick={() => handleSort("alertsCount")}
                          className="px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white min-w-[120px]"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Cảnh báo</span>
                            {renderSortIndicator("alertsCount")}
                          </div>
                        </th>
                      )}

                      {/* Actions (Frozen Right) */}
                      {visibleColumns.actions && (
                        <th className="px-6 py-3.5 text-center whitespace-nowrap sticky right-0 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs border-l border-slate-200 dark:border-slate-800 after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-slate-200 dark:after:bg-slate-800 shadow-[-2px_0_5px_rgba(0,0,0,0.03)] min-w-[110px]">
                          Thao tác
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
                            <td className={`py-3.5 px-4 sticky left-0 z-10 ${rowBgClass} group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors`}>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleSelectRow(acc.id)}
                                aria-label={`Chọn @${acc.username}`}
                              />
                            </td>

                            {/* Username & Group (Frozen Left, Locked) */}
                            {visibleColumns.username && (
                              <td className={`px-5 py-3.5 sticky left-10 z-10 ${rowBgClass} group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.03)]`}>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Link
                                    href={`/accounts/${acc.id}`}
                                    className="font-bold text-slate-900 dark:text-slate-100 hover:text-pink-600 dark:hover:text-pink-400 hover:underline transition-colors flex items-center gap-1.5"
                                  >
                                    <span>@{acc.username}</span>
                                  </Link>
                                  <OnlineOfflineBadge isOnline={acc.isOnline} size="sm" />
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                  <span>{acc.groupName || "Chưa phân nhóm"}</span>
                                </div>
                              </td>
                            )}

                            {/* GPM Group */}
                            {visibleColumns.gpmGroup && (
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                                  {acc.groupName || "--"}
                                </span>
                              </td>
                            )}

                            {/* GPM Profile ID */}
                            {visibleColumns.gpmProfileId && (
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                {acc.gpmProfileId ? (
                                  <div className="inline-flex items-center gap-1.5 h-7.5 bg-cyan-50/80 dark:bg-cyan-950/50 border border-cyan-200/60 dark:border-cyan-800/40 rounded-xl px-2.5 shadow-2xs">
                                    <span
                                      className="font-mono text-xs font-semibold text-cyan-700 dark:text-cyan-300 max-w-[130px] truncate"
                                      title={acc.gpmProfileId}
                                    >
                                      {acc.gpmProfileId}
                                    </span>
                                    {(acc.gpmPort || gpmStatus?.port) && (
                                      <span className="px-1 rounded text-[10px] font-mono font-bold bg-cyan-100/80 dark:bg-cyan-900/60 text-cyan-800 dark:text-cyan-300 border border-cyan-300/40 dark:border-cyan-700/40" title={`Cổng API: ${acc.gpmPort || gpmStatus?.port}`}>
                                        :{acc.gpmPort || gpmStatus?.port}
                                      </span>
                                    )}
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          onClick={() => handleStartGpm(acc.gpmProfileId, acc.gpmPort || gpmStatus?.port)}
                                          disabled={startingGpmId === acc.gpmProfileId || startGpmMutation.isPending}
                                          className="p-1 text-cyan-700 hover:text-cyan-900 dark:text-cyan-300 hover:bg-cyan-100/60 dark:hover:bg-cyan-900/60 rounded-md transition-colors cursor-pointer"
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
                                          className="p-1 -mr-1 text-cyan-600/70 hover:text-cyan-700 dark:text-cyan-400/70 dark:hover:text-cyan-300 hover:bg-cyan-100/60 dark:hover:bg-cyan-900/60 rounded-md transition-colors cursor-pointer"
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
                                  <span className="inline-flex items-center h-7.5 px-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800/60 text-slate-400 text-xs italic bg-slate-50/50 dark:bg-slate-900/50">-- Chưa gán --</span>
                                )}
                              </td>
                            )}

                            {/* Country */}
                            {visibleColumns.country && (
                              <td className="px-4 py-3.5 whitespace-nowrap font-medium text-slate-800 dark:text-slate-200">
                                {getCountryFlag(acc.country)}
                              </td>
                            )}

                            {/* Status Dropdown */}
                            {visibleColumns.status && (
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                {(() => {
                                  const isBanned = acc.status === "BANNED";
                                  const statusElement = isLeadOrAdmin ? (
                                    <Select
                                      value={acc.status}
                                      onValueChange={(val) => handleStatusChange(acc.id, val)}
                                    >
                                      <SelectTrigger className="h-7.5 w-28 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer">
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
                                          <span className="text-[10px] text-rose-500 font-medium truncate max-w-[130px]" title={acc.bannedReason}>
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

                            {/* Assigned Staff */}
                            {visibleColumns.assignedUser && (
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  {isLeadOrAdmin ? (
                                    <Select
                                      value={acc.assignedUserId || "UNASSIGNED"}
                                      onValueChange={(val) =>
                                        handleAssignUser(acc.id, val === "UNASSIGNED" ? "" : val)
                                      }
                                      disabled={!!acc.isAssignmentLocked}
                                    >
                                      <SelectTrigger className="h-7.5 w-40 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer">
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
                                      className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate max-w-36 inline-flex items-center gap-1.5"
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
                              <td className="px-4 py-3.5 whitespace-nowrap font-medium text-slate-800 dark:text-slate-200">
                                <span>{Number(acc.totalViews || 0).toLocaleString()} views</span>
                              </td>
                            )}

                            {/* Total Followers */}
                            {visibleColumns.totalFollowers && (
                              <td className="px-4 py-3.5 whitespace-nowrap font-medium text-slate-800 dark:text-slate-200">
                                <span>{Number(acc.totalFollowers || 0).toLocaleString()} followers</span>
                              </td>
                            )}

                            {/* Total Videos */}
                            {visibleColumns.totalVideos && (
                              <td className="px-4 py-3.5 whitespace-nowrap font-medium text-slate-800 dark:text-slate-200">
                                {acc.totalVideos || 0}
                              </td>
                            )}

                            {/* Total Revenue */}
                            {visibleColumns.totalRevenue && (
                              <td className="px-4 py-3.5 whitespace-nowrap font-bold text-emerald-600 dark:text-emerald-400">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-help border-b border-dotted border-emerald-500/40">
                                      {formatAmount((acc as any).analytics?.sumRevenue?.totalRevenue ?? (acc as any).analytics?.totalRevenue ?? acc.totalRevenue ?? 0, (acc as any).country)}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="text-xs p-2.5 space-y-1 bg-slate-900 text-white border-slate-800 shadow-xl">
                                    <div className="font-bold text-emerald-400 border-b border-slate-700 pb-1">
                                      Doanh Thu TikTok Studio
                                    </div>
                                    <div className="flex justify-between gap-4 text-[11px]">
                                      <span className="text-slate-400">7 ngày:</span>
                                      <span className="font-semibold text-cyan-300">{formatAmount((acc as any).analytics?.sumRevenue?.revenue7d ?? (acc as any).analytics?.revenue7d ?? 0, (acc as any).country)}</span>
                                    </div>
                                    <div className="flex justify-between gap-4 text-[11px]">
                                      <span className="text-slate-400">28 ngày:</span>
                                      <span className="font-semibold text-purple-300">{formatAmount((acc as any).analytics?.sumRevenue?.revenue28d ?? (acc as any).analytics?.revenue28d ?? 0, (acc as any).country)}</span>
                                    </div>
                                    <div className="flex justify-between gap-4 text-[11px]">
                                      <span className="text-slate-400">60 ngày:</span>
                                      <span className="font-semibold text-indigo-300">${Number((acc as any).analytics?.revenue60d ?? 0).toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between gap-4 text-[11px]">
                                      <span className="text-slate-400">365 ngày:</span>
                                      <span className="font-semibold text-amber-300">${Number((acc as any).analytics?.revenue365d ?? 0).toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between gap-4 text-[11px] pt-1 border-t border-slate-800 font-bold">
                                      <span className="text-slate-300">Toàn bộ:</span>
                                      <span className="text-emerald-400">${Number((acc as any).analytics?.totalRevenue ?? acc.totalRevenue ?? 0).toFixed(2)}</span>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </td>
                            )}

                            {/* Alerts / Warnings */}
                            {visibleColumns.alertsCount && (
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                {(() => {
                                  const rawPostRewards = Array.isArray((acc as any).analytics?.postRewards)
                                    ? (acc as any).analytics.postRewards
                                    : Array.isArray(((acc as any).analytics?.postRewards as any)?.items)
                                    ? ((acc as any).analytics?.postRewards as any).items
                                    : [];

                                  const punishedVideos = rawPostRewards.filter((v: any) => v.isPunished);

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
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-800/80 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-all shadow-sm cursor-pointer group"
                                          >
                                            <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 group-hover:scale-110 transition-transform" />
                                            <span>Bị loại khỏi Creator Rewards</span>
                                            {punishedVideos.length > 0 && (
                                              <span className="px-1.5 py-0.2 bg-rose-500 text-white text-[10px] rounded-full font-bold">
                                                +{punishedVideos.length}
                                              </span>
                                            )}
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent
                                          align="start"
                                          className="w-96 p-0 rounded-2xl shadow-2xl border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-900 overflow-hidden z-50 text-xs"
                                        >
                                          <div className="p-3.5 bg-gradient-to-r from-rose-500/15 via-rose-500/10 to-transparent border-b border-rose-200 dark:border-rose-900/40 flex items-start gap-2.5">
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
                                                    Video bị phạt / vi phạm ({punishedVideos.length}):
                                                  </span>
                                                </div>
                                                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                                                  {punishedVideos.map((v: any, vIdx: number) => (
                                                    <div
                                                      key={vIdx}
                                                      className="p-2 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/30 flex items-start gap-2"
                                                    >
                                                      <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                                                      <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-medium text-slate-800 dark:text-slate-200 line-clamp-1" title={v.title}>
                                                          {v.title || `Video #${v.id}`}
                                                        </p>
                                                        <div className="flex items-center gap-2 mt-1">
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
                                                  ))}
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
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <button
                                            type="button"
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-800/80 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-all shadow-sm cursor-pointer group"
                                          >
                                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 group-hover:scale-110 transition-transform" />
                                            <span>{punishedVideos.length} video bị phạt</span>
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent
                                          align="start"
                                          className="w-[400px] p-0 rounded-2xl shadow-2xl border border-amber-200 dark:border-amber-900/60 bg-white dark:bg-slate-900 overflow-hidden z-50 text-xs"
                                        >
                                          <div className="p-3.5 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border-b border-amber-200 dark:border-amber-900/40 flex items-start gap-2.5">
                                            <div className="p-2 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
                                              <AlertTriangle className="w-5 h-5" />
                                            </div>
                                            <div>
                                              <h4 className="font-bold text-amber-900 dark:text-amber-200 text-sm">
                                                {punishedVideos.length} Video Bị Phạt / Huỷ Điều Kiện
                                              </h4>
                                              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                                                Tài khoản @{acc.username} có video không đủ điều kiện nhận thưởng
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

                                                return (
                                                  <div
                                                    key={vIdx}
                                                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 flex items-start gap-2.5 hover:border-amber-300 dark:hover:border-amber-800/80 transition-colors"
                                                  >
                                                    <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 shrink-0 mt-0.5">
                                                      <AlertTriangle className="w-3.5 h-3.5" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                      <p className="text-xs font-semibold text-slate-900 dark:text-white line-clamp-2 leading-relaxed" title={v.title}>
                                                        {v.title || `Video #${v.id}`}
                                                      </p>
                                                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                                        <span
                                                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                                                            isShop
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
                                                          <span className="text-[10px] text-slate-400">
                                                            {v.postDate}
                                                          </span>
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
                                                href={`/accounts/${acc.id}?tab=rewards`}
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
                            )}

                            {/* Actions (Frozen Right, DropdownMenu) */}
                            {visibleColumns.actions && (
                              <td className={`px-6 py-3.5 text-center whitespace-nowrap sticky right-0 z-10 ${rowBgClass} group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors border-l border-slate-200 dark:border-slate-800 shadow-[-2px_0_5px_rgba(0,0,0,0.03)] min-w-[110px]`}>
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

                                      {isLeadOrAdmin && (
                                        <>
                                          <DropdownMenuItem
                                            onClick={() => handleOpenEdit(acc)}
                                            className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                                          >
                                            <Pencil className="w-3.5 h-3.5 text-slate-400" />
                                            <span>Chỉnh sửa thông tin</span>
                                          </DropdownMenuItem>

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
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 px-5 py-3 shadow-2xl shadow-slate-900/10 dark:shadow-black/60 backdrop-blur-md ring-1 ring-slate-100 dark:ring-slate-800 animate-in fade-in slide-in-from-bottom-4 duration-200">
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

          <button
            onClick={() => setIsBulkDeleteOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm active:scale-95 transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Xóa đã chọn ({selectedIds.size})</span>
          </button>
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
                    GPM Profile ID
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">(Chỉ đọc)</span>
                </div>
                <input
                  type="text"
                  readOnly
                  placeholder="Chưa liên kết GPM Profile"
                  value={editGpmId}
                  className="w-full h-9 bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 text-xs font-mono text-slate-500 dark:text-slate-400 cursor-not-allowed select-none focus:outline-none"
                />
              </div>

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

      {/* Modal: Confirm Delete Single Account */}
      {isDeleteOpen && accountToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Xác nhận xóa tài khoản
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Bạn có chắc chắn muốn xóa @{accountToDelete.username}?
                </p>
              </div>
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
                <span>{deleteMutation.isPending ? "Đang xóa..." : "Xác nhận xóa"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Bulk Delete */}
      {isBulkDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Xác nhận xóa hàng loạt
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Bạn có chắc chắn muốn xóa {selectedIds.size} tài khoản đã chọn?
                </p>
              </div>
            </div>

            <div className="bg-rose-50/60 dark:bg-rose-950/30 rounded-2xl p-4 border border-rose-200/60 dark:border-rose-800/60 text-xs text-rose-800 dark:text-rose-300">
              ⚠️ Toàn bộ dữ liệu số liệu và liên kết của {selectedIds.size} tài khoản này sẽ bị xóa vĩnh viễn.
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
                <span>{bulkDeleteMutation.isPending ? "Đang xóa..." : `Xác nhận xóa (${selectedIds.size})`}</span>
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
                    alert("Chỉ Quản trị viên và Quản lý mới có quyền phân công nhân sự.");
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
