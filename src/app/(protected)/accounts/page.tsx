"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
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
} from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";

type AccountSortKey =
  | "username"
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

export default function AccountsPage() {
  // Fast filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<any>("ALL");
  const [countryFilter, setCountryFilter] = useState("ALL");
  const [assignedFilter, setAssignedFilter] = useState("ALL");

  // Advanced filters
  const [warningFilter, setWarningFilter] = useState<"ALL" | "HAS_WARNING" | "NO_WARNING">("ALL");
  const [gpmFilter, setGpmFilter] = useState<"ALL" | "LINKED" | "UNLINKED">("ALL");
  const [minViews, setMinViews] = useState<string>("");
  const [minRevenue, setMinRevenue] = useState<string>("");

  // Sorting
  const [sortConfig, setSortConfig] = useState<{ key: AccountSortKey; desc: boolean }>({
    key: "updatedAt",
    desc: true,
  });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Column visibility state (username is locked and cannot be unchecked)
  const [visibleColumns, setVisibleColumns] = useState({
    username: true,
    gpmProfileId: true,
    country: true,
    status: true,
    assignedUser: true,
    totalViews: true,
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

  // Form states
  const [newUsername, setNewUsername] = useState("");
  const [newCountry, setNewCountry] = useState("US");
  const [newGroup, setNewGroup] = useState("Team US");
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
    country: countryFilter !== "ALL" ? countryFilter : undefined,
    assignedUserId: assignedFilter !== "ALL" ? assignedFilter : undefined,
  });

  const { data: users = [] } = trpc.user.listStaff.useQuery();

  const accounts = accountsData?.items || [];
  const stats = accountsData?.stats;

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

  const startGpmMutation = trpc.gpm.startProfile.useMutation({
    onSuccess: () => {
      setActionMsg("🚀 Đã mở trình duyệt GPM profile!");
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => alert(err.message),
  });

  const handleStartGpm = (gpmProfileId: string) => {
    startGpmMutation.mutate({ gpmProfileId });
  };

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newGpmId.trim()) return;
    createMutation.mutate({
      username: newUsername.trim(),
      country: newCountry,
      groupName: newGroup || null,
      gpmProfileId: newGpmId.trim(),
      assignedUserId: newAssignedUser || null,
    });
  };

  const handleStatusChange = (accountId: string, newStatus: any) => {
    updateMutation.mutate({ id: accountId, status: newStatus });
  };

  const handleAssignUser = (accountId: string, userId: string) => {
    updateMutation.mutate({ id: accountId, assignedUserId: userId || null });
  };

  const handleOpenEdit = (acc: any) => {
    setEditId(acc.id);
    setEditUsername(acc.username);
    setEditCountry(acc.country || "US");
    setEditGroup(acc.groupName || "");
    setEditGpmId(acc.gpmProfileId || "");
    setEditAssignedUser(acc.assignedUserId || "");
    setIsEditOpen(true);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editGpmId.trim()) return;
    updateMutation.mutate({
      id: editId,
      country: editCountry,
      groupName: editGroup || null,
      gpmProfileId: editGpmId.trim(),
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
      const matchSearch =
        !s ||
        acc.username.toLowerCase().includes(s) ||
        (acc.groupName && acc.groupName.toLowerCase().includes(s));

      const matchStatus = statusFilter === "ALL" || acc.status === statusFilter;
      const matchCountry = countryFilter === "ALL" || acc.country === countryFilter;
      const matchAssigned = assignedFilter === "ALL" || acc.assignedUserId === assignedFilter;

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

      const revNum = Number(acc.totalRevenue || 0);
      const matchMinRev = !minRevenue || revNum >= Number(minRevenue);

      return (
        matchSearch &&
        matchStatus &&
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
      } else if (sortConfig.key === "totalViews" || sortConfig.key === "totalFollowers" || sortConfig.key === "totalVideos" || sortConfig.key === "totalRevenue") {
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
    (warningFilter !== "ALL" ? 1 : 0) +
    (gpmFilter !== "ALL" ? 1 : 0) +
    (minViews ? 1 : 0) +
    (minRevenue ? 1 : 0);

  const totalActiveFiltersCount =
    (search ? 1 : 0) +
    (statusFilter !== "ALL" ? 1 : 0) +
    (countryFilter !== "ALL" ? 1 : 0) +
    (assignedFilter !== "ALL" ? 1 : 0) +
    activeAdvancedCount;

  const clearAllFilters = () => {
    setSearch("");
    setStatusFilter("ALL");
    setCountryFilter("ALL");
    setAssignedFilter("ALL");
    setWarningFilter("ALL");
    setGpmFilter("ALL");
    setMinViews("");
    setMinRevenue("");
    setPage(1);
  };

  const getCountryFlag = (country: string) => {
    const code = (country || "US").toUpperCase();
    switch (code) {
      case "US":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
            <span className="text-[11px]">🇺🇸</span> US
          </span>
        );
      case "UK":
      case "GB":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50">
            <span className="text-[11px]">🇬🇧</span> UK
          </span>
        );
      case "VN":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300 border border-red-200 dark:border-red-800/50">
            <span className="text-[11px]">🇻🇳</span> VN
          </span>
        );
      case "DE":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
            <span className="text-[11px]">🇩🇪</span> DE
          </span>
        );
      case "FR":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 border border-sky-200 dark:border-sky-800/50">
            <span className="text-[11px]">🇫🇷</span> FR
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <Globe className="w-3 h-3 text-slate-500" /> {code}
          </span>
        );
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
      {/* Sticky Header Section */}
      <div className="sticky top-16 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-md pt-2 pb-3 -mt-2 space-y-4">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-6 h-6 text-pink-500" />
              Quản Lý Dàn Tài Khoản TikTok ({accounts.length})
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Theo dõi trạng thái, phân công nhân sự, quản lý cảnh báo và đồng bộ số liệu qua GPM-Login.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white shadow-lg shadow-pink-600/30 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Tài Khoản</span>
            </button>
          </div>
        </div>

        {actionMsg && (
          <div className="p-3.5 rounded-xl bg-cyan-50 dark:bg-slate-900 border border-cyan-200 dark:border-slate-800 text-xs font-bold text-center text-cyan-800 dark:text-cyan-300 shadow-sm animate-in fade-in">
            {actionMsg}
          </div>
        )}

        {/* KPI Stats Bar */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Tổng Số Acc</div>
              <div className="text-xl font-black text-slate-900 dark:text-white mt-1">{stats.total}</div>
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" /> Hoạt Động (Active)
              </div>
              <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{stats.active}</div>
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <Flame className="w-3.5 h-3.5" /> Nuôi Acc (Warming)
              </div>
              <div className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1">{stats.warming}</div>
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Hạn Chế (Restricted)
              </div>
              <div className="text-xl font-black text-orange-600 dark:text-orange-400 mt-1">{stats.restricted}</div>
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" /> Bị Khóa (Banned)
              </div>
              <div className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1">{stats.banned}</div>
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="text-[11px] font-semibold text-pink-600 dark:text-pink-400">Doanh Thu Toàn Dàn</div>
              <div className="text-xl font-black text-pink-600 dark:text-pink-400 mt-1">${stats.totalRevenue.toLocaleString()}</div>
            </div>
          </div>
        )}

        {/* Filter & Toolbar Area */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex flex-col lg:flex-row gap-3 items-center justify-between">
            {/* Search Box */}
            <div className="relative w-full lg:w-72">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm username, nickname, email..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full h-9 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-4 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-pink-500"
              />
            </div>

            {/* Filter Group: 3 fast selections + Advanced Filter + Sort Popover */}
            <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-end">
              {/* Status Fast Filter */}
              <Select
                value={statusFilter}
                onValueChange={(val) => {
                  setStatusFilter(val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-36 h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer">
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

              {/* Country Fast Filter */}
              <Select
                value={countryFilter}
                onValueChange={(val) => {
                  setCountryFilter(val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-36 h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer">
                  <SelectValue placeholder="Quốc gia" />
                </SelectTrigger>
                <SelectContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
                  <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">Tất cả quốc gia</SelectItem>
                  <SelectItem value="US" className="text-xs font-normal cursor-pointer">🇺🇸 US</SelectItem>
                  <SelectItem value="UK" className="text-xs font-normal cursor-pointer">🇬🇧 UK</SelectItem>
                  <SelectItem value="VN" className="text-xs font-normal cursor-pointer">🇻🇳 VN</SelectItem>
                  <SelectItem value="DE" className="text-xs font-normal cursor-pointer">🇩🇪 DE</SelectItem>
                  <SelectItem value="FR" className="text-xs font-normal cursor-pointer">🇫🇷 FR</SelectItem>
                </SelectContent>
              </Select>

              {/* Assigned Staff Fast Filter */}
              <Select
                value={assignedFilter}
                onValueChange={(val) => {
                  setAssignedFilter(val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-40 h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer">
                  <SelectValue placeholder="Nhân sự" />
                </SelectTrigger>
                <SelectContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-60">
                  <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">Tất cả nhân sự</SelectItem>
                  {users.map((u: any) => (
                    <SelectItem key={u.id} value={u.id} className="text-xs font-normal cursor-pointer">
                      {u.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Advanced Filter Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={`h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl text-xs font-normal border transition-all cursor-pointer ${
                      activeAdvancedCount > 0
                        ? "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800"
                        : "bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900"
                    }`}
                  >
                    <Filter className="w-3.5 h-3.5" />
                    <span>Bộ lọc nâng cao</span>
                    {activeAdvancedCount > 0 && (
                      <span className="w-4 h-4 rounded-full bg-purple-600 text-white text-[10px] font-bold flex items-center justify-center">
                        {activeAdvancedCount}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl space-y-3.5">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">Bộ lọc chi tiết</h4>
                    {activeAdvancedCount > 0 && (
                      <button
                        onClick={() => {
                          setWarningFilter("ALL");
                          setGpmFilter("ALL");
                          setMinViews("");
                          setMinRevenue("");
                          setPage(1);
                        }}
                        className="text-[11px] font-semibold text-pink-600 hover:underline cursor-pointer"
                      >
                        Đặt lại
                      </button>
                    )}
                  </div>

                  {/* Cảnh báo vi phạm */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Cảnh báo vi phạm
                    </label>
                    <Select
                      value={warningFilter}
                      onValueChange={(val) => {
                        setWarningFilter(val as any);
                        setPage(1);
                      }}
                    >
                      <SelectTrigger className="w-full h-8.5 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer">
                        <SelectValue placeholder="Tất cả" />
                      </SelectTrigger>
                      <SelectContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
                        <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">Tất cả</SelectItem>
                        <SelectItem value="HAS_WARNING" className="text-xs font-normal cursor-pointer">Có cảnh báo vi phạm</SelectItem>
                        <SelectItem value="CLEAN" className="text-xs font-normal cursor-pointer">Sạch sẽ (Không cảnh báo)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Đồng bộ GPM-Login */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Đồng bộ GPM-Login
                    </label>
                    <Select
                      value={gpmFilter}
                      onValueChange={(val) => {
                        setGpmFilter(val as any);
                        setPage(1);
                      }}
                    >
                      <SelectTrigger className="w-full h-8.5 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer">
                        <SelectValue placeholder="Tất cả" />
                      </SelectTrigger>
                      <SelectContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
                        <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">Tất cả</SelectItem>
                        <SelectItem value="LINKED" className="text-xs font-normal cursor-pointer">Đã liên kết Profile GPM</SelectItem>
                        <SelectItem value="NOT_LINKED" className="text-xs font-normal cursor-pointer">Chưa liên kết Profile GPM</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Lượt xem tối thiểu */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
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
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
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

              {/* Sort Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl text-xs font-normal bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 transition-all cursor-pointer"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                    <span>Sắp xếp</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl space-y-2">
                  <div className="text-xs font-bold text-slate-900 dark:text-white pb-1 border-b border-slate-100 dark:border-slate-800">
                    Sắp xếp theo cột
                  </div>
                  {[
                    { key: "totalRevenue", label: "Doanh thu" },
                    { key: "totalViews", label: "Lượt xem" },
                    { key: "totalFollowers", label: "Lượt theo dõi" },
                    { key: "totalVideos", label: "Số lượng video" },
                    { key: "username", label: "Tên tài khoản" },
                    { key: "gpmProfileId", label: "GPM Profile ID" },
                    { key: "country", label: "Quốc gia" },
                    { key: "status", label: "Trạng thái" },
                    { key: "updatedAt", label: "Thời gian cập nhật" },
                  ].map((item) => (
                    <button
                      key={item.key}
                      onClick={() => handleSort(item.key as AccountSortKey)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-normal text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <span>{item.label}</span>
                      {sortConfig.key === item.key && (
                        <span className="text-[11px] font-bold text-pink-600 dark:text-pink-400">
                          {sortConfig.desc ? "Giảm dần ↓" : "Tăng dần ↑"}
                        </span>
                      )}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>

              {/* Column Visibility Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="flex items-center gap-1.5 h-9 px-3 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 shadow-none cursor-pointer"
                    title="Tùy chỉnh cột hiển thị"
                  >
                    <Columns3 className="w-3.5 h-3.5 text-slate-500" />
                    <span>Cột hiển thị</span>
                  </button>
                </PopoverTrigger>
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
                          gpmProfileId: true,
                          country: true,
                          status: true,
                          assignedUser: true,
                          totalViews: true,
                          totalVideos: true,
                          totalRevenue: true,
                          alertsCount: true,
                          actions: true,
                        })
                      }
                      className="text-[10px] text-pink-500 hover:underline font-normal cursor-pointer"
                    >
                      Mặc định
                    </button>
                  </div>
                  <div className="space-y-1 pt-1 max-h-64 overflow-y-auto pr-1">
                    {[
                      { key: "username", label: "Tài khoản & nhóm", locked: true },
                      { key: "gpmProfileId", label: "GPM Profile ID" },
                      { key: "country", label: "Quốc gia" },
                      { key: "status", label: "Trạng thái" },
                      { key: "assignedUser", label: "Người phụ trách" },
                      { key: "totalViews", label: "Views / Follow" },
                      { key: "totalVideos", label: "Số video" },
                      { key: "totalRevenue", label: "Doanh thu" },
                      { key: "alertsCount", label: "Cảnh báo" },
                      { key: "actions", label: "Thao tác" },
                    ].map((col) => (
                      <label
                        key={col.key}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none ${
                          col.locked ? "opacity-70 cursor-not-allowed" : "cursor-pointer"
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
                        <span className="text-slate-700 dark:text-slate-300 font-medium">
                          {col.label}
                        </span>
                        {col.locked && (
                          <span className="text-[10px] text-slate-400 ml-auto font-normal">
                            (Bắt buộc)
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Active Filter Chips */}
          {totalActiveFiltersCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
              {search && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  <span>Tìm: {search}</span>
                  <button onClick={() => setSearch("")} className="hover:text-rose-500 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {statusFilter !== "ALL" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300">
                  <span>Trạng thái: {statusFilter}</span>
                  <button onClick={() => setStatusFilter("ALL")} className="hover:text-rose-500 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {countryFilter !== "ALL" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300">
                  <span>Quốc gia: {countryFilter}</span>
                  <button onClick={() => setCountryFilter("ALL")} className="hover:text-rose-500 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {assignedFilter !== "ALL" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300">
                  <span>Nhân sự: {users.find((u: any) => u.id === assignedFilter)?.fullName || assignedFilter}</span>
                  <button onClick={() => setAssignedFilter("ALL")} className="hover:text-rose-500 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {warningFilter !== "ALL" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                  <span>{warningFilter === "HAS_WARNING" ? "Có cảnh báo" : "Không có cảnh báo"}</span>
                  <button onClick={() => setWarningFilter("ALL")} className="hover:text-rose-500 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {gpmFilter !== "ALL" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
                  <span>{gpmFilter === "LINKED" ? "GPM Linked" : "Chưa gắn GPM"}</span>
                  <button onClick={() => setGpmFilter("ALL")} className="hover:text-rose-500 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {minViews && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  <span>Views ≥ {Number(minViews).toLocaleString()}</span>
                  <button onClick={() => setMinViews("")} className="hover:text-rose-500 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {minRevenue && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                  <span>Doanh thu ≥ ${minRevenue}</span>
                  <button onClick={() => setMinRevenue("")} className="hover:text-rose-500 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              <button
                onClick={clearAllFilters}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white underline cursor-pointer ml-1"
              >
                Xóa tất cả
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Table Container */}
      {loading ? (
        <DataTableSkeleton columnCount={visibleColumnCount} rowCount={pageSize} />
      ) : (
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden relative z-0 isolate">
          <div className="overflow-x-auto relative">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300 border-collapse">
              <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-slate-600 dark:text-slate-300 font-semibold text-xs border-b border-slate-200 dark:border-slate-800 select-none">
                <tr>
                  {/* Checkbox All (Frozen Left) */}
                  <th className="py-3.5 px-4 w-10 sticky left-0 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs">
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
                      className="px-5 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white sticky left-10 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.03)] min-w-[200px]"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Tài khoản & nhóm</span>
                        {renderSortIndicator("username")}
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

                  {/* Views / Follow */}
                  {visibleColumns.totalViews && (
                    <th
                      onClick={() => handleSort("totalViews")}
                      className="px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white min-w-[130px]"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Views / Follow</span>
                        {renderSortIndicator("totalViews")}
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
                    <th className="px-6 py-3.5 text-center whitespace-nowrap sticky right-0 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs border-l border-slate-200 dark:border-slate-800 shadow-[-2px_0_5px_rgba(0,0,0,0.03)] min-w-[110px]">
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
                        className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 group ${
                          isSelected ? "bg-pink-50/40 dark:bg-pink-950/20" : ""
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
                            <Link
                              href={`/accounts/${acc.id}`}
                              className="font-bold text-slate-900 dark:text-slate-100 hover:text-pink-600 dark:hover:text-pink-400 hover:underline transition-colors flex items-center gap-1.5"
                            >
                              <span>@{acc.username}</span>
                            </Link>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              <span>{acc.groupName || "Chưa phân nhóm"}</span>
                            </div>
                          </td>
                        )}

                        {/* GPM Profile ID */}
                        {visibleColumns.gpmProfileId && (
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {acc.gpmProfileId ? (
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="font-mono text-[11px] text-cyan-700 dark:text-cyan-300 bg-cyan-50/80 dark:bg-cyan-950/50 px-2 py-0.5 rounded-lg border border-cyan-200/60 dark:border-cyan-800/40 max-w-[130px] truncate inline-block"
                                  title={acc.gpmProfileId}
                                >
                                  {acc.gpmProfileId}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(acc.gpmProfileId);
                                    setActionMsg(`📋 Đã copy GPM ID: ${acc.gpmProfileId}`);
                                    setTimeout(() => setActionMsg(null), 3000);
                                  }}
                                  className="p-1 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 rounded transition-colors cursor-pointer"
                                  title="Copy GPM Profile ID"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px] italic">-- Chưa gán --</span>
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
                          </td>
                        )}

                        {/* Assigned Staff */}
                        {visibleColumns.assignedUser && (
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <Select
                              value={acc.assignedUserId || "UNASSIGNED"}
                              onValueChange={(val) => handleAssignUser(acc.id, val === "UNASSIGNED" ? "" : val)}
                            >
                              <SelectTrigger className="h-7.5 w-36 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer">
                                <SelectValue placeholder="-- Chưa gán --">
                                  {acc.assignedUser ? acc.assignedUser.fullName : "-- Chưa gán --"}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent align="start" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-56">
                                <SelectItem value="UNASSIGNED" className="text-xs font-normal cursor-pointer text-slate-400">
                                  -- Chưa gán --
                                </SelectItem>
                                {users.map((u: any) => (
                                  <SelectItem key={u.id} value={u.id} className="text-xs font-normal cursor-pointer">
                                    {u.fullName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                        )}

                        {/* Views / Followers */}
                        {visibleColumns.totalViews && (
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="font-bold text-slate-900 dark:text-slate-200">
                              {Number(acc.totalViews || 0).toLocaleString()} <span className="text-[10px] text-slate-500 dark:text-slate-400">views</span>
                            </div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-400">
                              {Number(acc.totalFollowers || 0).toLocaleString()} follow
                            </div>
                          </td>
                        )}

                        {/* Video Count */}
                        {visibleColumns.totalVideos && (
                          <td className="px-4 py-3.5 whitespace-nowrap font-semibold text-slate-700 dark:text-slate-300">
                            {acc.totalVideos} videos
                          </td>
                        )}

                        {/* Revenue */}
                        {visibleColumns.totalRevenue && (
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="font-bold text-amber-600 dark:text-amber-300">
                              ${Number(acc.totalRevenue || 0).toFixed(2)}
                            </div>
                          </td>
                        )}

                        {/* Alerts */}
                        {visibleColumns.alertsCount && (
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {acc.alerts && acc.alerts.length > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900">
                                <AlertTriangle className="w-3 h-3" /> {acc.alerts.length} cảnh báo
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">Bình thường</span>
                            )}
                          </td>
                        )}

                        {/* Actions (More Dropdown, Frozen Right) */}
                        {visibleColumns.actions && (
                          <td className={`px-6 py-3.5 text-center whitespace-nowrap sticky right-0 z-10 ${rowBgClass} group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors border-l border-slate-200 dark:border-slate-800 shadow-[-2px_0_5px_rgba(0,0,0,0.03)] min-w-[110px]`}>
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Quick Play GPM */}
                              {acc.gpmProfileId && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={() => handleStartGpm(acc.gpmProfileId)}
                                      className="p-1.5 rounded-lg text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 transition-colors cursor-pointer"
                                      aria-label="Mở trình duyệt GPM"
                                    >
                                      <Play className="w-3.5 h-3.5 fill-cyan-600" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-[11px] font-semibold">
                                    Mở GPMLogin
                                  </TooltipContent>
                                </Tooltip>
                              )}

                              {/* More Actions Dropdown Menu */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                    aria-label="Thao tác khác"
                                  >
                                    <MoreHorizontal className="w-4 h-4" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-1.5 shadow-xl">
                                  <DropdownMenuItem asChild>
                                    <Link
                                      href={`/accounts/${acc.id}`}
                                      className="flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                                    >
                                      <Eye className="w-3.5 h-3.5 text-slate-400" />
                                      <span>Xem chi tiết</span>
                                    </Link>
                                  </DropdownMenuItem>

                                  {acc.gpmProfileId && (
                                    <DropdownMenuItem
                                      onClick={() => handleStartGpm(acc.gpmProfileId)}
                                      className="flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 rounded-xl cursor-pointer"
                                    >
                                      <Play className="w-3.5 h-3.5 fill-cyan-500" />
                                      <span>Mở GPM-Login</span>
                                    </DropdownMenuItem>
                                  )}

                                  <DropdownMenuItem
                                    onClick={() => syncMutation.mutate({ accountId: acc.id })}
                                    disabled={syncMutation.isPending}
                                    className="flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                                  >
                                    <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                                    <span>Đồng bộ số liệu</span>
                                  </DropdownMenuItem>

                                  <DropdownMenuItem
                                    onClick={() => handleOpenLogs(acc)}
                                    className="flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                                  >
                                    <History className="w-3.5 h-3.5 text-slate-400" />
                                    <span>Lịch sử hoạt động</span>
                                  </DropdownMenuItem>

                                  <DropdownMenuItem
                                    onClick={() => handleOpenEdit(acc)}
                                    className="flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
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
                                    className="flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                    <span>Xóa tài khoản</span>
                                  </DropdownMenuItem>
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

          {/* Pagination */}
          <div className="p-4 border-t border-slate-100 dark:border-slate-800/80">
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

          <button
            onClick={() => setIsBulkStatusOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-all cursor-pointer"
          >
            <span>Đổi trạng thái</span>
          </button>

          <button
            onClick={() => setIsBulkAssignOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-all cursor-pointer"
          >
            <span>Gán nhân sự</span>
          </button>

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
                  Username * (không cần @)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. dailyvibes_us"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-pink-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Quốc Gia
                  </label>
                  <Select value={newCountry} onValueChange={setNewCountry}>
                    <SelectTrigger className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white cursor-pointer">
                      <SelectValue placeholder="Chọn quốc gia" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      <SelectItem value="US" className="text-xs cursor-pointer">🇺🇸 US (Mỹ)</SelectItem>
                      <SelectItem value="UK" className="text-xs cursor-pointer">🇬🇧 UK (Anh)</SelectItem>
                      <SelectItem value="VN" className="text-xs cursor-pointer">🇻🇳 VN (Việt Nam)</SelectItem>
                      <SelectItem value="DE" className="text-xs cursor-pointer">🇩🇪 DE (Đức)</SelectItem>
                      <SelectItem value="FR" className="text-xs cursor-pointer">🇫🇷 FR (Pháp)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Group / Nhóm
                  </label>
                  <input
                    type="text"
                    placeholder="Team US #1"
                    value={newGroup}
                    onChange={(e) => setNewGroup(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  GPM Profile ID * (Bắt buộc để sync số liệu & tự động chấm công)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                  value={newGpmId}
                  onChange={(e) => setNewGpmId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-cyan-700 dark:text-cyan-300 focus:outline-none focus:border-pink-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Phân Công Nhân Sự Phụ Trách
                </label>
                <Select value={newAssignedUser || "UNASSIGNED"} onValueChange={(val) => setNewAssignedUser(val === "UNASSIGNED" ? "" : val)}>
                  <SelectTrigger className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white cursor-pointer">
                    <SelectValue placeholder="-- Chưa phân công --" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl max-h-60">
                    <SelectItem value="UNASSIGNED" className="text-xs text-slate-400 cursor-pointer">
                      -- Chưa phân công --
                    </SelectItem>
                    {users.map((u: any) => (
                      <SelectItem key={u.id} value={u.id} className="text-xs cursor-pointer">
                        {u.fullName} ({u.role})
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
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Quốc Gia
                  </label>
                  <Select value={editCountry} onValueChange={setEditCountry}>
                    <SelectTrigger className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white cursor-pointer">
                      <SelectValue placeholder="Chọn quốc gia" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      <SelectItem value="US" className="text-xs cursor-pointer">🇺🇸 US (Mỹ)</SelectItem>
                      <SelectItem value="UK" className="text-xs cursor-pointer">🇬🇧 UK (Anh)</SelectItem>
                      <SelectItem value="VN" className="text-xs cursor-pointer">🇻🇳 VN (Việt Nam)</SelectItem>
                      <SelectItem value="DE" className="text-xs cursor-pointer">🇩🇪 DE (Đức)</SelectItem>
                      <SelectItem value="FR" className="text-xs cursor-pointer">🇫🇷 FR (Pháp)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Group / Nhóm
                  </label>
                  <input
                    type="text"
                    value={editGroup}
                    onChange={(e) => setEditGroup(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  GPM Profile ID * (Bắt buộc)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                  value={editGpmId}
                  onChange={(e) => setEditGpmId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-cyan-700 dark:text-cyan-300 focus:outline-none focus:border-pink-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Phân Công Nhân Sự
                </label>
                <Select value={editAssignedUser || "UNASSIGNED"} onValueChange={(val) => setEditAssignedUser(val === "UNASSIGNED" ? "" : val)}>
                  <SelectTrigger className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white cursor-pointer">
                    <SelectValue placeholder="-- Chưa phân công --" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl max-h-60">
                    <SelectItem value="UNASSIGNED" className="text-xs text-slate-400 cursor-pointer">
                      -- Chưa phân công --
                    </SelectItem>
                    {users.map((u: any) => (
                      <SelectItem key={u.id} value={u.id} className="text-xs cursor-pointer">
                        {u.fullName} ({u.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
      {isBulkAssignOpen && (
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
                      {u.fullName} ({u.role})
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
                disabled={bulkAssignMutation.isPending}
                onClick={() => {
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
              {selectedAccount.logs && selectedAccount.logs.length > 0 ? (
                selectedAccount.logs.map((log: any) => (
                  <div
                    key={log.id}
                    className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 dark:text-slate-200">{log.logType}</span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(log.createdAt).toLocaleString("vi-VN")}
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-400">{log.message}</p>
                    <div className="text-[10px] text-slate-400">Thực hiện bởi: {log.actorName}</div>
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
