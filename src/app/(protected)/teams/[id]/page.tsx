"use client";

import { useState, useMemo, useEffect, useRef, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Users,
  ArrowLeft,
  Shield,
  ShieldCheck,
  UserCheck,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  Video,
  Activity,
  UserCog,
  Check,
  X,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Trash2,
  Download,
  Crown,
  UserPlus,
  RefreshCw,
  ExternalLink,
  Laptop,
  Mail,
  Sparkles,
  ArrowRightLeft,
  Flame,
  Globe,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { useTableColumnResize } from "@/hooks/useTableColumnResize";
import { TeamDetailSkeleton } from "@/components/skeletons/PageSkeletons";
import { TeamScopeBanner } from "@/components/team/TeamScopeBanner";
import { Checkbox } from "@/components/ui/checkbox";
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
import { format } from "date-fns";
import { useCurrency } from "@/contexts/CurrencyContext";
import { toast } from "sonner";

// Table Column Resize Config
const TEAM_MEMBERS_COLUMN_CONFIG = {
  member: { minWidth: 220, maxWidth: 400, defaultWidth: 260 },
  role: { minWidth: 120, maxWidth: 180, defaultWidth: 140 },
  status: { minWidth: 130, maxWidth: 200, defaultWidth: 150 },
  machine: { minWidth: 160, maxWidth: 260, defaultWidth: 180 },
  accounts: { minWidth: 130, maxWidth: 220, defaultWidth: 150 },
  revenue: { minWidth: 130, maxWidth: 220, defaultWidth: 150 },
  views: { minWidth: 130, maxWidth: 200, defaultWidth: 140 },
  createdAt: { minWidth: 120, maxWidth: 180, defaultWidth: 130 },
  actions: { minWidth: 80, maxWidth: 100, defaultWidth: 90 },
};

const COLOR_SWATCHES = [
  { value: "pink", label: "Hồng Neon", bg: "bg-pink-500", border: "border-pink-500" },
  { value: "purple", label: "Tím Thạch Anh", bg: "bg-purple-500", border: "border-purple-500" },
  { value: "blue", label: "Xanh Biển", bg: "bg-blue-500", border: "border-blue-500" },
  { value: "cyan", label: "Xanh Ngọc", bg: "bg-cyan-500", border: "border-cyan-500" },
  { value: "emerald", label: "Xanh Lá", bg: "bg-emerald-500", border: "border-emerald-500" },
  { value: "amber", label: "Vàng Cam", bg: "bg-amber-500", border: "border-amber-500" },
  { value: "rose", label: "Đỏ Hoa Hồng", bg: "bg-rose-500", border: "border-rose-500" },
];

function getColorClass(color?: string | null) {
  switch (color) {
    case "purple":
      return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30";
    case "blue":
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30";
    case "cyan":
      return "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30";
    case "emerald":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
    case "amber":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
    case "rose":
      return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30";
    default:
      return "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/30";
  }
}

function TeamDetailContent() {
  const params = useParams();
  const router = useRouter();
  const teamId = params?.id as string;
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { confirm } = useConfirmDialog();
  const { formatAmount } = useCurrency();

  const userRole = session?.user?.role || "STAFF";
  const isAdmin = userRole === "ADMIN";

  // Queries
  const utils = trpc.useUtils();
  const {
    data: teamDetail,
    isLoading,
    isRefetching,
    refetch,
    error,
  } = trpc.admin.getTeamDetail.useQuery(
    { id: teamId },
    { enabled: !!teamId, staleTime: 15000 }
  );

  const { data: assignableStaff = [], isLoading: loadingAssignable } =
    trpc.admin.listAssignableStaff.useQuery(
      { teamId },
      { enabled: !!teamId }
    );

  // Mutations
  const addMembersMutation = trpc.admin.addTeamMembers.useMutation({
    onSuccess: (res) => {
      toast.success(`Đã thêm thành công ${res.count} thành viên vào đội nhóm!`);
      setIsAddMemberModalOpen(false);
      setSelectedNewMemberIds([]);
      utils.admin.getTeamDetail.invalidate({ id: teamId });
      utils.admin.listTeams.invalidate();
      utils.admin.listUsers.invalidate();
    },
    onError: (err: any) => {
      toast.error(err.message || "Lỗi khi thêm thành viên vào đội");
    },
  });

  const removeMemberMutation = trpc.admin.removeTeamMember.useMutation({
    onSuccess: () => {
      toast.success("Đã xóa thành viên khỏi đội nhóm thành công!");
      utils.admin.getTeamDetail.invalidate({ id: teamId });
      utils.admin.listTeams.invalidate();
      utils.admin.listUsers.invalidate();
    },
    onError: (err: any) => {
      toast.error(err.message || "Lỗi khi xóa thành viên khỏi đội");
    },
  });

  const transferLeaderMutation = trpc.admin.transferTeamLeader.useMutation({
    onSuccess: () => {
      toast.success("Đã chuyển giao quyền Trưởng nhóm thành công!");
      setIsTransferModalOpen(false);
      setTransferTargetUserId("");
      utils.admin.getTeamDetail.invalidate({ id: teamId });
      utils.admin.listTeams.invalidate();
      utils.admin.listUsers.invalidate();
    },
    onError: (err: any) => {
      toast.error(err.message || "Lỗi khi chuyển giao quyền Trưởng nhóm");
    },
  });

  const updateMetadataMutation = trpc.admin.updateTeamMetadata.useMutation({
    onSuccess: () => {
      toast.success("Cập nhật thông tin đội nhóm thành công!");
      setIsEditModalOpen(false);
      utils.admin.getTeamDetail.invalidate({ id: teamId });
      utils.admin.listTeams.invalidate();
    },
    onError: (err: any) => {
      toast.error(err.message || "Lỗi khi cập nhật thông tin đội nhóm");
    },
  });

  // Modals & form state
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [selectedNewMemberIds, setSelectedNewMemberIds] = useState<string[]>([]);
  const [memberSearchFilter, setMemberSearchFilter] = useState("");

  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferTargetUserId, setTransferTargetUserId] = useState<string>("");

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editColor, setEditColor] = useState("pink");

  // Table filters & sorting
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [fleetFilter, setFleetFilter] = useState<string>("ALL");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  const [sortKey, setSortKey] = useState<string>("role");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Sync edit modal when opening
  useEffect(() => {
    if (teamDetail?.team) {
      setEditName(teamDetail.team.name);
      setEditDesc(teamDetail.team.description || "");
      setEditColor(teamDetail.team.color || "pink");
    }
  }, [teamDetail?.team]);

  // Table column resizing
  const tableRef = useRef<HTMLDivElement>(null);
  const { getColumnStyle, getTableVars, renderResizeHandle } =
    useTableColumnResize({
      tableId: "team_members_v1",
      columns: TEAM_MEMBERS_COLUMN_CONFIG,
      tableRef,
      extraWidth: 60, // Selection checkbox
    });

  // Filtered and sorted members
  const members = teamDetail?.members || [];
  const canManage = !!teamDetail?.permissions.canManage;

  const filteredMembers = useMemo(() => {
    return members
      .filter((m) => {
        // Search
        const q = search.trim().toLowerCase();
        const matchesSearch =
          !q ||
          m.name?.toLowerCase().includes(q) ||
          m.fullName?.toLowerCase().includes(q) ||
          m.username?.toLowerCase().includes(q) ||
          m.email?.toLowerCase().includes(q);

        // Role
        const matchesRole =
          roleFilter === "ALL" ||
          m.role === roleFilter ||
          (roleFilter === "LEADER" && m.isLeader);

        // Status
        const matchesStatus =
          statusFilter === "ALL" ||
          (statusFilter === "ACTIVE" && m.isActive) ||
          (statusFilter === "INACTIVE" && !m.isActive);

        // Fleet
        const matchesFleet =
          fleetFilter === "ALL" ||
          (fleetFilter === "HAS_ACCOUNTS" && m.accountsCount > 0) ||
          (fleetFilter === "NO_ACCOUNTS" && m.accountsCount === 0);

        return matchesSearch && matchesRole && matchesStatus && matchesFleet;
      })
      .sort((a, b) => {
        // Always keep leader at top if default
        if (sortKey === "role") {
          if (a.isLeader && !b.isLeader) return -1;
          if (!a.isLeader && b.isLeader) return 1;
        }

        let valA: any = a[sortKey as keyof typeof a];
        let valB: any = b[sortKey as keyof typeof b];

        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();

        if (valA < valB) return sortDirection === "asc" ? -1 : 1;
        if (valA > valB) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
  }, [members, search, roleFilter, statusFilter, fleetFilter, sortKey, sortDirection]);

  // Bulk selection handlers
  const isAllSelected =
    filteredMembers.length > 0 &&
    filteredMembers.every((m) => selectedMemberIds.includes(m.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedMemberIds([]);
    } else {
      setSelectedMemberIds(filteredMembers.map((m) => m.id));
    }
  };

  const toggleSelectMember = (id: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkRemoveMembers = async () => {
    const nonLeaderIds = selectedMemberIds.filter(
      (id) => id !== teamDetail?.team.leader?.id
    );

    if (nonLeaderIds.length === 0) {
      toast.warning(
        "Không thể xóa Trưởng nhóm. Vui lòng bỏ chọn Trưởng nhóm hoặc chuyển giao quyền trước."
      );
      return;
    }

    const ok = await confirm({
      title: "Xóa thành viên khỏi đội nhóm",
      description: `Bạn có chắc chắn muốn xóa ${nonLeaderIds.length} thành viên đã chọn khỏi đội nhóm "${teamDetail?.team.name}"? Nhân sự này sẽ trở về trạng thái chưa phân đội.`,
      confirmLabel: "Xóa thành viên",
      variant: "danger",
    });

    if (!ok) return;

    for (const uId of nonLeaderIds) {
      await removeMemberMutation.mutateAsync({ teamId, userId: uId });
    }
    setSelectedMemberIds([]);
    toast.success(`Đã xóa ${nonLeaderIds.length} thành viên khỏi đội.`);
  };

  const handleSingleRemoveMember = async (member: any) => {
    if (member.isLeader) {
      toast.error(
        "Không thể xóa Trưởng nhóm. Vui lòng chuyển giao quyền Trưởng nhóm cho nhân sự khác trước khi rời đội."
      );
      return;
    }

    const ok = await confirm({
      title: "Xóa thành viên khỏi đội nhóm",
      description: `Bạn có chắc chắn muốn xóa "${member.fullName || member.name}" khỏi đội nhóm "${teamDetail?.team.name}"?`,
      confirmLabel: "Xác nhận xóa",
      variant: "danger",
    });

    if (ok) {
      removeMemberMutation.mutate({ teamId, userId: member.id });
    }
  };

  const handleTransferLeadership = async () => {
    if (!transferTargetUserId) {
      toast.warning("Vui lòng chọn nhân sự để trao quyền Trưởng nhóm.");
      return;
    }

    const targetMember =
      members.find((m) => m.id === transferTargetUserId) ||
      assignableStaff.find((s) => s.id === transferTargetUserId);

    const ok = await confirm({
      title: "Xác nhận Chuyển giao Đội Nhóm",
      description: `Bạn có chắc chắn muốn chuyển giao quyền Trưởng nhóm "${teamDetail?.team.name}" cho "${targetMember?.fullName || targetMember?.name}"? Nhân sự này sẽ được thăng cấp lên LEAD. Trưởng nhóm cũ sẽ trở lại vai trò STAFF nếu không quản lý đội nhóm nào khác.`,
      confirmLabel: "Chuyển giao quyền",
      variant: "danger",
    });

    if (ok) {
      transferLeaderMutation.mutate({
        teamId,
        newLeaderId: transferTargetUserId,
      });
    }
  };

  const handleExportCsv = () => {
    if (!filteredMembers.length) {
      toast.warning("Không có dữ liệu thành viên để xuất.");
      return;
    }

    const headers = [
      "Họ và tên",
      "Username",
      "Email",
      "Vai trò",
      "Là Trưởng nhóm",
      "Trạng thái",
      "Máy tính liên kết",
      "Số tài khoản TikTok",
      "Doanh thu ($)",
      "Tổng lượt xem",
      "Ngày tham gia",
    ];

    const rows = filteredMembers.map((m) => [
      `"${m.fullName || m.name || ""}"`,
      `"${m.username || ""}"`,
      `"${m.email || ""}"`,
      `"${m.role}"`,
      m.isLeader ? "Có" : "Không",
      m.isActive ? "Đang hoạt động" : "Đã khóa",
      `"${m.boundMachineName || "Chưa liên kết"}"`,
      m.accountsCount,
      m.totalRevenue,
      m.totalViews,
      format(new Date(m.createdAt), "dd/MM/yyyy"),
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `team-${teamDetail?.team.name.toLowerCase().replace(/\s+/g, "-")}-roster.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Xuất danh sách thành viên thành công!");
  };

  if (isLoading) {
    return <TeamDetailSkeleton />;
  }

  if (error || !teamDetail) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-8 space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-rose-50 dark:bg-rose-950/40 text-rose-500 border border-rose-200 dark:border-rose-900 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Không thể tải dữ liệu đội nhóm
        </h2>
        <p className="text-sm text-slate-500 max-w-md">
          {error?.message || "Đội nhóm không tồn tại hoặc bạn không có quyền truy cập."}
        </p>
        <Link
          href="/teams"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Quay lại danh sách Đội Nhóm
        </Link>
      </div>
    );
  }

  const { team, stats } = teamDetail;

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-300">
      <TeamScopeBanner
        customMessage="Bạn đang xem và quản lý trực tiếp các thành viên và dàn kênh thuộc đội nhóm của mình."
        className="mb-2"
      />
      {/* 1. Breadcrumbs & Top Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Link
            href="/teams"
            className="hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 transition-colors font-medium"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Đội Nhóm (Teams)</span>
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-bold text-slate-900 dark:text-white truncate max-w-[200px]">
            {team.name}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isRefetching}
                className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin text-pink-500" : ""}`}
                />
                <span className="hidden sm:inline">Làm Mới</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Cập nhật dữ liệu đội nhóm</TooltipContent>
          </Tooltip>

          <button
            type="button"
            onClick={handleExportCsv}
            className="h-9 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất Roster</span>
          </button>

          {canManage && (
            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              className="h-9 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Pencil className="w-3.5 h-3.5 text-slate-500" />
              <span>Sửa Team</span>
            </button>
          )}

          {canManage && (
            <button
              type="button"
              onClick={() => setIsAddMemberModalOpen(true)}
              className="h-9 px-4 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-md shadow-pink-600/20 active:scale-95 transition-all text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Thêm Thành Viên</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Hero Header Card */}
      <div className="relative overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 sm:p-8 shadow-sm">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-pink-500/10 via-purple-500/5 to-transparent rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Team Brand & Details */}
          <div className="space-y-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${getColorClass(
                  team.color
                )}`}
              >
                Team Workspace
              </span>
              <span className="text-xs text-slate-400 font-medium">
                Khởi tạo ngày {format(new Date(team.createdAt), "dd/MM/yyyy")}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl text-white shadow-lg ${
                  team.color === "blue"
                    ? "bg-gradient-to-br from-blue-500 to-cyan-600 shadow-blue-500/30"
                    : team.color === "emerald"
                    ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/30"
                    : team.color === "amber"
                    ? "bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/30"
                    : team.color === "purple"
                    ? "bg-gradient-to-br from-purple-500 to-indigo-600 shadow-purple-500/30"
                    : "bg-gradient-to-br from-pink-500 to-rose-600 shadow-pink-500/30"
                }`}
              >
                {team.name.charAt(0).toUpperCase()}
              </div>

              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                  <span>{team.name}</span>
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 max-w-2xl">
                  {team.description || "Không có mô tả chi tiết cho đội nhóm này."}
                </p>
              </div>
            </div>
          </div>

          {/* Team Leader Banner */}
          <div className="shrink-0 flex items-center gap-4 bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 lg:min-w-[340px]">
            {team.leader ? (
              <div className="flex items-center justify-between w-full gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    {team.leader.avatar ? (
                      <img
                        src={team.leader.avatar}
                        alt={team.leader.name || "Leader"}
                        className="w-11 h-11 rounded-2xl object-cover border-2 border-amber-500 shadow-sm"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40 flex items-center justify-center font-bold text-sm">
                        {team.leader.name?.charAt(0).toUpperCase() || "L"}
                      </div>
                    )}
                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shadow-xs">
                      <Crown className="w-3 h-3 fill-slate-950" />
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-slate-900 dark:text-white truncate">
                        {team.leader.fullName || team.leader.name || team.leader.username}
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-black uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                        Leader
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {team.leader.email}
                    </p>
                  </div>
                </div>

                {canManage && (
                  <button
                    type="button"
                    onClick={() => {
                      setTransferTargetUserId("");
                      setIsTransferModalOpen(true);
                    }}
                    className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 transition-colors shrink-0 cursor-pointer shadow-2xs"
                  >
                    <ArrowRightLeft className="w-3 h-3 text-amber-500" />
                    <span className="hidden sm:inline">Chuyển Giao</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between w-full gap-3">
                <div className="flex items-center gap-2.5 text-xs text-amber-600 dark:text-amber-400 font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Đội nhóm chưa có Trưởng nhóm!</span>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => {
                      setTransferTargetUserId("");
                      setIsTransferModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow-sm shrink-0 cursor-pointer"
                  >
                    Bổ nhiệm Leader
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Enterprise Metric Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Members */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Tổng Thành Viên
            </span>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {stats.totalMembers}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
              <CheckCircle className="w-3 h-3" />
              <span>{stats.activeMembers} đang hoạt động</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Metric 2: Fleet TikTok Accounts */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Dàn Kênh TikTok
            </span>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {stats.totalAccounts}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-1">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                {stats.activeAccounts} Active
              </span>
              <span>•</span>
              <span className="text-rose-600 dark:text-rose-400 font-bold">
                {stats.bannedAccounts} Banned
              </span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center">
            <Video className="w-6 h-6" />
          </div>
        </div>

        {/* Metric 3: Total Revenue */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Doanh Thu Hợp Nhất
            </span>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {formatAmount(stats.totalRevenue)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Toàn bộ dàn tài khoản thuộc đội
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        {/* Metric 4: Total Views */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Tổng Lượt Xem Video
            </span>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {stats.totalViews.toLocaleString()}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-purple-600 dark:text-purple-400 font-semibold mt-1">
              <TrendingUp className="w-3 h-3" />
              <span>{stats.totalFollowers.toLocaleString()} người theo dõi</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 flex items-center justify-center">
            <Activity className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 4. Filter Toolbar & Member Roster Controls */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo tên nhân sự, username, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-9 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-pink-500 transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Role */}
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-8.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-xs font-semibold">
                <SelectValue placeholder="Tất Cả Vai Trò" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất Cả Vai Trò</SelectItem>
                <SelectItem value="LEADER">Trưởng Nhóm (Leader)</SelectItem>
                <SelectItem value="LEAD">Vai Trò Lead</SelectItem>
                <SelectItem value="STAFF">Nhân Viên (Staff)</SelectItem>
                <SelectItem value="ADMIN">Quản Trị Viên (Admin)</SelectItem>
              </SelectContent>
            </Select>

            {/* Filter Status */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-xs font-semibold">
                <SelectValue placeholder="Trạng Thái Hoạt Động" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất Cả Trạng Thái</SelectItem>
                <SelectItem value="ACTIVE">Đang Hoạt Động</SelectItem>
                <SelectItem value="INACTIVE">Đã Bị Khóa</SelectItem>
              </SelectContent>
            </Select>

            {/* Filter Fleet */}
            <Select value={fleetFilter} onValueChange={setFleetFilter}>
              <SelectTrigger className="h-8.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-xs font-semibold">
                <SelectValue placeholder="Dàn Kênh TikTok" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất Cả Tài Khoản</SelectItem>
                <SelectItem value="HAS_ACCOUNTS">Đang Phụ Trách Kênh</SelectItem>
                <SelectItem value="NO_ACCOUNTS">Chưa Có Kênh</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Selection actions ribbon */}
        {selectedMemberIds.length > 0 && (
          <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-pink-500/10 border border-pink-500/20 animate-in fade-in">
            <div className="flex items-center gap-2 text-xs font-bold text-pink-700 dark:text-pink-300">
              <CheckCircle className="w-4 h-4 text-pink-500" />
              <span>Đã chọn {selectedMemberIds.length} nhân sự</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedMemberIds([])}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors"
              >
                Bỏ chọn
              </button>
              {canManage && (
                <button
                  type="button"
                  onClick={handleBulkRemoveMembers}
                  className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-xs cursor-pointer transition-all flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa khỏi Đội</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 5. Members Table */}
      <div
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs"
        style={getTableVars()}
      >
        <div ref={tableRef} className="overflow-x-auto relative">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 font-bold text-slate-600 dark:text-slate-400 select-none">
                {/* Select All */}
                <th className="w-12 px-3 py-3.5 text-center">
                  <Checkbox
                    checked={isAllSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Chọn tất cả"
                  />
                </th>

                {/* Member */}
                <th
                  style={getColumnStyle("member")}
                  className="relative px-3 py-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white"
                  onClick={() => {
                    if (sortKey === "fullName") {
                      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
                    } else {
                      setSortKey("fullName");
                      setSortDirection("asc");
                    }
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Thành Viên</span>
                  </div>
                  {renderResizeHandle("member")}
                </th>

                {/* Role */}
                <th
                  style={getColumnStyle("role")}
                  className="relative px-3 py-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white"
                  onClick={() => {
                    if (sortKey === "role") {
                      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
                    } else {
                      setSortKey("role");
                      setSortDirection("asc");
                    }
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Vai Trò</span>
                  </div>
                  {renderResizeHandle("role")}
                </th>

                {/* Status */}
                <th
                  style={getColumnStyle("status")}
                  className="relative px-3 py-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white"
                  onClick={() => {
                    if (sortKey === "isActive") {
                      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
                    } else {
                      setSortKey("isActive");
                      setSortDirection("asc");
                    }
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Trạng Thái</span>
                  </div>
                  {renderResizeHandle("status")}
                </th>

                {/* Machine */}
                <th style={getColumnStyle("machine")} className="relative px-3 py-3.5">
                  <div className="flex items-center gap-1.5">
                    <span>Thiết Bị GPM / Máy</span>
                  </div>
                  {renderResizeHandle("machine")}
                </th>

                {/* Accounts Count */}
                <th
                  style={getColumnStyle("accounts")}
                  className="relative px-3 py-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white"
                  onClick={() => {
                    if (sortKey === "accountsCount") {
                      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
                    } else {
                      setSortKey("accountsCount");
                      setSortDirection("desc");
                    }
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Dàn Kênh</span>
                  </div>
                  {renderResizeHandle("accounts")}
                </th>

                {/* Revenue */}
                <th
                  style={getColumnStyle("revenue")}
                  className="relative px-3 py-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white"
                  onClick={() => {
                    if (sortKey === "totalRevenue") {
                      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
                    } else {
                      setSortKey("totalRevenue");
                      setSortDirection("desc");
                    }
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Doanh Thu</span>
                  </div>
                  {renderResizeHandle("revenue")}
                </th>

                {/* Views */}
                <th
                  style={getColumnStyle("views")}
                  className="relative px-3 py-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white"
                  onClick={() => {
                    if (sortKey === "totalViews") {
                      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
                    } else {
                      setSortKey("totalViews");
                      setSortDirection("desc");
                    }
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Lượt Xem</span>
                  </div>
                  {renderResizeHandle("views")}
                </th>

                {/* Joined At */}
                <th
                  style={getColumnStyle("createdAt")}
                  className="relative px-3 py-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white"
                  onClick={() => {
                    if (sortKey === "createdAt") {
                      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
                    } else {
                      setSortKey("createdAt");
                      setSortDirection("desc");
                    }
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Ngày Vào</span>
                  </div>
                  {renderResizeHandle("createdAt")}
                </th>

                {/* Actions */}
                <th
                  style={getColumnStyle("actions")}
                  className="px-3 py-3.5 text-right"
                >
                  Thao Tác
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-medium">
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                        <Users className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-semibold">
                        Không tìm thấy thành viên nào phù hợp với bộ lọc.
                      </p>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => setIsAddMemberModalOpen(true)}
                          className="px-4 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold transition-all cursor-pointer"
                        >
                          + Thêm Thành Viên Vào Đội
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredMembers.map((member) => {
                  const isSelected = selectedMemberIds.includes(member.id);

                  return (
                    <tr
                      key={member.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group ${
                        isSelected ? "bg-pink-500/5 dark:bg-pink-500/10" : ""
                      }`}
                    >
                      {/* Select Checkbox */}
                      <td className="px-3 py-3 text-center">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelectMember(member.id)}
                          aria-label={`Chọn ${member.fullName}`}
                        />
                      </td>

                      {/* Member Info */}
                      <td style={getColumnStyle("member")} className="px-3 py-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="relative shrink-0">
                            {member.avatar ? (
                              <img
                                src={member.avatar}
                                alt={member.name || "Member"}
                                className="w-9 h-9 rounded-xl object-cover border border-slate-200 dark:border-slate-800"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 text-slate-700 dark:text-slate-300 font-bold flex items-center justify-center text-xs">
                                {member.fullName?.charAt(0).toUpperCase() || "U"}
                              </div>
                            )}
                            {member.isLeader && (
                              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shadow-xs">
                                <Crown className="w-2.5 h-2.5 fill-slate-950" />
                              </span>
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Link
                                href={`/users/${member.id}`}
                                className="font-bold text-slate-900 dark:text-white hover:text-pink-600 dark:hover:text-pink-400 truncate transition-colors"
                              >
                                {member.fullName}
                              </Link>
                              {member.isLeader && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-black uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                                  Trưởng Nhóm
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                              @{member.username || member.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td style={getColumnStyle("role")} className="px-3 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase ${
                            member.role === "ADMIN"
                              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                              : member.role === "LEAD"
                              ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                              : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                          }`}
                        >
                          <Shield className="w-3 h-3" />
                          <span>{member.role}</span>
                        </span>
                      </td>

                      {/* Status */}
                      <td style={getColumnStyle("status")} className="px-3 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            member.isActive
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                              : "bg-slate-200 dark:bg-slate-800 text-slate-500 border border-slate-300 dark:border-slate-700"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              member.isActive ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
                            }`}
                          />
                          <span>{member.isActive ? "Hoạt động" : "Bị chặn"}</span>
                        </span>
                      </td>

                      {/* Machine Binding */}
                      <td style={getColumnStyle("machine")} className="px-3 py-3">
                        {member.boundMachineName ? (
                          <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                            <Laptop className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span className="truncate max-w-[140px] font-mono text-[11px]">
                              {member.boundMachineName}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">
                            Chưa gán máy
                          </span>
                        )}
                      </td>

                      {/* Accounts Fleet */}
                      <td style={getColumnStyle("accounts")} className="px-3 py-3">
                        {member.accountsCount > 0 ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Link
                                href={`/accounts?operatorId=${member.id}`}
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors"
                              >
                                <Video className="w-3 h-3 text-pink-500" />
                                <span>{member.accountsCount} kênh</span>
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-xs">
                              <p className="font-bold mb-1">Các kênh phụ trách:</p>
                              <ul className="list-disc pl-4 space-y-0.5">
                                {member.accounts.slice(0, 5).map((a) => (
                                  <li key={a.id} className="truncate">
                                    @{a.username} ({a.country}) - {a.status}
                                  </li>
                                ))}
                                {member.accountsCount > 5 && (
                                  <li className="text-slate-400 italic">
                                    + {member.accountsCount - 5} kênh khác...
                                  </li>
                                )}
                              </ul>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-slate-400 text-xs">0 kênh</span>
                        )}
                      </td>

                      {/* Revenue */}
                      <td style={getColumnStyle("revenue")} className="px-3 py-3">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {formatAmount(member.totalRevenue)}
                        </span>
                      </td>

                      {/* Views */}
                      <td style={getColumnStyle("views")} className="px-3 py-3">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {member.totalViews.toLocaleString()}
                        </span>
                      </td>

                      {/* Created At */}
                      <td style={getColumnStyle("createdAt")} className="px-3 py-3 text-slate-400">
                        {format(new Date(member.createdAt), "dd/MM/yyyy")}
                      </td>

                      {/* Actions Dropdown */}
                      <td style={getColumnStyle("actions")} className="px-3 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 text-xs">
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/users/${member.id}`}
                                className="flex items-center gap-2 cursor-pointer"
                              >
                                <UserCog className="w-3.5 h-3.5 text-slate-500" />
                                <span>Xem Chi Tiết Nhân Sự</span>
                              </Link>
                            </DropdownMenuItem>

                            <DropdownMenuItem asChild>
                              <Link
                                href={`/accounts?operatorId=${member.id}`}
                                className="flex items-center gap-2 cursor-pointer"
                              >
                                <Video className="w-3.5 h-3.5 text-pink-500" />
                                <span>Xem Dàn Kênh TikTok</span>
                              </Link>
                            </DropdownMenuItem>

                            {canManage && !member.isLeader && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    setTransferTargetUserId(member.id);
                                    setIsTransferModalOpen(true);
                                  }}
                                  className="flex items-center gap-2 text-amber-600 dark:text-amber-400 cursor-pointer font-medium"
                                >
                                  <Crown className="w-3.5 h-3.5" />
                                  <span>Giao Quyền Trưởng Nhóm</span>
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                  onClick={() => handleSingleRemoveMember(member)}
                                  className="flex items-center gap-2 text-rose-600 dark:text-rose-400 cursor-pointer font-medium"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Xóa Khỏi Đội Nhóm</span>
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Modal: Add Members to Team */}
      <Dialog open={isAddMemberModalOpen} onOpenChange={setIsAddMemberModalOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] flex flex-col p-6 rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-pink-500" />
              <span>Thêm Thành Viên Vào {team.name}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-hidden flex flex-col pt-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Chọn nhân sự từ danh sách hệ thống để thêm vào đội nhóm. Nhân sự đã thuộc đội khác sẽ được tự động chuyển sang đội này.
            </p>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm nhân sự theo tên, username, email..."
                value={memberSearchFilter}
                onChange={(e) => setMemberSearchFilter(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-pink-500"
              />
            </div>

            {/* List candidate members */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80 pr-1 max-h-72 border border-slate-100 dark:border-slate-800 rounded-2xl">
              {loadingAssignable ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Đang tải danh sách nhân sự...
                </div>
              ) : (
                assignableStaff
                  .filter((s) => !s.isInCurrentTeam)
                  .filter((s) => {
                    const q = memberSearchFilter.trim().toLowerCase();
                    return (
                      !q ||
                      s.name?.toLowerCase().includes(q) ||
                      s.fullName?.toLowerCase().includes(q) ||
                      s.username?.toLowerCase().includes(q) ||
                      s.email?.toLowerCase().includes(q)
                    );
                  })
                  .map((staff) => {
                    const isChecked = selectedNewMemberIds.includes(staff.id);
                    return (
                      <div
                        key={staff.id}
                        onClick={() => {
                          setSelectedNewMemberIds((prev) =>
                            prev.includes(staff.id)
                              ? prev.filter((id) => id !== staff.id)
                              : [...prev, staff.id]
                          );
                        }}
                        className={`flex items-center justify-between p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                          isChecked ? "bg-pink-500/5 dark:bg-pink-500/10" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Checkbox checked={isChecked} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                {staff.fullName}
                              </span>
                              <span className="text-[10px] font-semibold text-slate-400">
                                ({staff.role})
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 truncate">
                              {staff.email} • {staff.accountsCount} kênh
                            </p>
                          </div>
                        </div>

                        <div>
                          {staff.teamName ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                              Đang ở: {staff.teamName}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              Chưa vào đội
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>

          <DialogFooter className="pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsAddMemberModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={selectedNewMemberIds.length === 0 || addMembersMutation.isPending}
              onClick={() => {
                addMembersMutation.mutate({
                  teamId,
                  userIds: selectedNewMemberIds,
                });
              }}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white disabled:opacity-50 cursor-pointer shadow-sm transition-all"
            >
              {addMembersMutation.isPending
                ? "Đang thêm..."
                : `Thêm ${selectedNewMemberIds.length} nhân sự vào đội`}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 7. Modal: Transfer Leadership */}
      <Dialog open={isTransferModalOpen} onOpenChange={setIsTransferModalOpen}>
        <DialogContent className="max-w-md p-6 rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-500" />
              <span>Chuyển Giao Quyền Trưởng Nhóm</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              <strong>Lưu ý quan trọng:</strong> Trưởng nhóm mới sẽ tự động được thăng cấp vai trò <strong>LEAD</strong> và được cấp toàn quyền quản lý đội nhóm này. Trưởng nhóm cũ sẽ tự động trở về vai trò <strong>STAFF</strong> trừ khi là Quản trị viên hoặc đang phụ trách đội nhóm khác.
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Chọn Trưởng Nhóm Mới
              </label>
              <Select
                value={transferTargetUserId}
                onValueChange={setTransferTargetUserId}
              >
                <SelectTrigger className="h-10 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-xs font-semibold">
                  <SelectValue placeholder="-- Chọn nhân sự làm Trưởng nhóm --" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {members.map((m) => (
                    <SelectItem
                      key={m.id}
                      value={m.id}
                      disabled={m.isLeader}
                      className="text-xs font-medium cursor-pointer"
                    >
                      {m.fullName} (@{m.username || m.email}) {m.isLeader ? "(Hiện tại)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsTransferModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={!transferTargetUserId || transferLeaderMutation.isPending}
              onClick={handleTransferLeadership}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-50 cursor-pointer shadow-sm transition-all"
            >
              {transferLeaderMutation.isPending ? "Đang xử lý..." : "Xác Nhận Chuyển Giao"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 8. Modal: Edit Team Metadata */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-md p-6 rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Pencil className="w-5 h-5 text-pink-500" />
              <span>Chỉnh Sửa Thông Tin Đội Nhóm</span>
            </DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editName.trim()) return;
              updateMetadataMutation.mutate({
                teamId,
                name: editName.trim(),
                description: editDesc.trim() || null,
                color: editColor,
              });
            }}
            className="space-y-4 pt-2"
          >
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Tên Đội Nhóm (Team Name) *
              </label>
              <input
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-pink-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Mô Tả Đội Nhóm
              </label>
              <textarea
                rows={3}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Mục tiêu, thị trường hoặc thông tin phụ trách của đội..."
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-pink-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Nhãn Màu Sắc
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {COLOR_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.value}
                    type="button"
                    onClick={() => setEditColor(swatch.value)}
                    className={`w-7 h-7 rounded-xl ${swatch.bg} flex items-center justify-center text-white transition-all cursor-pointer ${
                      editColor === swatch.value
                        ? "ring-2 ring-offset-2 ring-slate-900 dark:ring-white scale-110"
                        : "opacity-80 hover:opacity-100"
                    }`}
                    title={swatch.label}
                  >
                    {editColor === swatch.value && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            </div>

            <DialogFooter className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={!editName.trim() || updateMetadataMutation.isPending}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white disabled:opacity-50 cursor-pointer shadow-sm transition-all"
              >
                {updateMetadataMutation.isPending ? "Đang lưu..." : "Lưu Thay Đổi"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TeamDetailPage() {
  return (
    <Suspense fallback={<TeamDetailSkeleton />}>
      <TeamDetailContent />
    </Suspense>
  );
}
