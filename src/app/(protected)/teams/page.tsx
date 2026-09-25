"use client";

import { useState, useMemo, useEffect, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useUrlParams } from "@/hooks/useUrlState";
import { useSession } from "next-auth/react";
import {
  Layers,
  Plus,
  Search,
  Users,
  Shield,
  ShieldCheck,
  UserCheck,
  Trash2,
  Pencil,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Crown,
  CheckSquare,
  Square,
  Sparkles,
  Palette,
  UserPlus,
  X,
  AlertTriangle,
  SlidersHorizontal,
  Columns3,
  MoreHorizontal,
  LayoutGrid,
  List,
  ArrowRight,
} from "lucide-react";
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
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  optimisticallyUpdateUserTeam,
  optimisticallyUpdateTeam,
  optimisticallyBulkAssignTeamLeader,
  optimisticallyBulkChangeTeamColor,
  optimisticallyDeleteTeams,
  snapshotUserTeamQueries,
  rollbackUserTeamQueries,
} from "@/utils/optimisticUsersTeams";
import { useTableColumnResize } from "@/hooks/useTableColumnResize";
import { smartSearchMatch } from "@/utils/search";

const TEAM_COLUMN_RESIZE_CONFIG = {
  name: { minWidth: 180, maxWidth: 450, defaultWidth: 220 },
  createdBy: { minWidth: 140, maxWidth: 280, defaultWidth: 160 },
  createdAt: { minWidth: 120, maxWidth: 240, defaultWidth: 150 },
  leader: { minWidth: 180, maxWidth: 320, defaultWidth: 210 },
  members: { minWidth: 180, maxWidth: 400, defaultWidth: 220 },
  totalAccounts: { minWidth: 130, maxWidth: 260, defaultWidth: 160 },
  actions: { minWidth: 100, maxWidth: 220, defaultWidth: 120 },
} as const;

type TeamSortKey = "name" | "membersCount" | "totalAccounts" | "createdAt";

const TEAM_SORT_OPTIONS: Array<{ key: TeamSortKey; label: string }> = [
  { key: "name", label: "Tên đội nhóm" },
  { key: "membersCount", label: "Số lượng thành viên" },
  { key: "totalAccounts", label: "Số account phụ trách" },
  { key: "createdAt", label: "Thời gian tạo" },
];

const COLOR_OPTIONS = [
  { value: "pink", label: "Hồng Neon", class: "bg-pink-500", text: "text-pink-500", border: "border-pink-500/30", bgLight: "bg-pink-500/10" },
  { value: "cyan", label: "Xanh Cyan", class: "bg-cyan-500", text: "text-cyan-500", border: "border-cyan-500/30", bgLight: "bg-cyan-500/10" },
  { value: "emerald", label: "Xanh Lá", class: "bg-emerald-500", text: "text-emerald-500", border: "border-emerald-500/30", bgLight: "bg-emerald-500/10" },
  { value: "violet", label: "Tím Violet", class: "bg-violet-500", text: "text-violet-500", border: "border-violet-500/30", bgLight: "bg-violet-500/10" },
  { value: "amber", label: "Cam Amber", class: "bg-amber-500", text: "text-amber-500", border: "border-amber-500/30", bgLight: "bg-amber-500/10" },
  { value: "indigo", label: "Xanh Indigo", class: "bg-indigo-500", text: "text-indigo-500", border: "border-indigo-500/30", bgLight: "bg-indigo-500/10" },
];

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
    <span className={`${size} rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 text-white font-bold flex items-center justify-center shrink-0 uppercase select-none`}>
      {displayName.slice(0, 2)}
    </span>
  );
};

function TeamsManagementContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // SaaS URL Query State Synchronization
  const { updateUrlParams } = useUrlParams();

  // View Mode: read initial value from URL Search Params ("v" or "view")
  const initialViewMode = ((searchParams?.get("v") || searchParams?.get("view")) === "list" ? "list" : "grid") as "grid" | "list";
  const [viewMode, setViewMode] = useState<"grid" | "list">(initialViewMode);

  const initialSearch = searchParams?.get("q") || searchParams?.get("search") || "";
  const [search, setSearch] = useState(initialSearch);

  const initialSortKey = (searchParams?.get("sort") || searchParams?.get("sortBy") || "createdAt") as TeamSortKey;
  const initialSortDesc = (searchParams?.get("dir") || searchParams?.get("sortOrder")) === "asc" ? false : true;
  const [sortConfig, setSortConfig] = useState<{ key: TeamSortKey; desc: boolean }>({
    key: initialSortKey,
    desc: initialSortDesc,
  });

  // SaaS URL sync: automatically keep URL in sync without reloading
  useEffect(() => {
    updateUrlParams(
      {
        v: viewMode,
        q: search,
        sort: sortConfig.key,
        dir: sortConfig.desc ? "desc" : "asc",
      },
      {
        v: "grid",
        q: "",
        sort: "createdAt",
        dir: "desc",
      }
    );
  }, [viewMode, search, sortConfig, updateUrlParams]);

  const handleViewModeChange = (mode: "grid" | "list") => {
    setViewMode(mode);
  };

  const { data: session, status } = useSession();
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const isLead = (session?.user as any)?.role === "LEAD";
  const ledTeamId = (session?.user as any)?.ledTeam?.id;

  useEffect(() => {
    if (status !== "loading") {
      if (!isAdmin && !isLead) {
        router.replace("/accounts");
      } else if (isLead && ledTeamId) {
        router.replace(`/teams/${ledTeamId}`);
      }
    }
  }, [status, isAdmin, isLead, ledTeamId, router]);

  const currentSortOption = useMemo(() => {
    return TEAM_SORT_OPTIONS.find((opt) => opt.key === sortConfig.key) || { key: sortConfig.key, label: "Mặc định" };
  }, [sortConfig.key]);

  const sortDirectionText = sortConfig.desc ? "Giảm dần" : "Tăng dần";

  // Column visibility state (name is locked and cannot be unchecked)
  const [visibleColumns, setVisibleColumns] = useState({
    name: true,
    createdBy: true,
    createdAt: true,
    leader: true,
    members: true,
    totalAccounts: true,
    actions: true,
  });

  const visibleColumnCount = useMemo(() => {
    return (isAdmin ? 1 : 0) + 1 /* # column */ + Object.values(visibleColumns).filter(Boolean).length;
  }, [visibleColumns, isAdmin]);

  const visibleResizeKeys = useMemo(
    () =>
      (Object.keys(TEAM_COLUMN_RESIZE_CONFIG) as Array<keyof typeof TEAM_COLUMN_RESIZE_CONFIG>).filter(
        (key) => visibleColumns[key]
      ),
    [visibleColumns]
  );

  const tableRef = useRef<HTMLDivElement>(null);
  const { getColumnStyle, getTableVars, renderResizeHandle } = useTableColumnResize({
    tableId: "teams_v2",
    columns: TEAM_COLUMN_RESIZE_CONFIG,
    tableRef,
    visibleKeys: visibleResizeKeys,
    extraWidth: isAdmin ? 80 : 40, // checkbox (admin) + # column
  });

  // Action feedback message
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Bulk Selection State
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);

  // Modals: Single Actions
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newColor, setNewColor] = useState("pink");
  const [newLeaderId, setNewLeaderId] = useState("");
  const [newMemberIds, setNewMemberIds] = useState<string[]>([]);
  const [createMemberSearch, setCreateMemberSearch] = useState("");

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<any>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editColor, setEditColor] = useState("pink");
  const [editLeaderId, setEditLeaderId] = useState("");
  const [editMemberIds, setEditMemberIds] = useState<string[]>([]);
  const [editMemberSearch, setEditMemberSearch] = useState("");

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [teamToDelete, setTeamToDelete] = useState<any>(null);

  // Modals: Bulk Actions
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isBulkAssignLeaderOpen, setIsBulkAssignLeaderOpen] = useState(false);
  const [bulkLeaderId, setBulkLeaderId] = useState("");
  const [isBulkColorOpen, setIsBulkColorOpen] = useState(false);
  const [bulkColorVal, setBulkColorVal] = useState("pink");

  // Member management state
  const [memberPendingId, setMemberPendingId] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const queryClient = useQueryClient();

  // Refresh when sync completes — group member counts/assignments may change
  useEffect(() => {
    const handleRefresh = () => {
      utils.admin.listTeams.invalidate();
      utils.admin.listUsers.invalidate();
    };
    window.addEventListener("refreshData", handleRefresh);
    return () => window.removeEventListener("refreshData", handleRefresh);
  }, [utils]);

  // Queries
  const { data: teamsData, isLoading: loading } = trpc.admin.listTeams.useQuery(undefined, { enabled: isAdmin });
  const { data: allUsers = [], isLoading: loadingUsers } = trpc.admin.listUsers.useQuery(undefined, { enabled: isAdmin });

  const groups = useMemo(() => {
    return teamsData?.teamsDetails || [];
  }, [teamsData]);

  // Mutations
  const createTeamMutation = trpc.admin.createTeam.useMutation({
    onSuccess: () => {
      setIsCreateOpen(false);
      setNewName("");
      setNewDesc("");
      setNewColor("pink");
      setNewLeaderId("");
      setNewMemberIds([]);
      setCreateMemberSearch("");
      setActionMsg("✅ Đã tạo đội nhóm mới thành công!");
      utils.admin.listTeams.invalidate();
      utils.admin.listUsers.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => {
      toast.error(err.message || "Lỗi tạo đội nhóm");
    },
  });

  const updateTeamMutation = trpc.admin.updateTeam.useMutation({
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: [["admin"]] });
      const snapshot = snapshotUserTeamQueries(queryClient);
      optimisticallyUpdateTeam(
        queryClient,
        {
          id: vars.id,
          name: vars.name,
          description: vars.description,
          color: vars.color,
          leaderId: vars.leaderId,
          memberIds: vars.memberIds,
        },
        allUsers
      );
      return { snapshot };
    },
    onError: (err: any, _vars, context: any) => {
      if (context?.snapshot) {
        rollbackUserTeamQueries(queryClient, context.snapshot);
      }
      toast.error(err.message || "Lỗi cập nhật đội nhóm");
    },
    onSuccess: () => {
      setIsEditOpen(false);
      setEditingTeam(null);
      setEditMemberIds([]);
      setEditMemberSearch("");
      setActionMsg("✅ Đã cập nhật thông tin đội nhóm!");
      utils.admin.listTeams.invalidate();
      utils.admin.listUsers.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onSettled: () => {
      utils.admin.listTeams.invalidate();
      utils.admin.listUsers.invalidate();
    },
  });

  // Add member: assign user to this team
  const addMemberMutation = trpc.admin.updateUserTeam.useMutation({
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: [["admin"]] });
      const snapshot = snapshotUserTeamQueries(queryClient);
      optimisticallyUpdateUserTeam(queryClient, vars.userId, vars.teamName || vars.groupName || null);
      return { snapshot };
    },
    onError: (err: any, _vars, context: any) => {
      setMemberPendingId(null);
      if (context?.snapshot) {
        rollbackUserTeamQueries(queryClient, context.snapshot);
      }
      toast.error(err.message || "Lỗi thêm thành viên");
    },
    onSuccess: () => {
      setMemberPendingId(null);
      utils.admin.listTeams.invalidate();
      utils.admin.listUsers.invalidate();
    },
    onSettled: () => {
      utils.admin.listTeams.invalidate();
      utils.admin.listUsers.invalidate();
    },
  });

  // Remove member: unassign user from their team
  const removeMemberMutation = trpc.admin.updateUserTeam.useMutation({
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: [["admin"]] });
      const snapshot = snapshotUserTeamQueries(queryClient);
      optimisticallyUpdateUserTeam(queryClient, vars.userId, null);
      return { snapshot };
    },
    onError: (err: any, _vars, context: any) => {
      setMemberPendingId(null);
      if (context?.snapshot) {
        rollbackUserTeamQueries(queryClient, context.snapshot);
      }
      toast.error(err.message || "Lỗi xóa thành viên");
    },
    onSuccess: () => {
      setMemberPendingId(null);
      utils.admin.listTeams.invalidate();
      utils.admin.listUsers.invalidate();
    },
    onSettled: () => {
      utils.admin.listTeams.invalidate();
      utils.admin.listUsers.invalidate();
    },
  });

  const deleteTeamMutation = trpc.admin.deleteTeam.useMutation({
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: [["admin"]] });
      const snapshot = snapshotUserTeamQueries(queryClient);
      if (vars.id) {
        optimisticallyDeleteTeams(queryClient, [vars.id]);
      }
      return { snapshot };
    },
    onError: (err: any, _vars, context: any) => {
      if (context?.snapshot) {
        rollbackUserTeamQueries(queryClient, context.snapshot);
      }
      toast.error(err.message || "Lỗi xóa đội nhóm");
    },
    onSuccess: () => {
      setIsDeleteOpen(false);
      setTeamToDelete(null);
      setActionMsg("🗑️ Đã xóa đội nhóm thành công!");
      utils.admin.listTeams.invalidate();
      utils.admin.listUsers.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onSettled: () => {
      utils.admin.listTeams.invalidate();
      utils.admin.listUsers.invalidate();
    },
  });

  // Bulk Mutations
  const bulkDeleteTeamsMutation = trpc.admin.bulkDeleteTeams.useMutation({
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: [["admin"]] });
      const snapshot = snapshotUserTeamQueries(queryClient);
      optimisticallyDeleteTeams(queryClient, vars.teamIds || vars.groupIds || []);
      return { snapshot };
    },
    onError: (err: any, _vars, context: any) => {
      if (context?.snapshot) {
        rollbackUserTeamQueries(queryClient, context.snapshot);
      }
      toast.error(err.message || "Lỗi xóa đội nhóm hàng loạt");
    },
    onSuccess: (res) => {
      setIsBulkDeleteOpen(false);
      setSelectedTeamIds([]);
      setActionMsg(`🗑️ Đã xóa thành công ${res.count} nhóm đã chọn!`);
      utils.admin.listTeams.invalidate();
      utils.admin.listUsers.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onSettled: () => {
      utils.admin.listTeams.invalidate();
      utils.admin.listUsers.invalidate();
    },
  });

  const bulkAssignTeamLeaderMutation = trpc.admin.bulkAssignTeamsLeader.useMutation({
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: [["admin"]] });
      const snapshot = snapshotUserTeamQueries(queryClient);
      optimisticallyBulkAssignTeamLeader(queryClient, vars.teamIds || vars.groupIds || [], vars.leaderId || null, allUsers);
      return { snapshot };
    },
    onError: (err: any, _vars, context: any) => {
      if (context?.snapshot) {
        rollbackUserTeamQueries(queryClient, context.snapshot);
      }
      toast.error(err.message || "Lỗi chỉ định leader");
    },
    onSuccess: (res) => {
      setIsBulkAssignLeaderOpen(false);
      setBulkLeaderId("");
      setSelectedTeamIds([]);
      setActionMsg(`👑 Đã cập nhật Trưởng nhóm cho ${res.count} nhóm!`);
      utils.admin.listTeams.invalidate();
      utils.admin.listUsers.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onSettled: () => {
      utils.admin.listTeams.invalidate();
      utils.admin.listUsers.invalidate();
    },
  });

  const bulkChangeColorMutation = trpc.admin.bulkChangeTeamsColor.useMutation({
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: [["admin"]] });
      const snapshot = snapshotUserTeamQueries(queryClient);
      optimisticallyBulkChangeTeamColor(queryClient, vars.teamIds || vars.groupIds || [], vars.color);
      return { snapshot };
    },
    onError: (err: any, _vars, context: any) => {
      if (context?.snapshot) {
        rollbackUserTeamQueries(queryClient, context.snapshot);
      }
      toast.error(err.message || "Lỗi đổi màu nhóm");
    },
    onSuccess: (res) => {
      setIsBulkColorOpen(false);
      setSelectedTeamIds([]);
      setActionMsg(`🎨 Đã đổi màu nhãn cho ${res.count} nhóm!`);
      utils.admin.listTeams.invalidate();
      utils.admin.listUsers.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onSettled: () => {
      utils.admin.listTeams.invalidate();
      utils.admin.listUsers.invalidate();
    },
  });

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    createTeamMutation.mutate({
      name: newName.trim(),
      description: newDesc.trim() || undefined,
      color: newColor,
      leaderId: newLeaderId || null,
      memberIds: newMemberIds,
    });
  };

  const handleOpenEdit = (group: any) => {
    setEditingTeam(group);
    setEditName(group.name);
    setEditDesc(group.description || "");
    setEditColor(group.color || "pink");
    setEditLeaderId(group.leader?.id || "");
    setEditMemberIds((group.members || []).map((m: any) => m.id));
    setEditMemberSearch("");
    setIsEditOpen(true);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeam || !editName.trim()) return;
    updateTeamMutation.mutate({
      id: editingTeam.id,
      name: editName.trim(),
      description: editDesc.trim() || null,
      color: editColor,
      leaderId: editLeaderId || null,
      memberIds: editMemberIds,
    });
  };

  const handleSort = (key: TeamSortKey) => {
    setSortConfig((prev) => ({
      key,
      desc: prev.key === key ? !prev.desc : false,
    }));
  };

  // Filter & Sort
  const filteredAndSortedGroups = useMemo(() => {
    const s = search.toLowerCase().trim();

    const filtered = groups.filter((g: any) => {
      return smartSearchMatch(
        search,
        g.name,
        g.description,
        g.leader?.name,
        g.leader?.fullName,
        g.leader?.username,
        ...(g.members || []).flatMap((m: any) => [m.name, m.fullName, m.username, m.email])
      );
    });

    filtered.sort((a: any, b: any) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      if (sortConfig.key === "createdAt") {
        aVal = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        bVal = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      } else if (typeof aVal === "string") {
        aVal = aVal.toLowerCase();
        bVal = (bVal || "").toString().toLowerCase();
      }

      if (aVal < bVal) return sortConfig.desc ? 1 : -1;
      if (aVal > bVal) return sortConfig.desc ? -1 : 1;
      return 0;
    });

    return filtered;
  }, [groups, search, sortConfig]);

  // Bulk selection helpers
  const allFilteredIds = useMemo(
    () => filteredAndSortedGroups.map((g: any) => g.id),
    [filteredAndSortedGroups]
  );
  const isAllSelected =
    allFilteredIds.length > 0 &&
    allFilteredIds.every((id: string) => selectedTeamIds.includes(id));
  const isSomeSelected =
    allFilteredIds.some((id: string) => selectedTeamIds.includes(id)) && !isAllSelected;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedTeamIds([]);
    } else {
      setSelectedTeamIds(allFilteredIds);
    }
  };

  const toggleSelectGroup = (id: string) => {
    setSelectedTeamIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Overall Stats
  const totalGroupsCount = groups.length;
  const totalAssignedMembers = groups.reduce(
    (sum: number, g: any) => sum + (g.membersCount || 0),
    0
  );
  const unassignedStaffCount = allUsers.filter((u: any) => !u.groupName).length;
  const totalAccountsCovered = groups.reduce(
    (sum: number, g: any) => sum + (g.totalAccounts || 0),
    0
  );

  const renderSortIndicator = (key: TeamSortKey) => {
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

  const getColorClass = (color: string) => {
    switch (color) {
      case "cyan":
        return "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30";
      case "emerald":
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
      case "violet":
        return "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30";
      case "amber":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
      case "indigo":
        return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30";
      default:
        return "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/30";
    }
  };

  if (status === "loading" || !isAdmin) {
    return <DataTableSkeleton />;
  }

  return (
    <div className="space-y-6 w-full pb-28">
      {/* Header & Controls Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5 min-w-0">
              <Layers className="w-7 h-7 text-pink-500 shrink-0" />
              <span className="truncate">Quản Lý Đội Nhóm (Teams)</span>
              {loading ? (
                <span className="inline-block w-10 h-6 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse align-middle shrink-0" />
              ) : (
                <span className="shrink-0">({totalGroupsCount})</span>
              )}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
              Quản trị cơ cấu nhóm, chỉ định Trưởng nhóm (Leader) và theo dõi thành viên & dàn tài khoản TikTok phụ trách.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0 flex-wrap">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/users"
                  className="h-10 flex items-center gap-2 px-4 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-xs active:scale-95 transition-all cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Users className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="truncate">Xem Danh Sách Nhân Sự</span>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-semibold">
                Xem danh sách tất cả thành viên trong tổ chức
              </TooltipContent>
            </Tooltip>

            {isAdmin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setIsCreateOpen(true)}
                    className="h-10 flex items-center gap-2 px-5 rounded-xl text-xs font-bold bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-lg shadow-pink-600/30 active:scale-95 transition-all cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-4 h-4 shrink-0" />
                    <span className="truncate">Tạo Đội Nhóm Mới</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs font-semibold">
                  Khởi tạo một nhóm làm việc mới
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {actionMsg && (
          <div className="p-3.5 rounded-xl bg-cyan-50 dark:bg-slate-900 border border-cyan-200 dark:border-slate-800 text-xs font-bold text-center text-cyan-800 dark:text-cyan-300 shadow-sm animate-in fade-in">
            {actionMsg}
          </div>
        )}

        {/* KPI Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Tổng Số Nhóm</div>
            {loading ? (
              <div className="h-8 w-14 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse mt-1" />
            ) : (
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{totalGroupsCount}</div>
            )}
          </div>
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5" /> Thành Viên Đã Vào Nhóm
            </div>
            {loading ? (
              <div className="h-8 w-14 bg-emerald-100 dark:bg-emerald-950/60 rounded-lg animate-pulse mt-1" />
            ) : (
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{totalAssignedMembers}</div>
            )}
          </div>
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
            <div className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> Chưa Phân Nhóm
            </div>
            {loading || loadingUsers ? (
              <div className="h-8 w-14 bg-amber-100 dark:bg-amber-950/60 rounded-lg animate-pulse mt-1" />
            ) : (
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{unassignedStaffCount}</div>
            )}
          </div>
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
            <div className="text-xs font-medium text-pink-600 dark:text-pink-400 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" /> Tổng Account Thuộc Nhóm
            </div>
            {loading ? (
              <div className="h-8 w-14 bg-pink-100 dark:bg-pink-950/60 rounded-lg animate-pulse mt-1" />
            ) : (
              <div className="text-2xl font-black text-pink-600 dark:text-pink-400 mt-1">{totalAccountsCovered}</div>
            )}
          </div>
        </div>

        {/* Search & Action Toolbar (Sticky only on desktop) */}
        <div className="lg:sticky lg:top-[72px] z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-96">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Tìm theo tên nhóm, mô tả, trưởng nhóm, thành viên..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-9 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-8 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-pink-500 transition-colors"
              />
              {search && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setSearch("")}
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

            <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto sm:ml-auto flex-wrap">
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
                  {TEAM_SORT_OPTIONS.map((item) => {
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
                      onClick={() => setViewMode("grid")}
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
                      onClick={() => setViewMode("list")}
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
                            name: true,
                            createdBy: true,
                            createdAt: true,
                            leader: true,
                            members: true,
                            totalAccounts: true,
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
                        { key: "name", label: "Tên Nhóm", locked: true },
                        { key: "createdBy", label: "Người Tạo" },
                        { key: "createdAt", label: "Ngày Tạo" },
                        { key: "leader", label: "Trưởng Nhóm" },
                        { key: "members", label: "Thành Viên" },
                        { key: "totalAccounts", label: "Số Acc Phụ Trách" },
                        { key: "actions", label: "Thao Tác" },
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
          {search && (
            <div className="flex flex-wrap items-center gap-2">
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setSearch("")}
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

      {/* Main Groups View: Grid or Table */}
      {loading ? (
        viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 pb-4">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="relative flex flex-col bg-white dark:bg-slate-900/80 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-5 space-y-4 animate-pulse overflow-hidden"
              >
                <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 -mt-5 -mx-5 mb-1" />
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-3 w-1/3 rounded bg-slate-100 dark:bg-slate-800/60" />
                  </div>
                </div>
                <div className="h-10 rounded-xl bg-slate-100 dark:bg-slate-800/50" />
                <div className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800/40" />
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="h-8 rounded-lg bg-slate-100 dark:bg-slate-800/50" />
                  <div className="h-8 rounded-lg bg-slate-100 dark:bg-slate-800/50" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <DataTableSkeleton columnCount={visibleColumnCount} rowCount={5} />
        )
      ) : filteredAndSortedGroups.length === 0 ? (
        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-8 text-center shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-pink-50 dark:bg-pink-950/40 text-pink-500 dark:text-pink-400 flex items-center justify-center mb-4">
            <Layers className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Không tìm thấy nhóm nào
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
            {search ? "Không có nhóm nào khớp với từ khóa tìm kiếm của bạn." : "Chưa có nhóm nào được tạo trong hệ thống."}
          </p>
          {search ? (
            <button
              onClick={() => setSearch("")}
              className="mt-4 px-4 py-2 text-xs font-semibold text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950/40 rounded-xl transition-colors cursor-pointer"
            >
              Xóa tìm kiếm
            </button>
          ) : isAdmin ? (
            <button
              onClick={() => setIsCreateOpen(true)}
              className="mt-4 px-4 py-2 text-xs font-bold text-white bg-pink-600 hover:bg-pink-500 rounded-xl shadow-md transition-colors cursor-pointer"
            >
              + Tạo Đội Nhóm Mới
            </button>
          ) : null}
        </div>
      ) : viewMode === "grid" ? (
        /* Groups Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 pb-4">
          {filteredAndSortedGroups.map((group: any) => {
            const isSelected = selectedTeamIds.includes(group.id);
            const members = group.members || [];
            const displayMembers = members.slice(0, 4);
            const remainingMembers = members.slice(4);
            const hasMore = remainingMembers.length > 0;

            const accentGradient =
              group.color === "cyan"
                ? "from-cyan-500 to-blue-500"
                : group.color === "emerald"
                  ? "from-emerald-500 to-teal-500"
                  : group.color === "violet"
                    ? "from-violet-500 to-purple-500"
                    : group.color === "amber"
                      ? "from-amber-500 to-orange-500"
                      : group.color === "indigo"
                        ? "from-indigo-500 to-violet-500"
                        : "from-pink-500 to-rose-500";

            return (
              <div
                key={group.id}
                className={`group relative flex flex-col bg-white dark:bg-slate-900/90 rounded-2xl border transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 overflow-hidden ${isSelected
                  ? "border-pink-500 ring-2 ring-pink-500/20 bg-pink-50/10 dark:bg-pink-950/10 shadow-md"
                  : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs"
                  }`}
              >
                {/* Top Accent Stripe */}
                <div className={`h-1.5 w-full bg-gradient-to-r ${accentGradient}`} />

                {/* Card Header */}
                <div className="p-4 pb-2 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {isAdmin && (
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelectGroup(group.id)}
                        aria-label={`Chọn nhóm ${group.name}`}
                      />
                    )}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${getColorClass(group.color)}`}>
                      <Layers className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors truncate">
                        <Link href={`/teams/${group.id}`} className="hover:underline">
                          {group.name}
                        </Link>
                      </h3>
                      <span className="text-xs text-slate-400 block">
                        {group.createdAt ? new Date(group.createdAt).toLocaleDateString("vi-VN") : "Hôm nay"}
                      </span>
                    </div>
                  </div>

                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                          aria-label="Thao tác nhóm"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-1.5 shadow-xl">
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/teams/${group.id}`}
                            className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                          >
                            <Users className="w-3.5 h-3.5 text-pink-500" />
                            <span>Xem chi tiết đội nhóm</span>
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleOpenEdit(group)}
                          className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5 text-slate-400" />
                          <span>Chỉnh sửa đội nhóm</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="my-1 bg-slate-100 dark:bg-slate-800" />
                        <DropdownMenuItem
                          onClick={() => {
                            setTeamToDelete(group);
                            setIsDeleteOpen(true);
                          }}
                          className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                          <span>Xóa đội nhóm</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {/* Card Body */}
                <div className="p-4 pt-1 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-3">
                    {/* Description */}
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 min-h-[32px]">
                      {group.description || <span className="italic text-slate-400/80">Không có mô tả</span>}
                    </p>

                    {/* Leader Box — inline Select dropdown */}
                    <div>
                      <Select
                        value={group.leader?.id || "UNASSIGNED"}
                        onValueChange={(val) => {
                          updateTeamMutation.mutate({
                            id: group.id,
                            name: group.name,
                            description: group.description,
                            color: group.color || "pink",
                            leaderId: val === "UNASSIGNED" ? null : val,
                          });
                        }}
                      >
                        <SelectTrigger className="w-full h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border border-dashed border-slate-200 dark:border-slate-800 shadow-none cursor-pointer">
                          <SelectValue>
                            {group.leader ? (
                              <span className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0 uppercase">
                                  {group.leader.name.slice(0, 2)}
                                </div>
                                <span className="flex items-center gap-1 font-semibold text-amber-900 dark:text-amber-200">
                                  <Crown className="w-3 h-3 text-amber-500 shrink-0" />
                                  {group.leader.name}
                                </span>
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5 text-slate-400">
                                <Crown className="w-3.5 h-3.5 opacity-40" />
                                Chưa có Trưởng nhóm
                              </span>
                            )}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl">
                          <SelectItem value="UNASSIGNED" className="text-xs text-slate-400 cursor-pointer">-- Không có leader --</SelectItem>
                          {allUsers.map((u: any) => (
                            <SelectItem key={u.id} value={u.id} className="text-xs cursor-pointer">
                              <div className="flex items-center gap-2">
                                {renderUserAvatar(u, "w-4 h-4 text-[8px]")}
                                <span>{u.name || u.fullName}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Members Avatar Row */}
                    <div>
                      <div className="text-xs font-medium text-slate-400 mb-1.5 flex items-center justify-between">
                        <span>Thành viên ({members.length})</span>
                      </div>

                      {members.length === 0 ? (
                        <div className="flex items-center gap-2 py-1">
                          {isAdmin && (
                            <Popover>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <PopoverTrigger asChild>
                                    <button
                                      type="button"
                                      className="w-7 h-7 rounded-full border-2 border-dashed border-pink-400 dark:border-pink-500 bg-pink-50 dark:bg-pink-950/40 text-pink-500 dark:text-pink-400 flex items-center justify-center hover:scale-110 transition-all cursor-pointer shadow-xs shrink-0"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>
                                  </PopoverTrigger>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs font-semibold">
                                  Thêm thành viên
                                </TooltipContent>
                              </Tooltip>
                              <PopoverContent align="start" className="w-64 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl">
                                <div className="text-xs font-bold text-slate-900 dark:text-white pb-1.5 mb-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5">
                                  <UserPlus className="w-3.5 h-3.5 text-pink-500" />
                                  Thêm thành viên vào nhóm
                                </div>
                                {allUsers.filter((u: any) => !u.groupId || u.groupId !== group.id).length === 0 ? (
                                  <div className="text-xs text-slate-400 italic py-2 text-center">Tất cả thành viên đã trong nhóm</div>
                                ) : (
                                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                                    {allUsers
                                      .filter((u: any) => !u.groupId || u.groupId !== group.id)
                                      .map((u: any) => (
                                        <button
                                          key={u.id}
                                          type="button"
                                          disabled={memberPendingId === u.id}
                                          onClick={() => {
                                            setMemberPendingId(u.id);
                                            addMemberMutation.mutate({ userId: u.id, groupName: group.name });
                                          }}
                                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-pink-50 dark:hover:bg-pink-950/40 transition-colors cursor-pointer text-left disabled:opacity-50"
                                        >
                                          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-pink-500 to-rose-500 text-white text-[10px] font-bold flex items-center justify-center uppercase shrink-0">
                                            {u.name?.slice(0, 2)}
                                          </div>
                                          <div className="min-w-0">
                                            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{u.name}</div>
                                            <div className="text-[10px] text-slate-400 truncate">@{u.username}{u.groupName ? ` · ${u.groupName}` : " · Chưa có nhóm"}</div>
                                          </div>
                                        </button>
                                      ))}
                                  </div>
                                )}
                              </PopoverContent>
                            </Popover>
                          )}
                          <span className="text-xs text-slate-400 italic">Chưa có thành viên trong nhóm</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <div className="flex items-center -space-x-2 py-1">
                            {displayMembers.map((member: any) => (
                              <div key={member.id} className="relative group/avatar">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Link
                                      href={`/users/${member.id}`}
                                      className="inline-flex w-7 h-7 rounded-full ring-2 ring-white dark:ring-slate-900 bg-gradient-to-tr from-pink-500 to-rose-500 text-white text-xs font-bold items-center justify-center hover:z-20 hover:scale-110 transition-all uppercase shadow-xs shrink-0 select-none"
                                    >
                                      {member.avatar || member.image ? (
                                        <img
                                          src={member.avatar || member.image}
                                          alt={member.name}
                                          className="w-full h-full rounded-full object-cover"
                                        />
                                      ) : (
                                        <span className="leading-none">{member.name.slice(0, 2)}</span>
                                      )}
                                    </Link>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="font-bold text-xs">{member.name}</div>
                                    <div className="text-xs text-slate-400">
                                      @{member.username} • {member.accountsCount} accounts
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                                {/* Red X remove button on avatar hover — with tooltip at bottom left */}
                                {isAdmin && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        disabled={memberPendingId === member.id}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          setMemberPendingId(member.id);
                                          removeMemberMutation.mutate({ userId: member.id, groupName: null });
                                        }}
                                        className="absolute -bottom-1 -left-1 w-4 h-4 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900 text-white flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-all z-30 hover:bg-rose-600 cursor-pointer shadow-sm disabled:opacity-40"
                                      >
                                        <X className="w-2.5 h-2.5" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="text-xs font-semibold">
                                      Xóa {member.name} khỏi nhóm
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            ))}

                            {/* + Add member avatar-circle button — placed inside -space-x-2 for seamless overlap */}
                            {isAdmin && (
                              <Popover>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <PopoverTrigger asChild>
                                      <button
                                        type="button"
                                        className="relative z-10 w-7 h-7 rounded-full ring-2 ring-white dark:ring-slate-900 border-2 border-dashed border-pink-400 dark:border-pink-500 bg-pink-50 dark:bg-pink-950/40 text-pink-500 dark:text-pink-400 flex items-center justify-center hover:z-20 hover:scale-110 transition-all cursor-pointer shadow-xs shrink-0"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                      </button>
                                    </PopoverTrigger>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs font-semibold">
                                    Thêm thành viên
                                  </TooltipContent>
                                </Tooltip>
                                <PopoverContent align="start" className="w-64 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl">
                                  <div className="text-xs font-bold text-slate-900 dark:text-white pb-1.5 mb-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5">
                                    <UserPlus className="w-3.5 h-3.5 text-pink-500" />
                                    Thêm thành viên vào nhóm
                                  </div>
                                  {allUsers.filter((u: any) => !u.groupId || u.groupId !== group.id).length === 0 ? (
                                    <div className="text-xs text-slate-400 italic py-2 text-center">Tất cả thành viên đã trong nhóm</div>
                                  ) : (
                                    <div className="max-h-48 overflow-y-auto space-y-0.5">
                                      {allUsers
                                        .filter((u: any) => !u.groupId || u.groupId !== group.id)
                                        .map((u: any) => (
                                          <button
                                            key={u.id}
                                            type="button"
                                            disabled={memberPendingId === u.id}
                                            onClick={() => {
                                              setMemberPendingId(u.id);
                                              addMemberMutation.mutate({ userId: u.id, groupName: group.name });
                                            }}
                                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-pink-50 dark:hover:bg-pink-950/40 transition-colors cursor-pointer text-left disabled:opacity-50"
                                          >
                                            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-pink-500 to-rose-500 text-white text-[10px] font-bold flex items-center justify-center uppercase shrink-0">
                                              {u.name?.slice(0, 2)}
                                            </div>
                                            <div className="min-w-0">
                                              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{u.name}</div>
                                              <div className="text-[10px] text-slate-400 truncate">@{u.username}{u.groupName ? ` · ${u.groupName}` : " · Chưa có nhóm"}</div>
                                            </div>
                                          </button>
                                        ))}
                                    </div>
                                  )}
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>

                          {hasMore && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                                >
                                  +{remainingMembers.length}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent align="start" className="w-72 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl space-y-2">
                                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 pb-1 border-b border-slate-100 dark:border-slate-800">
                                  <Users className="w-3.5 h-3.5 text-pink-500" />
                                  Tất cả thành viên ({members.length})
                                </div>
                                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                                  {members.map((m: any) => (
                                    <Link
                                      key={m.id}
                                      href={`/users/${m.id}`}
                                      className="flex items-center justify-between p-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-xs"
                                    >
                                      <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-pink-500 text-white font-bold text-xs flex items-center justify-center uppercase">
                                          {m.name.slice(0, 2)}
                                        </div>
                                        <div>
                                          <div className="font-bold text-slate-900 dark:text-white">{m.name}</div>
                                          <div className="text-xs text-slate-400">@{m.username}</div>
                                        </div>
                                      </div>
                                      <span className="text-xs text-slate-500">{m.accountsCount} accs</span>
                                    </Link>
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Metrics Strip */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs">
                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/80">
                      <div className="text-xs text-slate-400">Accounts</div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                        {group.totalAccounts} <span className="text-xs font-normal text-slate-400">accs</span>
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/80">
                      <div className="text-xs text-slate-400">Nhân sự</div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                        {group.membersCount || 0} <span className="text-xs font-normal text-slate-400">người</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="mt-auto px-4 py-2.5 bg-slate-50/80 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <Link
                    href={`/accounts?search=${encodeURIComponent(group.name)}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-pink-600 dark:text-pink-400 px-2 py-1 rounded-lg hover:bg-pink-50 dark:hover:bg-pink-950/40 hover:text-pink-700 dark:hover:text-pink-300 transition-colors"
                  >
                    <span>Xem dàn tài khoản</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(group)}
                      className="group/edit flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950/40 transition-all cursor-pointer"
                    >
                      <Pencil className="w-3 h-3 opacity-60 group-hover/edit:opacity-100 transition-opacity" />
                      Chỉnh sửa
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden relative z-0 isolate">
          <div className="overflow-x-auto relative" ref={tableRef} style={getTableVars()}>
            <table
              className="text-left text-xs border-collapse table-fixed"
              style={{
                width: "max(100%, var(--resize-table-min-width))",
                minWidth: "var(--resize-table-min-width)",
              }}
            >
              <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800 select-none">
                <tr>
                  {isAdmin && (
                    <th className="py-3.5 px-3 w-10 min-w-[40px] max-w-[40px] text-center sticky left-0 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-slate-200 dark:after:bg-slate-800">
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        className="text-slate-400 hover:text-pink-500 transition-colors cursor-pointer"
                        aria-label="Chọn tất cả nhóm"
                      >
                        {isAllSelected ? (
                          <CheckSquare className="w-4 h-4 text-pink-500" />
                        ) : isSomeSelected ? (
                          <div className="w-4 h-4 rounded border-2 border-pink-500 bg-pink-500/20 flex items-center justify-center">
                            <div className="w-2 h-0.5 bg-pink-500" />
                          </div>
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                  )}
                  <th className={`py-3.5 px-2 w-10 min-w-[40px] max-w-[40px] text-center sticky ${isAdmin ? "left-[40px]" : "left-0"} z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-slate-200 dark:after:bg-slate-800`}>
                    #
                  </th>
                  {visibleColumns.name && (
                    <th
                      style={getColumnStyle("name")}
                      onClick={() => handleSort("name")}
                      className={`relative group/th py-3.5 px-4 cursor-pointer group hover:text-slate-900 dark:hover:text-white sticky ${isAdmin ? "left-[80px]" : "left-[40px]"
                        } z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs border-r border-slate-200 dark:border-slate-800 after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-slate-200 dark:after:bg-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.03)]`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate">Tên đội nhóm</span>
                        {renderSortIndicator("name")}
                      </div>
                      {renderResizeHandle("name")}
                    </th>
                  )}
                  {visibleColumns.createdBy && (
                    <th
                      style={getColumnStyle("createdBy")}
                      className="relative group/th py-3.5 px-4"
                    >
                      <span className="truncate">Người tạo</span>
                      {renderResizeHandle("createdBy")}
                    </th>
                  )}
                  {visibleColumns.createdAt && (
                    <th
                      style={getColumnStyle("createdAt")}
                      onClick={() => handleSort("createdAt")}
                      className="relative group/th py-3.5 px-4 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate">Ngày tạo</span>
                        {renderSortIndicator("createdAt")}
                      </div>
                      {renderResizeHandle("createdAt")}
                    </th>
                  )}
                  {visibleColumns.leader && (
                    <th
                      style={getColumnStyle("leader")}
                      className="relative group/th py-3.5 px-4"
                    >
                      <span className="truncate">Trưởng nhóm</span>
                      {renderResizeHandle("leader")}
                    </th>
                  )}
                  {visibleColumns.members && (
                    <th
                      style={getColumnStyle("members")}
                      onClick={() => handleSort("membersCount")}
                      className="relative group/th py-3.5 px-4 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate">Thành viên</span>
                        {renderSortIndicator("membersCount")}
                      </div>
                      {renderResizeHandle("members")}
                    </th>
                  )}
                  {visibleColumns.totalAccounts && (
                    <th
                      style={getColumnStyle("totalAccounts")}
                      onClick={() => handleSort("totalAccounts")}
                      className="relative group/th py-3.5 px-4 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate">Số acc phụ trách</span>
                        {renderSortIndicator("totalAccounts")}
                      </div>
                      {renderResizeHandle("totalAccounts")}
                    </th>
                  )}
                  {visibleColumns.actions && (
                    <th
                      style={getColumnStyle("actions")}
                      className="relative group/th py-3.5 px-6 text-center whitespace-nowrap sticky right-0 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs border-l border-slate-200 dark:border-slate-800 after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-slate-200 dark:after:bg-slate-800 shadow-[-2px_0_5px_rgba(0,0,0,0.03)]"
                    >
                      Thao tác
                      {renderResizeHandle("actions", "left")}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filteredAndSortedGroups.length === 0 ? (
                  <tr>
                    <td
                      colSpan={visibleColumnCount}
                      className="py-12 text-center text-slate-400 dark:text-slate-500"
                    >
                      <Layers className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <div>Không tìm thấy nhóm nào phù hợp với từ khóa tìm kiếm.</div>
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedGroups.map((group: any, idx: number) => {
                    const isSelected = selectedTeamIds.includes(group.id);
                    const rowBgClass = isSelected
                      ? "bg-pink-50 dark:bg-pink-950/90"
                      : "bg-white dark:bg-slate-900";
                    const members = group.members || [];
                    const displayMembers = members.slice(0, 3);
                    const remainingMembers = members.slice(3);
                    const hasMore = remainingMembers.length > 0;

                    return (
                      <tr
                        key={group.id}
                        className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group align-middle ${isSelected ? "bg-pink-50 dark:bg-pink-950/90" : ""
                          }`}
                      >
                        {isAdmin && (
                          <td className={`py-4 px-3 w-10 min-w-[40px] max-w-[40px] text-center align-middle sticky left-0 z-10 ${rowBgClass} group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors`}>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelectGroup(group.id)}
                              aria-label={`Chọn nhóm ${group.name}`}
                            />
                          </td>
                        )}
                        <td className={`py-4 px-2 w-10 min-w-[40px] max-w-[40px] text-center align-middle text-slate-400 text-xs font-mono sticky ${isAdmin ? "left-[40px]" : "left-0"} z-10 ${rowBgClass} group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors`}>
                          {idx + 1}
                        </td>

                        {visibleColumns.name && (
                          <td
                            style={getColumnStyle("name")}
                            className={`py-4 px-4 align-middle sticky ${isAdmin ? "left-[80px]" : "left-[40px]"
                              } z-10 ${rowBgClass} group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.03)] overflow-hidden`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className={`w-3 h-3 rounded-full shrink-0 border ${getColorClass(group.color || "pink")}`} />
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 dark:text-white text-xs truncate" title={group.name}>
                                  <Link href={`/teams/${group.id}`} className="hover:text-pink-600 dark:hover:text-pink-400 hover:underline transition-colors">
                                    {group.name}
                                  </Link>
                                </div>
                                {group.description && (
                                  <div className="text-xs text-slate-400 truncate" title={group.description}>
                                    {group.description}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        )}

                        {visibleColumns.createdBy && (
                          <td style={getColumnStyle("createdBy")} className="py-4 px-4 align-middle text-slate-600 dark:text-slate-400 overflow-hidden">
                            <span className="truncate block" title={group.creator?.name || group.creator?.username || undefined}>
                              {group.creator?.name || group.creator?.username || (
                                <span className="text-slate-400 italic">Hệ thống</span>
                              )}
                            </span>
                          </td>
                        )}

                        {visibleColumns.createdAt && (
                          <td style={getColumnStyle("createdAt")} className="py-4 px-4 align-middle text-slate-500 overflow-hidden text-xs">
                            <span className="truncate block">{group.createdAt ? new Date(group.createdAt).toLocaleDateString("vi-VN") : "--"}</span>
                          </td>
                        )}

                        {visibleColumns.leader && (
                          <td style={getColumnStyle("leader")} className="py-4 px-4 align-middle overflow-hidden">
                            <Select
                              value={group.leader?.id || "UNASSIGNED"}
                              onValueChange={(val) => {
                                updateTeamMutation.mutate({
                                  id: group.id,
                                  name: group.name,
                                  description: group.description,
                                  color: group.color || "pink",
                                  leaderId: val === "UNASSIGNED" ? null : val,
                                });
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer w-full min-w-0">
                                <SelectValue>
                                  {group.leader ? (
                                    <span className="flex items-center gap-1.5 min-w-0">
                                      <Crown className="w-3 h-3 text-amber-500 shrink-0" />
                                      <span className="truncate">{group.leader.name}</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 italic">Chưa có Leader</span>
                                  )}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent className="rounded-2xl">
                                <SelectItem value="UNASSIGNED" className="text-xs text-slate-400 cursor-pointer">-- Không có leader --</SelectItem>
                                {allUsers.map((u: any) => (
                                  <SelectItem key={u.id} value={u.id} className="text-xs cursor-pointer">
                                    <div className="flex items-center gap-2">
                                      {renderUserAvatar(u, "w-4 h-4 text-[8px]")}
                                      <span>{u.name || u.fullName}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                        )}

                        {visibleColumns.members && (
                          <td style={getColumnStyle("members")} className="py-4 px-4 align-middle overflow-hidden">
                            {members.length === 0 ? (
                              <div className="flex items-center gap-2">
                                {isAdmin && (
                                  <Popover>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <PopoverTrigger asChild>
                                          <button
                                            type="button"
                                            className="w-6 h-6 rounded-full border-2 border-dashed border-pink-400 dark:border-pink-500 bg-pink-50 dark:bg-pink-950/40 text-pink-500 dark:text-pink-400 flex items-center justify-center hover:scale-110 transition-all cursor-pointer shadow-xs shrink-0"
                                          >
                                            <Plus className="w-3 h-3" />
                                          </button>
                                        </PopoverTrigger>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="text-xs font-semibold">
                                        Thêm thành viên
                                      </TooltipContent>
                                    </Tooltip>
                                    <PopoverContent align="start" className="w-64 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl">
                                      <div className="text-xs font-bold text-slate-900 dark:text-white pb-1.5 mb-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5">
                                        <UserPlus className="w-3.5 h-3.5 text-pink-500" />
                                        Thêm thành viên vào {group.name}
                                      </div>
                                      {allUsers.filter((u: any) => !u.groupId || u.groupId !== group.id).length === 0 ? (
                                        <div className="text-xs text-slate-400 italic py-2 text-center">Tất cả thành viên đã trong nhóm</div>
                                      ) : (
                                        <div className="max-h-48 overflow-y-auto space-y-0.5">
                                          {allUsers
                                            .filter((u: any) => !u.groupId || u.groupId !== group.id)
                                            .map((u: any) => (
                                              <button
                                                key={u.id}
                                                type="button"
                                                disabled={memberPendingId === u.id}
                                                onClick={() => {
                                                  setMemberPendingId(u.id);
                                                  addMemberMutation.mutate({ userId: u.id, groupName: group.name });
                                                }}
                                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-pink-50 dark:hover:bg-pink-950/40 transition-colors cursor-pointer text-left disabled:opacity-50"
                                              >
                                                <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-pink-500 to-rose-500 text-white text-[9px] font-bold flex items-center justify-center uppercase shrink-0">
                                                  {u.name?.slice(0, 2)}
                                                </div>
                                                <div className="min-w-0">
                                                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{u.name}</div>
                                                  <div className="text-[10px] text-slate-400 truncate">@{u.username}{u.groupName ? ` · ${u.groupName}` : " · Chưa có nhóm"}</div>
                                                </div>
                                              </button>
                                            ))}
                                        </div>
                                      )}
                                    </PopoverContent>
                                  </Popover>
                                )}
                                <span className="text-slate-400 text-xs italic">0 thành viên</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 h-6">
                                <div className="flex items-center -space-x-1.5 py-1">
                                  {displayMembers.map((member: any) => (
                                    <div key={member.id} className="relative group/avatar">
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Link
                                            href={`/users/${member.id}`}
                                            className="inline-flex w-6 h-6 rounded-full ring-2 ring-white dark:ring-slate-900 bg-gradient-to-tr from-pink-500 to-rose-500 text-white text-[10px] font-bold items-center justify-center hover:z-20 hover:scale-125 transition-all uppercase shadow-xs shrink-0 select-none"
                                          >
                                            {member.avatar || member.image ? (
                                              <img
                                                src={member.avatar || member.image}
                                                alt={member.name}
                                                className="w-full h-full rounded-full object-cover"
                                              />
                                            ) : (
                                              <span className="leading-none">{member.name.slice(0, 2)}</span>
                                            )}
                                          </Link>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <div className="font-bold text-xs">{member.name}</div>
                                          <div className="text-xs text-slate-400">
                                            @{member.username} • {member.accountsCount} accounts phụ trách
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                      {isAdmin && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <button
                                              type="button"
                                              disabled={memberPendingId === member.id}
                                              onClick={(e) => {
                                                e.preventDefault();
                                                setMemberPendingId(member.id);
                                                removeMemberMutation.mutate({ userId: member.id, groupName: null });
                                              }}
                                              className="absolute -bottom-1 -left-1 w-3.5 h-3.5 rounded-full bg-rose-500 ring-1 ring-white dark:ring-slate-900 text-white flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-all z-30 hover:bg-rose-600 cursor-pointer shadow-sm disabled:opacity-40"
                                            >
                                              <X className="w-2 h-2" />
                                            </button>
                                          </TooltipTrigger>
                                          <TooltipContent side="bottom" className="text-xs font-semibold">
                                            Xóa {member.name} khỏi nhóm
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                    </div>
                                  ))}

                                  {/* Table Add button inside avatar stack */}
                                  {isAdmin && (
                                    <Popover>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <PopoverTrigger asChild>
                                            <button
                                              type="button"
                                              className="relative z-10 w-6 h-6 rounded-full ring-2 ring-white dark:ring-slate-900 border-2 border-dashed border-pink-400 dark:border-pink-500 bg-pink-50 dark:bg-pink-950/40 text-pink-500 dark:text-pink-400 flex items-center justify-center hover:z-20 hover:scale-110 transition-all cursor-pointer shadow-xs shrink-0"
                                            >
                                              <Plus className="w-3 h-3" />
                                            </button>
                                          </PopoverTrigger>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="text-xs font-semibold">
                                          Thêm thành viên
                                        </TooltipContent>
                                      </Tooltip>
                                      <PopoverContent align="start" className="w-64 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl">
                                        <div className="text-xs font-bold text-slate-900 dark:text-white pb-1.5 mb-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5">
                                          <UserPlus className="w-3.5 h-3.5 text-pink-500" />
                                          Thêm thành viên vào {group.name}
                                        </div>
                                        {allUsers.filter((u: any) => !u.groupId || u.groupId !== group.id).length === 0 ? (
                                          <div className="text-xs text-slate-400 italic py-2 text-center">Tất cả thành viên đã trong nhóm</div>
                                        ) : (
                                          <div className="max-h-48 overflow-y-auto space-y-0.5">
                                            {allUsers
                                              .filter((u: any) => !u.groupId || u.groupId !== group.id)
                                              .map((u: any) => (
                                                <button
                                                  key={u.id}
                                                  type="button"
                                                  disabled={memberPendingId === u.id}
                                                  onClick={() => {
                                                    setMemberPendingId(u.id);
                                                    addMemberMutation.mutate({ userId: u.id, groupName: group.name });
                                                  }}
                                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-pink-50 dark:hover:bg-pink-950/40 transition-colors cursor-pointer text-left disabled:opacity-50"
                                                >
                                                  <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-pink-500 to-rose-500 text-white text-[9px] font-bold flex items-center justify-center uppercase shrink-0">
                                                    {u.name?.slice(0, 2)}
                                                  </div>
                                                  <div className="min-w-0">
                                                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{u.name}</div>
                                                    <div className="text-[10px] text-slate-400 truncate">@{u.username}{u.groupName ? ` · ${u.groupName}` : " · Chưa có nhóm"}</div>
                                                  </div>
                                                </button>
                                              ))}
                                          </div>
                                        )}
                                      </PopoverContent>
                                    </Popover>
                                  )}
                                </div>

                                {hasMore && (
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button
                                        type="button"
                                        className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 cursor-pointer"
                                      >
                                        +{remainingMembers.length}
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent align="start" className="w-60 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl space-y-1">
                                      <div className="text-xs font-bold text-slate-900 dark:text-white pb-1 border-b border-slate-100 dark:border-slate-800">
                                        Tất cả thành viên
                                      </div>
                                      <div className="max-h-48 overflow-y-auto space-y-0.5">
                                        {members.map((m: any) => (
                                          <div key={m.id} className="text-xs px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg">
                                            {m.name} <span className="text-slate-400">@{m.username}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                )}
                              </div>
                            )}
                          </td>
                        )}

                        {visibleColumns.totalAccounts && (
                          <td style={getColumnStyle("totalAccounts")} className="py-4 px-4 align-middle font-bold text-slate-800 dark:text-slate-200 overflow-hidden">
                            <span className="truncate block">
                              {group.totalAccounts}{" "}
                              <span className="text-slate-400 text-xs font-normal">accounts</span>
                            </span>
                          </td>
                        )}

                        {visibleColumns.actions && (
                          <td
                            style={getColumnStyle("actions")}
                            className={`py-4 px-6 text-center align-middle whitespace-nowrap sticky right-0 z-10 ${rowBgClass} group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors border-l border-slate-200 dark:border-slate-800 shadow-[-2px_0_5px_rgba(0,0,0,0.03)]`}
                          >
                            {isAdmin ? (
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
                                  <TooltipContent side="left">Tùy chọn nhóm</TooltipContent>
                                </Tooltip>
                                <DropdownMenuContent align="end" className="w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-1.5 shadow-xl">
                                  <DropdownMenuItem asChild>
                                    <Link
                                      href={`/teams/${group.id}`}
                                      className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                                    >
                                      <Users className="w-3.5 h-3.5 text-pink-500" />
                                      <span>Xem chi tiết đội nhóm</span>
                                    </Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleOpenEdit(group)}
                                    className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-slate-400" />
                                    <span>Chỉnh sửa đội nhóm</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator className="my-1 bg-slate-100 dark:bg-slate-800" />
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setTeamToDelete(group);
                                      setIsDeleteOpen(true);
                                    }}
                                    className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                    <span>Xóa đội nhóm</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : (
                              <span className="text-slate-400 text-xs italic">--</span>
                            )}
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

      {/* Floating Bulk Action Bar */}
      {isAdmin && selectedTeamIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 dark:bg-slate-900/95 border border-slate-700/80 text-white px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-4 animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-2 text-xs font-bold border-r border-slate-700 pr-3">
            <Layers className="w-4 h-4 text-pink-400" />
            <span>Đã chọn <strong className="text-pink-400 font-extrabold">{selectedTeamIds.length}</strong> nhóm</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Bulk Assign Leader */}
            <button
              onClick={() => setIsBulkAssignLeaderOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
            >
              <Crown className="w-3.5 h-3.5 text-cyan-400" />
              <span>Gán Leader</span>
            </button>

            {/* Bulk Change Color */}
            <button
              onClick={() => setIsBulkColorOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
            >
              <Palette className="w-3.5 h-3.5 text-pink-400" />
              <span>Đổi Màu</span>
            </button>

            {/* Bulk Delete */}
            <button
              onClick={() => setIsBulkDeleteOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Xóa Hàng Loạt</span>
            </button>
          </div>

          {/* Clear Selection */}
          <button
            onClick={() => setSelectedTeamIds([])}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer ml-1"
            title="Bỏ chọn tất cả"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Modal: Create Group */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-pink-500" />
                Tạo Nhóm / Team Mới
              </h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Tên Nhóm *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Team US #1, Team Affiliate..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-pink-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Mô Tả Nhóm (Tùy chọn)
                </label>
                <textarea
                  rows={3}
                  placeholder="Mô tả mục tiêu, khu vực hoạt động của nhóm..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-pink-500 resize-none min-h-[72px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Màu Sắc Nhãn Nhóm
                </label>
                <div className="flex items-center gap-2">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setNewColor(c.value)}
                      className={`w-7 h-7 rounded-full ${c.class} transition-transform cursor-pointer ${newColor === c.value
                        ? "ring-2 ring-offset-2 ring-pink-500 scale-110"
                        : "opacity-80 hover:opacity-100"
                        }`}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Chỉ Định Trưởng Nhóm (Leader) — Tự động cấp quyền LEAD
                </label>
                <Select
                  value={newLeaderId || "UNASSIGNED"}
                  onValueChange={(val) => setNewLeaderId(val === "UNASSIGNED" ? "" : val)}
                >
                  <SelectTrigger className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white cursor-pointer">
                    <SelectValue placeholder="-- Chưa chỉ định leader --">
                      {(() => {
                        const leader = allUsers.find((u: any) => u.id === newLeaderId);
                        return leader ? (
                          <div className="flex items-center gap-2 min-w-0">
                            {renderUserAvatar(leader, "w-4 h-4 text-[8px]")}
                            <span className="truncate">{leader.fullName || leader.name}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-- Chưa chỉ định leader --</span>
                        );
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl max-h-56">
                    <SelectItem value="UNASSIGNED" className="text-xs text-slate-400 cursor-pointer">
                      -- Chưa chỉ định leader --
                    </SelectItem>
                    {allUsers.map((u: any) => (
                      <SelectItem key={u.id} value={u.id} className="text-xs cursor-pointer">
                        <div className="flex items-center gap-2">
                          {renderUserAvatar(u, "w-4 h-4 text-[8px]")}
                          <span>{u.fullName || u.name} ({u.role})</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Member Management in Create Modal */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Thành Viên Nhóm ({newMemberIds.length})
                </label>

                {/* Member chips */}
                <div className="min-h-[44px] p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-wrap items-center gap-1.5 mb-2">
                  {newMemberIds.length === 0 ? (
                    <span className="text-xs text-slate-400 italic px-1">Chưa chọn thành viên nào</span>
                  ) : (
                    newMemberIds.map((userId) => {
                      const u = allUsers.find((x: any) => x.id === userId);
                      if (!u) return null;
                      return (
                        <span
                          key={userId}
                          className="inline-flex items-center gap-1.5 pl-1.5 pr-1.5 py-0.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 shadow-2xs"
                        >
                          <span className="w-5 h-5 rounded-full bg-gradient-to-tr from-pink-500 to-rose-500 text-white text-[9px] font-bold flex items-center justify-center uppercase shrink-0">
                            {u.name?.slice(0, 2) || "U"}
                          </span>
                          <span className="max-w-[110px] truncate">{u.name || u.fullName}</span>
                          <button
                            type="button"
                            onClick={() => setNewMemberIds((prev) => prev.filter((id) => id !== userId))}
                            className="w-4 h-4 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center cursor-pointer transition-colors shrink-0 shadow-2xs"
                            title={`Xóa ${u.name}`}
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      );
                    })
                  )}
                </div>

                {/* Add member popover */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="w-full py-2 border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-pink-400 dark:hover:border-pink-500 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-pink-600 dark:hover:text-pink-400 flex items-center justify-center gap-1.5 transition-colors cursor-pointer bg-slate-50/50 dark:bg-slate-950/50"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm Thành Viên Vào Nhóm</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl space-y-2">
                    <div className="text-xs font-bold text-slate-900 dark:text-white pb-1 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5">
                      <UserPlus className="w-3.5 h-3.5 text-pink-500" />
                      Chọn thành viên thêm vào
                    </div>
                    <input
                      type="text"
                      placeholder="Tìm theo tên hoặc username..."
                      value={createMemberSearch}
                      onChange={(e) => setCreateMemberSearch(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:border-pink-500"
                    />
                    <div className="max-h-48 overflow-y-auto space-y-0.5">
                      {allUsers
                        .filter((u: any) => !newMemberIds.includes(u.id))
                        .filter((u: any) => {
                          if (!createMemberSearch.trim()) return true;
                          const q = createMemberSearch.toLowerCase();
                          return (
                            (u.name && u.name.toLowerCase().includes(q)) ||
                            (u.fullName && u.fullName.toLowerCase().includes(q)) ||
                            (u.username && u.username.toLowerCase().includes(q))
                          );
                        })
                        .map((u: any) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              setNewMemberIds((prev) => [...prev, u.id]);
                            }}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-pink-50 dark:hover:bg-pink-950/40 transition-colors cursor-pointer text-left"
                          >
                            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-pink-500 to-rose-500 text-white text-[10px] font-bold flex items-center justify-center uppercase shrink-0">
                              {u.name?.slice(0, 2)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{u.name || u.fullName}</div>
                              <div className="text-[10px] text-slate-400 truncate">
                                @{u.username} {u.groupName ? `· Nhóm: ${u.groupName}` : "· Chưa có nhóm"}
                              </div>
                            </div>
                            <Plus className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                          </button>
                        ))}
                      {allUsers.filter((u: any) => !newMemberIds.includes(u.id)).length === 0 && (
                        <div className="text-xs text-slate-400 italic py-2 text-center">Tất cả nhân sự đã được chọn</div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
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
                  disabled={createTeamMutation.isPending}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white shadow-md shadow-pink-600/30 cursor-pointer disabled:opacity-60"
                >
                  {createTeamMutation.isPending ? "Đang tạo..." : "Tạo Nhóm"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Group */}
      {isEditOpen && editingTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Pencil className="w-4 h-4 text-pink-500" />
                Chỉnh Sửa Nhóm {editingTeam.name}
              </h3>
              <button
                onClick={() => setIsEditOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Tên Nhóm *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-pink-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Mô Tả Nhóm
                </label>
                <textarea
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Nhập mô tả hoạt động hoặc mục tiêu của nhóm..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-pink-500 resize-none min-h-[72px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Màu Sắc Nhãn Nhóm
                </label>
                <div className="flex items-center gap-2">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setEditColor(c.value)}
                      className={`w-7 h-7 rounded-full ${c.class} transition-transform cursor-pointer ${editColor === c.value
                        ? "ring-2 ring-offset-2 ring-pink-500 scale-110"
                        : "opacity-80 hover:opacity-100"
                        }`}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Chỉ Định Trưởng Nhóm (Leader) — Tự động cấp quyền LEAD
                </label>
                <Select
                  value={editLeaderId || "UNASSIGNED"}
                  onValueChange={(val) => setEditLeaderId(val === "UNASSIGNED" ? "" : val)}
                >
                  <SelectTrigger className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white cursor-pointer">
                    <SelectValue placeholder="-- Chưa chỉ định leader --">
                      {(() => {
                        const leader = allUsers.find((u: any) => u.id === editLeaderId);
                        return leader ? (
                          <div className="flex items-center gap-2 min-w-0">
                            {renderUserAvatar(leader, "w-4 h-4 text-[8px]")}
                            <span className="truncate">{leader.fullName || leader.name}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-- Chưa chỉ định leader --</span>
                        );
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl max-h-56">
                    <SelectItem value="UNASSIGNED" className="text-xs text-slate-400 cursor-pointer">
                      -- Chưa chỉ định leader --
                    </SelectItem>
                    {allUsers.map((u: any) => (
                      <SelectItem key={u.id} value={u.id} className="text-xs cursor-pointer">
                        <div className="flex items-center gap-2">
                          {renderUserAvatar(u, "w-4 h-4 text-[8px]")}
                          <span>{u.fullName || u.name} ({u.role})</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Member Management in Edit Modal */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Thành Viên Nhóm ({editMemberIds.length})
                </label>

                {/* Member chips */}
                <div className="min-h-[44px] p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-wrap items-center gap-1.5 mb-2">
                  {editMemberIds.length === 0 ? (
                    <span className="text-xs text-slate-400 italic px-1">Chưa có thành viên nào trong nhóm</span>
                  ) : (
                    editMemberIds.map((userId) => {
                      const u = allUsers.find((x: any) => x.id === userId) || editingTeam.members?.find((x: any) => x.id === userId);
                      if (!u) return null;
                      return (
                        <span
                          key={userId}
                          className="inline-flex items-center gap-1.5 pl-1.5 pr-1.5 py-0.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 shadow-2xs"
                        >
                          <span className="w-5 h-5 rounded-full bg-gradient-to-tr from-pink-500 to-rose-500 text-white text-[9px] font-bold flex items-center justify-center uppercase shrink-0">
                            {u.name?.slice(0, 2) || "U"}
                          </span>
                          <span className="max-w-[110px] truncate">{u.name || u.fullName}</span>
                          <button
                            type="button"
                            onClick={() => setEditMemberIds((prev) => prev.filter((id) => id !== userId))}
                            className="w-4 h-4 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center cursor-pointer transition-colors shrink-0 shadow-2xs"
                            title={`Xóa ${u.name}`}
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      );
                    })
                  )}
                </div>

                {/* Add member popover */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="w-full py-2 border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-pink-400 dark:hover:border-pink-500 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-pink-600 dark:hover:text-pink-400 flex items-center justify-center gap-1.5 transition-colors cursor-pointer bg-slate-50/50 dark:bg-slate-950/50"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm Thành Viên Vào Nhóm</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl space-y-2">
                    <div className="text-xs font-bold text-slate-900 dark:text-white pb-1 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5">
                      <UserPlus className="w-3.5 h-3.5 text-pink-500" />
                      Chọn thành viên thêm vào
                    </div>
                    <input
                      type="text"
                      placeholder="Tìm theo tên hoặc username..."
                      value={editMemberSearch}
                      onChange={(e) => setEditMemberSearch(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:border-pink-500"
                    />
                    <div className="max-h-48 overflow-y-auto space-y-0.5">
                      {allUsers
                        .filter((u: any) => !editMemberIds.includes(u.id))
                        .filter((u: any) => {
                          if (!editMemberSearch.trim()) return true;
                          const q = editMemberSearch.toLowerCase();
                          return (
                            (u.name && u.name.toLowerCase().includes(q)) ||
                            (u.fullName && u.fullName.toLowerCase().includes(q)) ||
                            (u.username && u.username.toLowerCase().includes(q))
                          );
                        })
                        .map((u: any) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              setEditMemberIds((prev) => [...prev, u.id]);
                            }}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-pink-50 dark:hover:bg-pink-950/40 transition-colors cursor-pointer text-left"
                          >
                            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-pink-500 to-rose-500 text-white text-[10px] font-bold flex items-center justify-center uppercase shrink-0">
                              {u.name?.slice(0, 2)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{u.name || u.fullName}</div>
                              <div className="text-[10px] text-slate-400 truncate">
                                @{u.username} {u.groupName ? `· Nhóm: ${u.groupName}` : "· Chưa có nhóm"}
                              </div>
                            </div>
                            <Plus className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                          </button>
                        ))}
                      {allUsers.filter((u: any) => !editMemberIds.includes(u.id)).length === 0 && (
                        <div className="text-xs text-slate-400 italic py-2 text-center">Tất cả nhân sự đã trong nhóm</div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
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
                  disabled={updateTeamMutation.isPending}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white shadow-md shadow-pink-600/30 cursor-pointer disabled:opacity-60"
                >
                  {updateTeamMutation.isPending ? "Đang lưu..." : "Lưu Thay Đổi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirm Delete Single Group */}
      {isDeleteOpen && teamToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Xác nhận xóa nhóm
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Bạn có chắc muốn xóa nhóm <strong className="text-slate-800 dark:text-slate-200">{teamToDelete.name}</strong>?
                </p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/60 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
              <div><span className="font-semibold">Số thành viên:</span> {teamToDelete.membersCount} nhân sự</div>
              <div><span className="font-semibold">Tài khoản liên đới:</span> {teamToDelete.totalAccounts} accounts</div>
              <p className="text-xs text-amber-600 dark:text-amber-400 pt-1">
                ⚠️ Các thành viên trong nhóm này sẽ được chuyển về trạng thái Chưa phân nhóm.
              </p>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteOpen(false);
                  setTeamToDelete(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={deleteTeamMutation.isPending}
                onClick={() => {
                  deleteTeamMutation.mutate({ id: teamToDelete.id });
                }}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deleteTeamMutation.isPending ? "Đang xóa..." : "Xác nhận xóa"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Bulk Assign Leader */}
      {isBulkAssignLeaderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Crown className="w-4 h-4 text-cyan-500" />
                Chỉ Định Leader Cho {selectedTeamIds.length} Nhóm
              </h3>
              <button
                onClick={() => setIsBulkAssignLeaderOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Chọn Trưởng Nhóm (Leader)
                </label>
                <Select
                  value={bulkLeaderId || "UNASSIGNED"}
                  onValueChange={(val) => setBulkLeaderId(val === "UNASSIGNED" ? "" : val)}
                >
                  <SelectTrigger className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white cursor-pointer">
                    <SelectValue placeholder="-- Chưa chỉ định leader --" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl max-h-56">
                    <SelectItem value="UNASSIGNED" className="text-xs text-slate-400 cursor-pointer">
                      -- Bỏ chỉ định leader --
                    </SelectItem>
                    {allUsers.map((u: any) => (
                      <SelectItem key={u.id} value={u.id} className="text-xs cursor-pointer">
                        {u.fullName || u.name} ({u.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsBulkAssignLeaderOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={bulkAssignTeamLeaderMutation.isPending}
                  onClick={() => {
                    bulkAssignTeamLeaderMutation.mutate({
                      groupIds: selectedTeamIds,
                      leaderId: bulkLeaderId || null,
                    });
                  }}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-600/30 cursor-pointer disabled:opacity-60"
                >
                  {bulkAssignTeamLeaderMutation.isPending ? "Đang gán..." : "Áp Dụng Cho Tất Cả"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Bulk Change Color */}
      {isBulkColorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Palette className="w-4 h-4 text-pink-500" />
                Đổi Màu Nhãn Cho {selectedTeamIds.length} Nhóm
              </h3>
              <button
                onClick={() => setIsBulkColorOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Chọn Màu Mới
                </label>
                <div className="flex items-center gap-3">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setBulkColorVal(c.value)}
                      className={`w-8 h-8 rounded-full ${c.class} transition-transform cursor-pointer ${bulkColorVal === c.value
                        ? "ring-2 ring-offset-2 ring-pink-500 scale-115"
                        : "opacity-80 hover:opacity-100"
                        }`}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsBulkColorOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={bulkChangeColorMutation.isPending}
                  onClick={() => {
                    bulkChangeColorMutation.mutate({
                      groupIds: selectedTeamIds,
                      color: bulkColorVal,
                    });
                  }}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white shadow-md shadow-pink-600/30 cursor-pointer disabled:opacity-60"
                >
                  {bulkChangeColorMutation.isPending ? "Đang đổi..." : "Áp Dụng"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Bulk Delete Confirm */}
      {isBulkDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Xác nhận xóa hàng loạt
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Bạn có chắc muốn xóa <strong className="text-rose-500">{selectedTeamIds.length}</strong> nhóm đã chọn?
                </p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/60 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
              <p className="text-amber-600 dark:text-amber-400">
                ⚠️ Tất cả nhân sự trong các nhóm này sẽ được chuyển về trạng thái Chưa phân nhóm. Hành động này không thể hoàn tác.
              </p>
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
                disabled={bulkDeleteTeamsMutation.isPending}
                onClick={() => {
                  bulkDeleteTeamsMutation.mutate({
                    groupIds: selectedTeamIds,
                  });
                }}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{bulkDeleteTeamsMutation.isPending ? "Đang xóa..." : `Xóa ${selectedTeamIds.length} nhóm`}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TeamsManagementPage() {
  return (
    <Suspense fallback={<DataTableSkeleton columnCount={7} rowCount={6} />}>
      <TeamsManagementContent />
    </Suspense>
  );
}

