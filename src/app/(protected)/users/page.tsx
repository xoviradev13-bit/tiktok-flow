"use client";

import { useState, useMemo, useEffect, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useUrlParams } from "@/hooks/useUrlState";
import { useSession } from "next-auth/react";
import {
  UserCog,
  Shield,
  ShieldCheck,
  UserCheck,
  Plus,
  Search,
  Filter,
  X,
  Trash2,
  Pencil,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  Check,
  UserX,
  Eye,
  Users,
  FolderPlus,
  Layers,
  Columns3,
  MoreHorizontal,
  Mail,
  Send,
  Copy,
  Clock,
  RotateCcw,
  Ban,
  CheckCircle2,
  ExternalLink,
  Key,
  Download,
  RefreshCw,
  EyeOff,
  LayoutGrid,
  List,
  Crown,
  User,
  ArrowRight,
  Monitor,
  MonitorX,
  Inbox,
  KeyRound,
  Calendar,
} from "lucide-react";
import { Pagination } from "@/components/ui/pagination";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { UsersPageSkeleton } from "@/components/skeletons/PageSkeletons";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { trpc } from "@/lib/trpc";
import { useTableColumnResize } from "@/hooks/useTableColumnResize";
import { useConfirmDialog } from "@/components/ui/confirm-modal";

const USERS_COLUMN_RESIZE_CONFIG = {
  fullName: { minWidth: 160, maxWidth: 450, defaultWidth: 220 },
  username: { minWidth: 110, maxWidth: 300, defaultWidth: 150 },
  email: { minWidth: 140, maxWidth: 380, defaultWidth: 200 },
  role: { minWidth: 90, maxWidth: 240, defaultWidth: 130 },
  groupName: { minWidth: 120, maxWidth: 300, defaultWidth: 160 },
  accountsCount: { minWidth: 110, maxWidth: 260, defaultWidth: 155 },
  isActive: { minWidth: 110, maxWidth: 260, defaultWidth: 150 },
  actions: { minWidth: 90, maxWidth: 220, defaultWidth: 110 },
} as const;

type SortKey = "fullName" | "username" | "email" | "role" | "groupName" | "accountsCount" | "isActive" | "createdAt";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "fullName", label: "Họ & tên" },
  { key: "username", label: "Username" },
  { key: "email", label: "Email" },
  { key: "role", label: "Vai trò" },
  { key: "groupName", label: "Nhóm" },
  { key: "accountsCount", label: "Số acc phụ trách" },
  { key: "isActive", label: "Trạng thái hoạt động" },
  { key: "createdAt", label: "Ngày tạo" },
];

const renderRequestUserAvatar = (
  u?: {
    name?: string | null;
    username?: string | null;
    email?: string | null;
    avatar?: string | null;
    image?: string | null;
  } | null,
  size = "w-5 h-5 text-[9px]"
) => {
  if (!u) return null;
  const displayName = u.name || u.username || u.email || "U";
  const src = u.avatar || u.image;
  if (src) {
    return (
      <img
        src={src}
        alt={displayName}
        className={`${size} rounded-full object-cover shrink-0`}
      />
    );
  }
  return (
    <span
      className={`${size} rounded-full bg-gradient-to-tr from-pink-500 to-rose-500 text-white font-bold flex items-center justify-center shrink-0 uppercase select-none`}
    >
      {displayName.slice(0, 2)}
    </span>
  );
};

function UsersManagementContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { confirm, confirmDialog } = useConfirmDialog();

  // SaaS URL Query State Synchronization
  const { updateUrlParams } = useUrlParams();

  // Tab & View Mode: read initial value from URL Search Params
  const initialTabRaw = searchParams?.get("tab");
  const initialTab =
    initialTabRaw === "INVITATIONS"
      ? "INVITATIONS"
      : initialTabRaw === "REQUESTS"
        ? "REQUESTS"
        : "USERS";
  const [activeTab, setActiveTab] = useState<"USERS" | "INVITATIONS" | "REQUESTS">(initialTab);

  const [requestTypeFilter, setRequestTypeFilter] = useState<"ALL" | "MACHINE_CHANGE" | "TOKEN_ACTIVATION">(
    (searchParams?.get("reqType") as any) || "ALL"
  );
  const [requestStatusFilter, setRequestStatusFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("PENDING");
  const [requestUserFilter, setRequestUserFilter] = useState<string>("ALL");
  const [isRequestRangeOpen, setIsRequestRangeOpen] = useState(false);
  const [requestRangeSelection, setRequestRangeSelection] = useState<DateRange | undefined>();
  const [requestDateFrom, setRequestDateFrom] = useState("");
  const [requestDateTo, setRequestDateTo] = useState("");

  const initialViewMode = ((searchParams?.get("v") || searchParams?.get("view")) === "list" ? "list" : "grid") as "grid" | "list";
  const [viewMode, setViewMode] = useState<"grid" | "list">(initialViewMode);

  // Filters
  const initialSearch = searchParams?.get("q") || searchParams?.get("search") || "";
  const [search, setSearch] = useState(initialSearch);

  const initialRole = (searchParams?.get("role") || "ALL") as "ALL" | "ADMIN" | "LEAD" | "STAFF";
  const [roleFilter, setRoleFilter] = useState<"ALL" | "ADMIN" | "LEAD" | "STAFF">(initialRole);

  const initialGroup = searchParams?.get("group") || "ALL";
  const [groupFilter, setGroupFilter] = useState<string>(initialGroup);

  const initialStatus = (searchParams?.get("status") || "ALL") as "ALL" | "ACTIVE" | "INACTIVE";
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">(initialStatus);

  const initialHasAccounts = (searchParams?.get("hasAcc") || searchParams?.get("hasAccounts") || "ALL") as "ALL" | "YES" | "NO";
  const [hasAccountsFilter, setHasAccountsFilter] = useState<"ALL" | "YES" | "NO">(initialHasAccounts);

  // Sorting
  const initialSortKey = (searchParams?.get("sort") || searchParams?.get("sortBy") || "createdAt") as SortKey;
  const initialSortDesc = (searchParams?.get("dir") || searchParams?.get("sortOrder")) === "asc" ? false : true;
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; desc: boolean }>({
    key: initialSortKey,
    desc: initialSortDesc,
  });

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

  // SaaS URL sync: automatically keep URL in sync with all active states
  useEffect(() => {
    updateUrlParams(
      {
        tab: activeTab,
        v: viewMode,
        p: page,
        ps: pageSize,
        q: search,
        role: roleFilter,
        group: groupFilter,
        status: statusFilter,
        hasAcc: hasAccountsFilter,
        reqType: activeTab === "REQUESTS" ? requestTypeFilter : undefined,
        sort: sortConfig.key,
        dir: sortConfig.desc ? "desc" : "asc",
      },
      {
        v: "grid",
        p: 1,
        ps: viewMode === "grid" ? 12 : 10,
        q: "",
        role: "ALL",
        group: "ALL",
        status: "ALL",
        hasAcc: "ALL",
        reqType: "ALL",
        sort: "createdAt",
        dir: "desc",
      }
    );
  }, [
    activeTab,
    viewMode,
    page,
    pageSize,
    search,
    roleFilter,
    groupFilter,
    statusFilter,
    hasAccountsFilter,
    requestTypeFilter,
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

  const { data: session, status } = useSession();
  const isAdmin = (session?.user as any)?.role === "ADMIN";

  useEffect(() => {
    if (status !== "loading" && !isAdmin) {
      router.replace("/accounts");
    }
  }, [status, isAdmin, router]);

  // Column visibility state (fullName is locked and cannot be unchecked)
  const [visibleColumns, setVisibleColumns] = useState({
    fullName: true,
    username: true,
    email: true,
    role: true,
    groupName: true,
    accountsCount: true,
    isActive: true,
    actions: true,
  });

  const visibleColumnCount = useMemo(() => {
    return 1 /* checkbox */ + Object.values(visibleColumns).filter(Boolean).length;
  }, [visibleColumns]);

  const tableRef = useRef<HTMLDivElement>(null);
  const { getColumnStyle, getTableVars, renderResizeHandle } = useTableColumnResize({
    tableId: "users",
    columns: USERS_COLUMN_RESIZE_CONFIG,
    tableRef,
  });

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Invite modal state
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmailInput, setInviteEmailInput] = useState("");
  const [inviteEmailsList, setInviteEmailsList] = useState<string[]>([]);
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "LEAD" | "STAFF">("STAFF");
  const [inviteGroup, setInviteGroup] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Group Management modal
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [newGroupNameInput, setNewGroupNameInput] = useState("");

  // Edit role modal
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isEditRoleOpen, setIsEditRoleOpen] = useState(false);
  const [editRole, setEditRole] = useState<"ADMIN" | "LEAD" | "STAFF">("STAFF");

  // Delete modal (single & bulk)
  const [userToDelete, setUserToDelete] = useState<any>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);

  // Block / Unblock Access confirmation modal
  const [userToToggleStatus, setUserToToggleStatus] = useState<any>(null);
  const [isToggleStatusModalOpen, setIsToggleStatusModalOpen] = useState(false);

  // Extension Token Management Modal
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [selectedUserForToken, setSelectedUserForToken] = useState<any>(null);
  const [isTokenRevealed, setIsTokenRevealed] = useState(false);
  const [copiedExtensionToken, setCopiedExtensionToken] = useState(false);

  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: users = [], isLoading: loading } = trpc.admin.listUsers.useQuery(undefined, { enabled: isAdmin });
  const { data: invitations = [], isLoading: loadingInvites } = trpc.admin.listInvitations.useQuery(undefined, { enabled: isAdmin });
  const { data: groupsData } = trpc.admin.listGroups.useQuery(undefined, { enabled: isAdmin });
  const availableGroups = useMemo(() => {
    return groupsData?.groups || ["Team US #1", "Team EU #1", "Team VN #1"];
  }, [groupsData]);

  const createBulkInvitesMutation = trpc.admin.createBulkInvitations.useMutation({
    onSuccess: (res) => {
      setIsInviteModalOpen(false);
      setInviteEmailInput("");
      setInviteEmailsList([]);
      setInviteGroup("");
      if (res.failedCount === 0) {
        setActionMsg(`✅ Đã gửi thư mời thành công đến ${res.successCount} thành viên!`);
      } else {
        setActionMsg(`⚠️ Đã gửi ${res.successCount}/${res.total} thư mời (${res.failedCount} thất bại hoặc đã có tài khoản).`);
      }
      utils.admin.listInvitations.invalidate();
      setTimeout(() => setActionMsg(null), 6000);
    },
    onError: (err: any) => {
      alert(err.message || "Lỗi gửi thư mời");
    },
  });

  const resendInviteMutation = trpc.admin.resendInvitation.useMutation({
    onSuccess: () => {
      setActionMsg("✅ Đã gia hạn & gửi lại thư mời thành công!");
      utils.admin.listInvitations.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => {
      alert(err.message || "Lỗi gửi lại thư mời");
    },
  });

  const revokeInviteMutation = trpc.admin.revokeInvitation.useMutation({
    onSuccess: () => {
      setActionMsg("🚫 Đã thu hồi lời mời thành công!");
      utils.admin.listInvitations.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => {
      alert(err.message || "Lỗi thu hồi lời mời");
    },
  });

  const deleteInviteMutation = trpc.admin.deleteInvitation.useMutation({
    onSuccess: () => {
      setActionMsg("🗑️ Đã xóa bản ghi lời mời thành công!");
      utils.admin.listInvitations.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => {
      alert(err.message || "Lỗi xóa lời mời");
    },
  });

  const createGroupMutation = trpc.admin.createGroup.useMutation({
    onSuccess: () => {
      setNewGroupNameInput("");
      setActionMsg("✅ Đã tạo nhóm mới thành công!");
      utils.admin.listGroups.invalidate();
      utils.admin.listUsers.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => {
      alert(err.message || "Lỗi tạo nhóm");
    },
  });

  const deleteGroupMutation = trpc.admin.deleteGroup.useMutation({
    onSuccess: () => {
      setActionMsg("🗑️ Đã xóa nhóm thành công!");
      utils.admin.listGroups.invalidate();
      utils.admin.listUsers.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => {
      alert(err.message || "Lỗi xóa nhóm");
    },
  });

  const updateUserGroupMutation = trpc.admin.updateUserGroup.useMutation({
    onSuccess: () => {
      setActionMsg("✅ Đã cập nhật nhóm cho nhân sự!");
      utils.admin.listUsers.invalidate();
      utils.admin.listGroups.invalidate();
      setTimeout(() => setActionMsg(null), 3000);
    },
    onError: (err: any) => {
      alert(err.message || "Lỗi gán nhóm");
    },
  });

  const updateUserRoleMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      setIsEditRoleOpen(false);
      setSelectedUser(null);
      setActionMsg("✅ Đã cập nhật vai trò nhân sự thành công!");
      utils.admin.listUsers.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => {
      alert(err.message || "Lỗi cập nhật vai trò");
    },
  });

  const deleteUserMutation = trpc.admin.deleteUser.useMutation({
    onSuccess: () => {
      setIsDeleteOpen(false);
      setUserToDelete(null);
      setActionMsg("🗑️ Đã xóa nhân sự thành công!");
      utils.admin.listUsers.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => {
      alert(err.message || "Lỗi xóa nhân sự");
    },
  });

  const bulkDeleteUsersMutation = trpc.admin.bulkDeleteUsers.useMutation({
    onSuccess: (res) => {
      setIsBulkDeleteOpen(false);
      setSelectedIds(new Set());
      setActionMsg(`🗑️ Đã xóa thành công ${res.count} nhân sự!`);
      utils.admin.listUsers.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => {
      alert(err.message || "Lỗi xóa hàng loạt nhân sự");
    },
  });

  const toggleStatusMutation = trpc.admin.toggleUserStatus.useMutation({
    onSuccess: (res: any) => {
      setIsToggleStatusModalOpen(false);
      setUserToToggleStatus(null);
      setActionMsg(
        res.isActive
          ? "✅ Đã mở lại quyền truy cập cho nhân sự thành công!"
          : "🚫 Đã chặn quyền truy cập của nhân sự thành công!"
      );
      utils.admin.listUsers.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => alert(err.message),
  });

  const {
    data: tokenData,
    isLoading: loadingToken,
    refetch: refetchToken,
  } = trpc.admin.getExtensionToken.useQuery(
    { userId: selectedUserForToken?.id || "" },
    { enabled: !!selectedUserForToken?.id && isTokenModalOpen }
  );

  const regenerateTokenMutation = trpc.admin.regenerateExtensionToken.useMutation({
    onSuccess: (_data, vars) => {
      refetchToken();
      utils.admin.listUsers.invalidate();
      const who =
        selectedUserForToken?.id === vars.userId
          ? selectedUserForToken?.fullName || selectedUserForToken?.username
          : (users as any[])?.find((u) => u.id === vars.userId)?.fullName ||
            (users as any[])?.find((u) => u.id === vars.userId)?.username ||
            "nhân sự";
      setActionMsg(`🔑 Đã mở khóa / cấp Token mới thành công cho ${who}!`);
      setTimeout(() => setActionMsg(null), 5000);
    },
    onError: (err: any) => {
      alert(err.message || "Lỗi khi cấp lại Token");
    },
  });

  const revokeTokenMutation = trpc.admin.revokeExtensionToken.useMutation({
    onSuccess: () => {
      refetchToken();
      utils.admin.listUsers.invalidate();
      setActionMsg(
        `🚫 Đã vô hiệu hóa toàn bộ quyền Extension của ${selectedUserForToken?.fullName || selectedUserForToken?.username
        }!`
      );
      setTimeout(() => setActionMsg(null), 5000);
    },
    onError: (err: any) => {
      alert(err.message || "Lỗi khi vô hiệu hóa Token");
    },
  });

  const unlinkMachineMutation = trpc.admin.unlinkUserMachine.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate();
      utils.admin.listPendingMachineChangeRequests.invalidate();
      setActionMsg("Đã hủy liên kết máy tính.");
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => alert(err.message || "Lỗi hủy liên kết máy"),
  });

  const { data: pendingMachineRequests = [] } =
    trpc.admin.listPendingMachineChangeRequests.useQuery(undefined, {
      enabled: isAdmin,
      refetchInterval: 60_000,
    });

  const { data: pendingExtensionRequests = [] } =
    trpc.admin.listPendingExtensionAccessRequests.useQuery(undefined, {
      enabled: isAdmin,
      refetchInterval: 60_000,
    });

  const { data: allAccessRequests } = trpc.admin.listAllAccessRequests.useQuery(undefined, {
    enabled: isAdmin,
    refetchInterval: 60_000,
  });

  const reviewMachineChangeMutation =
    trpc.admin.reviewMachineChangeRequest.useMutation({
      onSuccess: () => {
        utils.admin.listPendingMachineChangeRequests.invalidate();
        utils.admin.listAllAccessRequests.invalidate();
        utils.admin.listUsers.invalidate();
        utils.user.listRequestsForUser.invalidate();
        setActionMsg("Đã cập nhật yêu cầu đổi máy.");
        setTimeout(() => setActionMsg(null), 4000);
      },
      onError: (err: any) => alert(err.message || "Lỗi duyệt yêu cầu"),
    });

  const reviewExtensionAccessMutation =
    trpc.admin.reviewExtensionAccessRequest.useMutation({
      onSuccess: () => {
        utils.admin.listPendingExtensionAccessRequests.invalidate();
        utils.admin.listAllAccessRequests.invalidate();
        utils.admin.listUsers.invalidate();
        utils.user.listRequestsForUser.invalidate();
        setActionMsg("Đã duyệt yêu cầu kích hoạt Extension.");
        setTimeout(() => setActionMsg(null), 4000);
      },
      onError: (err: any) => alert(err.message || "Lỗi duyệt yêu cầu Extension"),
    });

  const deleteMachineRequestMutation = trpc.user.deleteMachineChangeRequest.useMutation({
    onSuccess: () => {
      utils.admin.listPendingMachineChangeRequests.invalidate();
      utils.admin.listAllAccessRequests.invalidate();
      utils.user.listRequestsForUser.invalidate();
      setActionMsg("Đã xóa yêu cầu đổi máy.");
      setTimeout(() => setActionMsg(null), 3000);
    },
    onError: (err: any) => alert(err.message || "Lỗi xóa yêu cầu"),
  });

  const deleteExtensionRequestMutation = trpc.user.deleteExtensionAccessRequest.useMutation({
    onSuccess: () => {
      utils.admin.listPendingExtensionAccessRequests.invalidate();
      utils.admin.listAllAccessRequests.invalidate();
      utils.user.listRequestsForUser.invalidate();
      setActionMsg("Đã xóa yêu cầu kích hoạt Extension.");
      setTimeout(() => setActionMsg(null), 3000);
    },
    onError: (err: any) => alert(err.message || "Lỗi xóa yêu cầu"),
  });

  const requestPersonnelOptions = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        label: string;
        name?: string | null;
        username?: string | null;
        email?: string | null;
        avatar?: string | null;
        image?: string | null;
      }
    >();
    const add = (req: any) => {
      const id = req.userId || req.user?.id;
      if (!id) return;
      const label =
        req.user?.name || req.user?.username || req.user?.email || id;
      map.set(id, {
        id,
        label,
        name: req.user?.name,
        username: req.user?.username,
        email: req.user?.email,
        avatar: req.user?.avatar,
        image: req.user?.image,
      });
    };
    (allAccessRequests?.machineChangeRequests || []).forEach(add);
    (allAccessRequests?.extensionAccessRequests || []).forEach(add);
    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label, "vi")
    );
  }, [allAccessRequests]);

  const filteredRequests = useMemo(() => {
    const machineItems = (allAccessRequests?.machineChangeRequests || []).map((req: any) => ({
      kind: "MACHINE_CHANGE" as const,
      id: req.id,
      createdAt: req.createdAt,
      status: req.status as string,
      userId: (req.userId || req.user?.id) as string | undefined,
      raw: req,
    }));
    const tokenItems = (allAccessRequests?.extensionAccessRequests || []).map((req: any) => ({
      kind: "TOKEN_ACTIVATION" as const,
      id: req.id,
      createdAt: req.createdAt,
      status: req.status as string,
      userId: (req.userId || req.user?.id) as string | undefined,
      raw: req,
    }));
    let all = [...machineItems, ...tokenItems].sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
    if (requestTypeFilter !== "ALL") {
      all = all.filter((r) => r.kind === requestTypeFilter);
    }
    if (requestStatusFilter !== "ALL") {
      all = all.filter((r) => r.status === requestStatusFilter);
    }
    if (requestUserFilter !== "ALL") {
      all = all.filter((r) => r.userId === requestUserFilter);
    }
    if (requestDateFrom) {
      const fromTs = new Date(requestDateFrom + "T00:00:00").getTime();
      all = all.filter((r) => new Date(r.createdAt).getTime() >= fromTs);
    }
    if (requestDateTo) {
      const toTs = new Date(requestDateTo + "T23:59:59").getTime();
      all = all.filter((r) => new Date(r.createdAt).getTime() <= toTs);
    }
    return all;
  }, [
    allAccessRequests,
    requestTypeFilter,
    requestStatusFilter,
    requestUserFilter,
    requestDateFrom,
    requestDateTo,
  ]);

  const machineRequestCount = (allAccessRequests?.machineChangeRequests || []).length;
  const extensionRequestCount = (allAccessRequests?.extensionAccessRequests || []).length;
  const requestsCount = pendingMachineRequests.length + pendingExtensionRequests.length;

  const parseAndAddEmails = (text: string) => {
    if (!text.trim()) return;
    const tokens = text.split(/[\s,;\n\r\t]+/);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validEmails: string[] = [];
    tokens.forEach((t) => {
      const cleaned = t.trim().toLowerCase();
      if (emailRegex.test(cleaned)) {
        validEmails.push(cleaned);
      }
    });

    if (validEmails.length > 0) {
      setInviteEmailsList((prev) => {
        const set = new Set([...prev, ...validEmails]);
        return Array.from(set);
      });
      setInviteEmailInput("");
    }
  };

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    const pending = inviteEmailInput.trim();
    let allEmails = [...inviteEmailsList];
    if (pending) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const tokens = pending.split(/[\s,;\n\r\t]+/);
      tokens.forEach((t) => {
        const cleaned = t.trim().toLowerCase();
        if (emailRegex.test(cleaned) && !allEmails.includes(cleaned)) {
          allEmails.push(cleaned);
        }
      });
    }

    if (allEmails.length === 0) {
      alert("Vui lòng nhập ít nhất một địa chỉ email hợp lệ.");
      return;
    }

    createBulkInvitesMutation.mutate({
      emails: allEmails,
      role: inviteRole,
      groupName: inviteGroup || null,
    });
  };

  const handleCopyInviteLink = (token: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}/invite/accept?token=${token}`;
    navigator.clipboard.writeText(link);
    setCopiedToken(token);
    setActionMsg("📋 Đã sao chép liên kết lời mời vào bộ nhớ tạm!");
    setTimeout(() => {
      setCopiedToken(null);
      setActionMsg(null), 3500;
    }, 3500);
  };

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupNameInput.trim()) return;
    createGroupMutation.mutate({ name: newGroupNameInput.trim() });
  };

  const handleUpdateRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    updateUserRoleMutation.mutate({
      userId: selectedUser.id,
      role: editRole,
    });
  };

  const openToggleStatusModal = (user: any) => {
    if (user.id === session?.user?.id) {
      alert("Bạn không thể tự chặn quyền truy cập của chính mình!");
      return;
    }
    setUserToToggleStatus(user);
    setIsToggleStatusModalOpen(true);
  };

  const handleToggleStatus = (userId: string, currentStatus: boolean) => {
    if (userId === session?.user?.id) {
      alert("Bạn không thể tự chặn quyền truy cập của chính mình!");
      return;
    }
    toggleStatusMutation.mutate({
      userId,
      isActive: !currentStatus,
    });
  };

  // Sort handler
  const handleSort = (key: SortKey) => {
    setSortConfig((prev) => ({
      key,
      desc: prev.key === key ? !prev.desc : false,
    }));
  };

  // Filtered & Sorted users
  const filteredAndSortedUsers = useMemo(() => {
    const s = search.toLowerCase().trim();

    const filtered = users.filter((u: any) => {
      const matchSearch =
        !s ||
        (u.fullName && u.fullName.toLowerCase().includes(s)) ||
        (u.username && u.username.toLowerCase().includes(s)) ||
        (u.email && u.email.toLowerCase().includes(s));

      const matchRole = roleFilter === "ALL" || u.role === roleFilter;
      const matchGroup = groupFilter === "ALL" || (u.groupName === groupFilter);

      const isActive = u.isActive ?? true;
      const matchStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" ? isActive : !isActive);

      const matchHasAccounts =
        hasAccountsFilter === "ALL" ||
        (hasAccountsFilter === "YES" ? u.accountsCount > 0 : u.accountsCount === 0);

      return matchSearch && matchRole && matchGroup && matchStatus && matchHasAccounts;
    });

    // Sorting
    filtered.sort((a: any, b: any) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      if (sortConfig.key === "isActive") {
        aVal = a.isActive ? 1 : 0;
        bVal = b.isActive ? 1 : 0;
      } else if (sortConfig.key === "accountsCount") {
        aVal = a.accountsCount || 0;
        bVal = b.accountsCount || 0;
      } else if (sortConfig.key === "groupName") {
        aVal = a.groupName || "";
        bVal = b.groupName || "";
      } else if (sortConfig.key === "createdAt") {
        aVal = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        bVal = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      } else {
        aVal = (aVal || "").toString().toLowerCase();
        bVal = (bVal || "").toString().toLowerCase();
      }

      if (aVal < bVal) return sortConfig.desc ? 1 : -1;
      if (aVal > bVal) return sortConfig.desc ? -1 : 1;
      return 0;
    });

    return filtered;
  }, [users, search, roleFilter, groupFilter, statusFilter, hasAccountsFilter, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedUsers.length / pageSize));
  const paginatedUsers = useMemo(() => {
    return filteredAndSortedUsers.slice(
      (page - 1) * pageSize,
      page * pageSize
    );
  }, [filteredAndSortedUsers, page, pageSize]);

  // Bulk selection helpers
  const isAllPageSelected =
    paginatedUsers.length > 0 &&
    paginatedUsers.every((u: any) => selectedIds.has(u.id));

  const toggleSelectAll = (checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) {
      paginatedUsers.forEach((u: any) => next.add(u.id));
    } else {
      paginatedUsers.forEach((u: any) => next.delete(u.id));
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

  // Advanced filters count (inside the "Bộ lọc nâng cao" popover)
  const activeAdvancedCount =
    (statusFilter !== "ALL" ? 1 : 0) +
    (hasAccountsFilter !== "ALL" ? 1 : 0);

  // Filter chips (total across all filters)
  const activeFiltersCount =
    (search ? 1 : 0) +
    (roleFilter !== "ALL" ? 1 : 0) +
    (groupFilter !== "ALL" ? 1 : 0) +
    activeAdvancedCount;

  const clearAdvancedFilters = () => {
    setStatusFilter("ALL");
    setHasAccountsFilter("ALL");
    setPage(1);
  };

  const clearAllFilters = () => {
    setSearch("");
    setRoleFilter("ALL");
    setGroupFilter("ALL");
    setStatusFilter("ALL");
    setHasAccountsFilter("ALL");
    setPage(1);
  };

  const currentSortOption = SORT_OPTIONS.find((item) => item.key === sortConfig.key) || SORT_OPTIONS[7];
  const sortDirectionText = sortConfig.desc ? "Giảm dần ↓" : "Tăng dần ↑";

  // Stats
  const totalCount = users.length;
  const adminCount = users.filter((u: any) => u.role === "ADMIN").length;
  const leadCount = users.filter((u: any) => u.role === "LEAD").length;
  const staffCount = users.filter((u: any) => u.role === "STAFF").length;

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "ADMIN":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-xl text-xs font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 shadow-2xs">
            <Shield className="w-3.5 h-3.5" />
            ADMIN
          </span>
        );
      case "LEAD":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-xl text-xs font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 shadow-2xs">
            <ShieldCheck className="w-3.5 h-3.5" />
            LEAD
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-xl text-xs font-bold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20 shadow-2xs">
            <UserCheck className="w-3.5 h-3.5" />
            STAFF
          </span>
        );
    }
  };


  const renderSortIndicator = (key: SortKey) => {
    if (sortConfig.key !== key) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60 group-hover:opacity-100 transition-opacity" />;
    }
    return sortConfig.desc ? (
      <ArrowDown className="w-3.5 h-3.5 text-pink-500" />
    ) : (
      <ArrowUp className="w-3.5 h-3.5 text-pink-500" />
    );
  };

  if (status === "loading" || !isAdmin) {
    return <UsersPageSkeleton />;
  }

  return (
    <div className="space-y-6 w-full pb-20">
      {/* Header & Controls Section */}
      <div className="space-y-4">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5 min-w-0">
              <UserCog className="w-7 h-7 text-pink-500 shrink-0" />
              <span className="truncate">Quản Lý Nhân Sự & Phân Quyền</span>
              {loading ? (
                <span className="inline-block w-10 h-6 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse align-middle shrink-0" />
              ) : (
                <span className="shrink-0">({totalCount})</span>
              )}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
              Quản trị tài khoản thành viên, phân nhóm Team/Group, phân quyền Lead/Staff và theo dõi số lượng tài khoản TikTok phụ trách.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0 flex-wrap">
            <Link
              href="/groups"
              className="h-10 flex items-center gap-2 px-4 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-xs active:scale-95 transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              <Layers className="w-4 h-4 text-pink-500 shrink-0" />
              <span className="truncate">Quản Lý Nhóm ({availableGroups.length})</span>
            </Link>
            <button
              onClick={() => setIsInviteModalOpen(true)}
              className="h-10 flex items-center gap-2 px-5 rounded-xl text-xs font-bold bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-lg shadow-pink-600/30 active:scale-95 transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              <Mail className="w-4 h-4 shrink-0" />
              <span className="truncate">Mời Thành Viên Mới</span>
            </button>
          </div>
        </div>

        {actionMsg && (
          <div className="p-3.5 rounded-xl bg-cyan-50 dark:bg-slate-900 border border-cyan-200 dark:border-slate-800 text-xs font-bold text-center text-cyan-800 dark:text-cyan-300 shadow-sm animate-in fade-in">
            {actionMsg}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab("USERS")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === "USERS"
              ? "bg-pink-600 text-white shadow-md shadow-pink-600/25"
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
              }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Thành Viên Hệ Thống {loading ? "(...)" : `(${totalCount})`}</span>
          </button>
          <button
            onClick={() => setActiveTab("INVITATIONS")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === "INVITATIONS"
              ? "bg-pink-600 text-white shadow-md shadow-pink-600/25"
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
              }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Lời Mời Đang Chờ {loadingInvites ? "(...)" : `(${invitations.filter((i: any) => i.status === "PENDING").length})`}</span>
            {invitations.filter((i: any) => i.status === "PENDING").length > 0 && (
              <span className={`w-2 h-2 rounded-full ${activeTab === "INVITATIONS" ? "bg-white" : "bg-pink-500 animate-pulse"}`} />
            )}
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveTab("REQUESTS")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === "REQUESTS"
                ? "bg-pink-600 text-white shadow-md shadow-pink-600/25"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
                }`}
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>Yêu Cầu ({requestsCount})</span>
              {requestsCount > 0 && (
                <span className={`w-2 h-2 rounded-full ${activeTab === "REQUESTS" ? "bg-white" : "bg-amber-500 animate-pulse"}`} />
              )}
            </button>
          )}
        </div>

        {/* KPI Stats Bar */}
        {activeTab === "USERS" && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Tổng Thành Viên</div>
              {loading ? (
                <div className="h-8 w-14 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse mt-1" />
              ) : (
                <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{totalCount}</div>
              )}
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-medium text-pink-600 dark:text-pink-400 flex items-center gap-1">
                <Shield className="w-3.5 h-3.5" /> Quản Trị Viên (Admin)
              </div>
              {loading ? (
                <div className="h-8 w-12 bg-pink-100 dark:bg-pink-950/60 rounded-lg animate-pulse mt-1" />
              ) : (
                <div className="text-2xl font-black text-pink-600 dark:text-pink-400 mt-1">{adminCount}</div>
              )}
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-medium text-cyan-600 dark:text-cyan-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Trưởng Nhóm (Lead)
              </div>
              {loading ? (
                <div className="h-8 w-12 bg-cyan-100 dark:bg-cyan-950/60 rounded-lg animate-pulse mt-1" />
              ) : (
                <div className="text-2xl font-black text-cyan-600 dark:text-cyan-400 mt-1">{leadCount}</div>
              )}
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5" /> Nhân Viên (Staff)
              </div>
              {loading ? (
                <div className="h-8 w-12 bg-emerald-100 dark:bg-emerald-950/60 rounded-lg animate-pulse mt-1" />
              ) : (
                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{staffCount}</div>
              )}
            </div>
          </div>
        )}

        {/* Filter & Search Toolbar (Sticky only on desktop) */}
        {activeTab === "USERS" && (
          <div className="lg:sticky lg:top-[72px] z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm space-y-3">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 w-full min-w-0">
              {/* Left Group: Search input + Fast Filters + Advanced Filter */}
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                {/* Search Input */}
                <div className="relative w-full sm:w-48 md:w-56 lg:w-60 min-w-[170px]">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Tìm theo tên, username, email..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    className={`w-full h-9 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-pink-500 ${
                      search ? "pr-8" : "pr-4"
                    }`}
                  />
                  {search && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => {
                            setSearch("");
                            setPage(1);
                          }}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200/90 hover:bg-rose-500 hover:text-white dark:bg-slate-800 dark:hover:bg-rose-500 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                          aria-label="Xóa tìm kiếm"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Xóa tìm kiếm</TooltipContent>
                    </Tooltip>
                  )}
                </div>

                {/* Quick Role Selector */}
                <div className="relative group shrink-0">
                  <Select
                    value={roleFilter}
                    onValueChange={(val) => {
                      setRoleFilter(val as any);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger
                      className={`w-36 h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer transition-colors ${
                        roleFilter !== "ALL"
                          ? "pr-8 border-pink-200 dark:border-pink-900/60 bg-pink-50/40 dark:bg-pink-950/25 text-pink-700 dark:text-pink-300 [&_svg]:hidden"
                          : ""
                      }`}
                    >
                      <SelectValue placeholder="Vai trò">
                        {roleFilter === "ALL" && "Tất cả vai trò"}
                        {roleFilter === "ADMIN" && (
                          <span className="flex items-center gap-1.5">
                            <Shield className="w-3.5 h-3.5 text-pink-500" />
                            <span>Admin</span>
                          </span>
                        )}
                        {roleFilter === "LEAD" && (
                          <span className="flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-cyan-500" />
                            <span>Lead</span>
                          </span>
                        )}
                        {roleFilter === "STAFF" && (
                          <span className="flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
                            <span>Staff</span>
                          </span>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
                      <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">Tất cả vai trò</SelectItem>
                      <SelectItem value="ADMIN" className="text-xs font-normal cursor-pointer">
                        <div className="flex items-center gap-2">
                          <Shield className="w-3.5 h-3.5 text-pink-500" />
                          <span>Admin</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="LEAD" className="text-xs font-normal cursor-pointer">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-3.5 h-3.5 text-cyan-500" />
                          <span>Lead</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="STAFF" className="text-xs font-normal cursor-pointer">
                        <div className="flex items-center gap-2">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Staff</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {roleFilter !== "ALL" && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setRoleFilter("ALL");
                            setPage(1);
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200/90 hover:bg-rose-500 hover:text-white dark:bg-slate-800 dark:hover:bg-rose-500 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all z-10 cursor-pointer shadow-2xs hover:scale-110"
                          aria-label="Xóa chọn vai trò"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Xóa chọn vai trò</TooltipContent>
                    </Tooltip>
                  )}
                </div>

                {/* Quick Group Selector */}
                <div className="relative group shrink-0">
                  <Select
                    value={groupFilter}
                    onValueChange={(val) => {
                      setGroupFilter(val);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger
                      className={`w-36 h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer transition-colors ${
                        groupFilter !== "ALL"
                          ? "pr-8 border-pink-200 dark:border-pink-900/60 bg-pink-50/40 dark:bg-pink-950/25 text-pink-700 dark:text-pink-300 [&_svg]:hidden"
                          : ""
                      }`}
                    >
                      <SelectValue placeholder="Nhóm / Team">
                        {groupFilter === "ALL" ? "Tất cả nhóm" : groupFilter}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-56">
                      <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">Tất cả nhóm</SelectItem>
                      {availableGroups.map((g: string) => (
                        <SelectItem key={g} value={g} className="text-xs font-normal cursor-pointer">
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {groupFilter !== "ALL" && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setGroupFilter("ALL");
                            setPage(1);
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200/90 hover:bg-rose-500 hover:text-white dark:bg-slate-800 dark:hover:bg-rose-500 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all z-10 cursor-pointer shadow-2xs hover:scale-110"
                          aria-label="Xóa chọn nhóm"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Xóa chọn nhóm</TooltipContent>
                    </Tooltip>
                  )}
                </div>

                {/* Advanced Filter Popover */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={`h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl text-xs font-normal border transition-all cursor-pointer ${
                        activeAdvancedCount > 0
                          ? "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 shadow-2xs font-medium"
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
                              className="group/badge relative ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-purple-600 hover:bg-rose-600 text-white text-[10px] font-bold cursor-pointer transition-colors shadow-2xs"
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
                      <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Bộ lọc nâng cao</h4>
                      {activeAdvancedCount > 0 && (
                        <button
                          onClick={clearAdvancedFilters}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/50 transition-colors cursor-pointer"
                        >
                          Đặt lại
                        </button>
                      )}
                    </div>

                    {/* Trạng thái hoạt động */}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Trạng thái tài khoản
                      </label>
                      <div className="relative group shrink-0">
                        <Select
                          value={statusFilter}
                          onValueChange={(val) => {
                            setStatusFilter(val as any);
                            setPage(1);
                          }}
                        >
                          <SelectTrigger
                            className={`w-full h-8.5 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer transition-colors ${
                              statusFilter !== "ALL"
                                ? "pr-8 border-pink-200 dark:border-pink-900/60 bg-pink-50/40 dark:bg-pink-950/25 text-pink-700 dark:text-pink-300 [&_svg]:hidden"
                                : ""
                            }`}
                          >
                            <SelectValue placeholder="Tất cả trạng thái" />
                          </SelectTrigger>
                          <SelectContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
                            <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">Tất cả trạng thái</SelectItem>
                            <SelectItem value="ACTIVE" className="text-xs font-normal cursor-pointer">Đang hoạt động</SelectItem>
                            <SelectItem value="INACTIVE" className="text-xs font-normal cursor-pointer">Tạm khóa</SelectItem>
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

                    {/* Phụ trách Fleet */}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Số tài khoản phụ trách
                      </label>
                      <div className="relative group shrink-0">
                        <Select
                          value={hasAccountsFilter}
                          onValueChange={(val) => {
                            setHasAccountsFilter(val as any);
                            setPage(1);
                          }}
                        >
                          <SelectTrigger
                            className={`w-full h-8.5 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer transition-colors ${
                              hasAccountsFilter !== "ALL"
                                ? "pr-8 border-pink-200 dark:border-pink-900/60 bg-pink-50/40 dark:bg-pink-950/25 text-pink-700 dark:text-pink-300 [&_svg]:hidden"
                                : ""
                            }`}
                          >
                            <SelectValue placeholder="Tất cả" />
                          </SelectTrigger>
                          <SelectContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
                            <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">Tất cả</SelectItem>
                            <SelectItem value="YES" className="text-xs font-normal cursor-pointer">Đang phụ trách TikTok Acc</SelectItem>
                            <SelectItem value="NO" className="text-xs font-normal cursor-pointer">Chưa gán tài khoản nào</SelectItem>
                          </SelectContent>
                        </Select>
                        {hasAccountsFilter !== "ALL" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setHasAccountsFilter("ALL");
                                  setPage(1);
                                }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200/90 hover:bg-rose-500 hover:text-white dark:bg-slate-800 dark:hover:bg-rose-500 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all z-10 cursor-pointer shadow-2xs hover:scale-110"
                                aria-label="Xóa chọn số acc phụ trách"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Xóa chọn số acc phụ trách</TooltipContent>
                          </Tooltip>
                        )}
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
                    {SORT_OPTIONS.map((item) => {
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
                        className={`flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          viewMode === "grid"
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
                        className={`flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          viewMode === "list"
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

                {/* Column Visibility Popover (Only for List view) */}
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
                              fullName: true,
                              username: true,
                              email: true,
                              role: true,
                              groupName: true,
                              accountsCount: true,
                              isActive: true,
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
                          { key: "fullName", label: "Họ & tên", locked: true },
                          { key: "username", label: "Username" },
                          { key: "email", label: "Email" },
                          { key: "role", label: "Vai trò" },
                          { key: "groupName", label: "Nhóm" },
                          { key: "accountsCount", label: "Số acc phụ trách" },
                          { key: "isActive", label: "Trạng thái" },
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
            {activeFiltersCount > 0 && (
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
                {roleFilter !== "ALL" && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300">
                    <span>Vai trò: {roleFilter === "ADMIN" ? "Admin" : roleFilter === "LEAD" ? "Lead" : "Staff"}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button onClick={() => setRoleFilter("ALL")} className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/15 hover:text-rose-500 transition-colors cursor-pointer">
                          <X className="w-3 h-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Xóa bộ lọc</TooltipContent>
                    </Tooltip>
                  </span>
                )}
                {groupFilter !== "ALL" && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300">
                    <span>Nhóm: {groupFilter}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button onClick={() => setGroupFilter("ALL")} className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/15 hover:text-rose-500 transition-colors cursor-pointer">
                          <X className="w-3 h-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Xóa bộ lọc</TooltipContent>
                    </Tooltip>
                  </span>
                )}
                {statusFilter !== "ALL" && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                    <span>Trạng thái: {statusFilter === "ACTIVE" ? "Đang hoạt động" : "Tạm khóa"}</span>
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
                {hasAccountsFilter !== "ALL" && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300">
                    <span>Phụ trách: {hasAccountsFilter === "YES" ? "Có tài khoản" : "Chưa gán"}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button onClick={() => setHasAccountsFilter("ALL")} className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/15 hover:text-rose-500 transition-colors cursor-pointer">
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
        )}
      </div>

      {/* Main Content Area */}
      {activeTab === "USERS" ? (
        loading ? (
          viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: pageSize }).map((_, i) => (
                <div
                  key={i}
                  className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 space-y-4 animate-pulse"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-4 h-4 bg-slate-200 dark:bg-slate-800 rounded" />
                    <div className="w-20 h-5 bg-slate-200 dark:bg-slate-800 rounded-full" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-200 dark:bg-slate-800" />
                    <div className="space-y-1.5 flex-1">
                      <div className="w-24 h-4 bg-slate-200 dark:bg-slate-800 rounded" />
                      <div className="w-32 h-3 bg-slate-200 dark:bg-slate-800 rounded" />
                    </div>
                  </div>
                  <div className="h-10 bg-slate-100 dark:bg-slate-800/50 rounded-xl" />
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between">
                    <div className="w-16 h-3 bg-slate-200 dark:bg-slate-800 rounded" />
                    <div className="w-16 h-3 bg-slate-200 dark:bg-slate-800 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <DataTableSkeleton columnCount={visibleColumnCount} rowCount={pageSize} />
          )
        ) : filteredAndSortedUsers.length === 0 ? (
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center shadow-xs">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-pink-50 dark:bg-pink-950/40 text-pink-500 flex items-center justify-center mb-3">
              <UserX className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              Không tìm thấy nhân sự phù hợp
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              Thử thay đổi bộ lọc tìm kiếm, vai trò hoặc trạng thái để xem kết quả.
            </p>
            {activeFiltersCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Xóa bộ lọc</span>
              </button>
            )}
          </div>
        ) : viewMode === "grid" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {paginatedUsers.map((u: any) => {
                const isSelected = selectedIds.has(u.id);
                const initials = (u.fullName || u.username || "U")
                  .split(" ")
                  .filter(Boolean)
                  .slice(-2)
                  .map((w: string) => w[0]?.toUpperCase())
                  .join("") || "U";

                return (
                  <div
                    key={u.id}
                    className={`group bg-white dark:bg-slate-900/80 rounded-3xl border transition-all duration-200 relative overflow-hidden flex flex-col hover:shadow-lg hover:shadow-pink-500/5 hover:-translate-y-0.5 ${isSelected
                      ? "border-pink-500/60 ring-2 ring-pink-500/20 shadow-md shadow-pink-500/10"
                      : "border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                      }`}
                  >
                    {/* Top Bar: Checkbox + Role Badge + Status + Actions */}
                    <div className="p-4 pb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelectRow(u.id)}
                          aria-label={`Chọn ${u.username}`}
                        />
                      </div>

                      <div className="flex items-center gap-1.5">
                        {getRoleBadge(u.role)}
                        {/* Status Toggle Button */}
                        <button
                          disabled={u.id === session?.user?.id}
                          onClick={() => openToggleStatusModal(u)}
                          title={
                            u.id === session?.user?.id
                              ? "Không thể tự chặn chính mình"
                              : u.isActive
                                ? "Bấm để chặn quyền truy cập"
                                : "Bấm để mở chặn quyền truy cập"
                          }
                          className={`h-7 px-2.5 rounded-full inline-flex items-center gap-1.5 text-xs font-bold border transition-all shadow-2xs ${u.id === session?.user?.id
                            ? "opacity-75 cursor-default"
                            : "cursor-pointer"
                            } ${u.isActive
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                              : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 hover:bg-rose-500/20"
                            }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${u.isActive ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                              }`}
                          />
                          <span>{u.isActive ? "Hoạt động" : "Bị chặn"}</span>
                        </button>

                        {/* More Actions Dropdown */}
                        <DropdownMenu>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <DropdownMenuTrigger asChild>
                                <button
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
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
                            className="w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-1"
                          >
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/users/${u.id}`}
                                className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer font-normal"
                              >
                                <Eye className="w-3.5 h-3.5 text-slate-400" />
                                <span>Xem chi tiết</span>
                              </Link>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedUser(u);
                                setEditRole(u.role);
                                setIsEditRoleOpen(true);
                              }}
                              className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer font-normal"
                            >
                              <Pencil className="w-3.5 h-3.5 text-slate-400" />
                              <span>Đổi vai trò</span>
                            </DropdownMenuItem>

                            {isAdmin && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedUserForToken(u);
                                  setIsTokenRevealed(false);
                                  setCopiedExtensionToken(false);
                                  setIsTokenModalOpen(true);
                                }}
                                className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer font-normal"
                              >
                                <Key className="w-3.5 h-3.5 text-slate-400" />
                                <span>Quản lý Extension Token</span>
                              </DropdownMenuItem>
                            )}

                            {isAdmin && (
                              <DropdownMenuItem
                                disabled={u.id === session?.user?.id}
                                onClick={() => openToggleStatusModal(u)}
                                className={`flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer font-normal ${u.id === session?.user?.id
                                  ? "opacity-50 cursor-not-allowed text-slate-400"
                                  : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                                  }`}
                              >
                                {u.isActive ? (
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
                            )}

                            {isAdmin && u.boundMachineId && (
                              <DropdownMenuItem
                                onClick={async () => {
                                  const ok = await confirm({
                                    title: "Hủy liên kết máy",
                                    description: `Hủy liên kết máy "${u.boundMachineName || u.boundMachineId}" cho user này?`,
                                    confirmLabel: "Xác nhận hủy liên kết",
                                    variant: "warning",
                                    icon: "unlink",
                                  });
                                  if (ok) {
                                    unlinkMachineMutation.mutate({
                                      userId: u.id,
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
                              onClick={() => {
                                setUserToDelete(u);
                                setIsDeleteOpen(true);
                              }}
                              className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg cursor-pointer font-normal"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                              <span>Xóa nhân sự</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* User Identity Section */}
                    <div className="px-4 py-3 flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-500/20 via-rose-500/20 to-amber-500/20 border border-pink-500/30 flex items-center justify-center font-black text-sm text-pink-600 dark:text-pink-400 shrink-0 shadow-inner overflow-hidden">
                        {u.avatar ? (
                          <img
                            src={u.avatar}
                            alt={u.username}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          initials
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/users/${u.id}`}
                          className="font-bold text-sm text-slate-900 dark:text-white truncate block hover:text-pink-600 dark:hover:text-pink-400 transition-colors"
                          title={u.fullName || u.username}
                        >
                          {u.fullName || "Chưa đặt tên"}
                        </Link>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                          @{u.username}
                        </div>
                      </div>
                    </div>

                    {/* Contact & Group Info */}
                    <div className="px-4 py-2 space-y-2 text-xs flex-1">
                      {/* Email with copy */}
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span className="text-xs text-slate-400 flex items-center gap-1 shrink-0">
                          <Mail className="w-3 h-3" /> Email
                        </span>
                        <div className="flex items-center gap-1 min-w-0">
                          <span
                            className="truncate max-w-[140px] text-slate-700 dark:text-slate-300 font-mono text-xs"
                            title={u.email}
                          >
                            {u.email}
                          </span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(u.email);
                                  setActionMsg(`Đã sao chép email: ${u.email}`);
                                  setTimeout(() => setActionMsg(null), 2500);
                                }}
                                className="text-slate-400 hover:text-pink-500 p-0.5 cursor-pointer transition-colors"
                                aria-label="Sao chép email"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Sao chép email</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 gap-2">
                        <span className="text-xs text-slate-400 flex items-center gap-1 shrink-0">
                          <Monitor className="w-3 h-3" /> Máy
                        </span>
                        <span
                          className="truncate max-w-[160px] text-right font-mono text-xs"
                          title={
                            u.boundMachineId
                              ? `${u.boundMachineName || u.boundMachineId}${u.boundOsUser ? ` (${u.boundOsUser})` : ""}`
                              : "Chưa gán"
                          }
                        >
                          {u.boundMachineId
                            ? u.boundMachineName || u.boundMachineId.slice(0, 12)
                            : "Chưa gán"}
                        </span>
                      </div>

                      {/* Group Assignment Dropdown */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-400 flex items-center gap-1 shrink-0">
                          <Users className="w-3 h-3" /> Nhóm
                        </span>
                        <Select
                          value={u.groupName || "NONE"}
                          onValueChange={(val) => {
                            const targetGroup = val === "NONE" ? null : val;
                            updateUserGroupMutation.mutate({
                              userId: u.id,
                              groupName: targetGroup,
                            });
                          }}
                        >
                          <SelectTrigger className="w-36 h-7 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer">
                            <SelectValue placeholder="Gán nhóm">
                              {u.groupName ? (
                                <span className="font-normal text-slate-800 dark:text-slate-200 truncate">
                                  {u.groupName}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-normal">Chưa gán</span>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-56">
                            <SelectItem value="NONE" className="text-xs text-slate-400 cursor-pointer font-normal">
                              Không gán nhóm (Trống)
                            </SelectItem>
                            {availableGroups.map((g: string) => (
                              <SelectItem key={g} value={g} className="text-xs cursor-pointer font-normal">
                                {g}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Card Footer: Accounts assigned & Fleet link */}
                    <div className="mt-auto px-4 py-3 bg-slate-50/80 dark:bg-slate-950/50 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          {u.accountsCount ?? 0}
                        </span>
                        <span className="text-xs text-slate-400">acc phụ trách</span>
                      </div>

                      <Link
                        href={`/users/${u.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-pink-600 dark:text-pink-400 hover:underline hover:text-pink-700 dark:hover:text-pink-300 transition-colors"
                      >
                        <span>Chi tiết</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Grid Pagination */}
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={filteredAndSortedUsers.length}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                itemLabel="nhân sự"
              />
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden relative z-0 isolate">
            <div className="overflow-x-auto relative" ref={tableRef} style={getTableVars()}>
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-slate-600 dark:text-slate-300 font-semibold text-xs border-b border-slate-200 dark:border-slate-800 select-none normal-case">
                  <tr>
                    {/* Checkbox All (Frozen Left) */}
                    <th className="py-3.5 px-4 w-10 sticky left-0 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-slate-200 dark:after:bg-slate-800">
                      <Checkbox
                        checked={isAllPageSelected}
                        onCheckedChange={(val) => toggleSelectAll(!!val)}
                        aria-label="Chọn tất cả trên trang"
                      />
                    </th>

                    {/* Columns */}
                    {visibleColumns.fullName && (
                      <th
                        style={getColumnStyle("fullName")}
                        onClick={() => handleSort("fullName")}
                        className="relative group/th py-3.5 px-4 cursor-pointer group hover:text-slate-900 dark:hover:text-white sticky left-10 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs border-r border-slate-200 dark:border-slate-800 after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-slate-200 dark:after:bg-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.03)]"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="truncate">Họ & tên</span>
                          {renderSortIndicator("fullName")}
                        </div>
                        {renderResizeHandle("fullName")}
                      </th>
                    )}

                    {visibleColumns.username && (
                      <th
                        style={getColumnStyle("username")}
                        onClick={() => handleSort("username")}
                        className="relative group/th py-3.5 px-4 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="truncate">Username</span>
                          {renderSortIndicator("username")}
                        </div>
                        {renderResizeHandle("username")}
                      </th>
                    )}

                    {visibleColumns.email && (
                      <th
                        style={getColumnStyle("email")}
                        onClick={() => handleSort("email")}
                        className="relative group/th py-3.5 px-4 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="truncate">Email</span>
                          {renderSortIndicator("email")}
                        </div>
                        {renderResizeHandle("email")}
                      </th>
                    )}

                    {visibleColumns.role && (
                      <th
                        style={getColumnStyle("role")}
                        onClick={() => handleSort("role")}
                        className="relative group/th py-3.5 px-4 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="truncate">Vai trò</span>
                          {renderSortIndicator("role")}
                        </div>
                        {renderResizeHandle("role")}
                      </th>
                    )}

                    {/* Group Column */}
                    {visibleColumns.groupName && (
                      <th
                        style={getColumnStyle("groupName")}
                        onClick={() => handleSort("groupName")}
                        className="relative group/th py-3.5 px-4 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="truncate">Nhóm</span>
                          {renderSortIndicator("groupName")}
                        </div>
                        {renderResizeHandle("groupName")}
                      </th>
                    )}

                    {visibleColumns.accountsCount && (
                      <th
                        style={getColumnStyle("accountsCount")}
                        onClick={() => handleSort("accountsCount")}
                        className="relative group/th py-3.5 px-4 cursor-pointer group hover:text-slate-900 dark:hover:text-white whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5 whitespace-nowrap truncate">
                          <span className="whitespace-nowrap truncate">Số acc phụ trách</span>
                          {renderSortIndicator("accountsCount")}
                        </div>
                        {renderResizeHandle("accountsCount")}
                      </th>
                    )}

                    {visibleColumns.isActive && (
                      <th
                        style={getColumnStyle("isActive")}
                        onClick={() => handleSort("isActive")}
                        className="relative group/th py-3.5 px-4 cursor-pointer group hover:text-slate-900 dark:hover:text-white whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5 whitespace-nowrap truncate">
                          <span className="whitespace-nowrap truncate">Trạng thái</span>
                          {renderSortIndicator("isActive")}
                        </div>
                        {renderResizeHandle("isActive")}
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
                  {paginatedUsers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={visibleColumnCount}
                        className="py-12 text-center text-slate-400 dark:text-slate-500"
                      >
                        <UserX className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <div>Không tìm thấy nhân sự nào phù hợp với bộ lọc.</div>
                      </td>
                    </tr>
                  ) : (
                    paginatedUsers.map((u: any) => {
                      const isSelected = selectedIds.has(u.id);

                      return (
                        <tr
                          key={u.id}
                          className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group ${isSelected ? "bg-pink-50/40 dark:bg-pink-950/20" : ""
                            }`}
                        >
                          {/* Checkbox (Frozen Left) */}
                          <td className="py-3 px-4 w-10 sticky left-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs group-hover:bg-slate-50 dark:group-hover:bg-slate-800/90">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelectRow(u.id)}
                              aria-label={`Chọn ${u.username}`}
                            />
                          </td>

                          {/* Full Name (Frozen Left) */}
                          {visibleColumns.fullName && (
                            <td
                              style={getColumnStyle("fullName")}
                              className="py-3 px-4 sticky left-10 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs group-hover:bg-slate-50 dark:group-hover:bg-slate-800/90 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.03)]"
                            >
                              <Link
                                href={`/users/${u.id}`}
                                className="font-bold text-slate-900 dark:text-white hover:text-pink-600 dark:hover:text-pink-400 transition-colors flex items-center gap-2 group/link"
                              >
                                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-pink-500 to-rose-500 flex items-center justify-center text-white text-xs font-bold shrink-0 select-none">
                                  {u.avatar ? (
                                    <img
                                      src={u.avatar}
                                      alt={u.username}
                                      className="w-full h-full rounded-full object-cover"
                                    />
                                  ) : (
                                    <span className="leading-none">
                                      {(u.fullName || u.username || "U")[0]?.toUpperCase()}
                                    </span>
                                  )}
                                </div>
                                <span className="group-hover/link:underline truncate">
                                  {u.fullName || "Chưa đặt tên"}
                                </span>
                              </Link>
                            </td>
                          )}

                          {/* Username */}
                          {visibleColumns.username && (
                            <td style={getColumnStyle("username")} className="py-3 px-4 text-slate-600 dark:text-slate-300 font-mono text-xs">
                              @{u.username}
                            </td>
                          )}

                          {/* Email */}
                          {visibleColumns.email && (
                            <td style={getColumnStyle("email")} className="py-3 px-4 text-slate-600 dark:text-slate-400">
                              {u.email}
                            </td>
                          )}

                          {/* Role */}
                          {visibleColumns.role && (
                            <td style={getColumnStyle("role")} className="py-3 px-4">
                              {getRoleBadge(u.role)}
                            </td>
                          )}

                          {/* Group Select Dropdown */}
                          {visibleColumns.groupName && (
                            <td style={getColumnStyle("groupName")} className="py-3 px-4">
                              <Select
                                value={u.groupName || "NONE"}
                                onValueChange={(val) => {
                                  const targetGroup = val === "NONE" ? null : val;
                                  updateUserGroupMutation.mutate({
                                    userId: u.id,
                                    groupName: targetGroup,
                                  });
                                }}
                              >
                                <SelectTrigger className="w-36 h-7.5 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer">
                                  <SelectValue placeholder="Gán nhóm">
                                    {u.groupName ? (
                                      <span className="font-normal text-slate-800 dark:text-slate-200">
                                        {u.groupName}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 font-normal">Chưa gán nhóm</span>
                                    )}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-56">
                                  <SelectItem value="NONE" className="text-xs text-slate-400 cursor-pointer font-normal">
                                    Không gán nhóm (Trống)
                                  </SelectItem>
                                  {availableGroups.map((g: string) => (
                                    <SelectItem key={g} value={g} className="text-xs cursor-pointer font-normal">
                                      {g}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                          )}

                          {/* Accounts Count */}
                          {visibleColumns.accountsCount && (
                            <td style={getColumnStyle("accountsCount")} className="py-3 px-4">
                              <span className="inline-flex items-center px-2.5 h-7.5 rounded-xl text-xs font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 shadow-2xs">
                                {u.accountsCount} tài khoản
                              </span>
                            </td>
                          )}

                          {/* Status */}
                          {visibleColumns.isActive && (
                            <td style={getColumnStyle("isActive")} className="py-3 px-4 whitespace-nowrap">
                              <button
                                disabled={u.id === session?.user?.id}
                                onClick={() => openToggleStatusModal(u)}
                                title={
                                  u.id === session?.user?.id
                                    ? "Không thể tự chặn chính mình"
                                    : u.isActive
                                      ? "Bấm để chặn quyền truy cập"
                                      : "Bấm để mở chặn quyền truy cập"
                                }
                                className={`inline-flex items-center gap-1.5 px-3 h-7.5 rounded-xl text-xs font-bold border transition-all shadow-2xs whitespace-nowrap ${u.id === session?.user?.id
                                  ? "opacity-80 cursor-default"
                                  : "cursor-pointer"
                                  } ${u.isActive
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 hover:bg-rose-500/20"
                                  }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${u.isActive ? "bg-emerald-500" : "bg-rose-500"
                                    }`}
                                />
                                <span>{u.isActive ? "Hoạt động" : "Bị chặn"}</span>
                              </button>
                            </td>
                          )}


                          {/* Action Menu (Frozen Right) */}
                          {visibleColumns.actions && (
                            <td
                              style={getColumnStyle("actions")}
                              className="py-3 px-6 text-center sticky right-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs group-hover:bg-slate-50 dark:group-hover:bg-slate-800/90 border-l border-slate-200 dark:border-slate-800 shadow-[-2px_0_5px_rgba(0,0,0,0.03)]"
                            >
                              <DropdownMenu>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                        aria-label="Tùy chọn nhân sự"
                                      >
                                        <MoreHorizontal className="w-4 h-4" />
                                      </button>
                                    </DropdownMenuTrigger>
                                  </TooltipTrigger>
                                  <TooltipContent side="left">Tùy chọn nhân sự</TooltipContent>
                                </Tooltip>
                                <DropdownMenuContent
                                  align="end"
                                  className="w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-1"
                                >
                                  <DropdownMenuItem asChild>
                                    <Link
                                      href={`/users/${u.id}`}
                                      className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                                    >
                                      <Eye className="w-3.5 h-3.5 text-slate-400" />
                                      <span>Xem chi tiết</span>
                                    </Link>
                                  </DropdownMenuItem>

                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedUser(u);
                                      setEditRole(u.role);
                                      setIsEditRoleOpen(true);
                                    }}
                                    className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-slate-400" />
                                    <span>Đổi vai trò</span>
                                  </DropdownMenuItem>

                                  {isAdmin && (
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setSelectedUserForToken(u);
                                        setIsTokenRevealed(false);
                                        setCopiedExtensionToken(false);
                                        setIsTokenModalOpen(true);
                                      }}
                                      className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer font-normal"
                                    >
                                      <Key className="w-3.5 h-3.5 text-slate-400" />
                                      <span>Quản lý Extension Token</span>
                                    </DropdownMenuItem>
                                  )}

                                  {isAdmin && u.boundMachineId && (
                                    <DropdownMenuItem
                                      onClick={async () => {
                                        const ok = await confirm({
                                          title: "Hủy liên kết máy",
                                          description: `Hủy liên kết máy "${u.boundMachineName || u.boundMachineId}" cho user này?`,
                                          confirmLabel: "Xác nhận hủy liên kết",
                                          variant: "warning",
                                          icon: "unlink",
                                        });
                                        if (ok) {
                                          unlinkMachineMutation.mutate({
                                            userId: u.id,
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

                                  {isAdmin && (
                                    <DropdownMenuItem
                                      disabled={u.id === session?.user?.id}
                                      onClick={() => openToggleStatusModal(u)}
                                      className={`flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer font-normal ${u.id === session?.user?.id
                                        ? "opacity-50 cursor-not-allowed text-slate-400"
                                        : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                                        }`}
                                    >
                                      {u.isActive ? (
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
                                  )}

                                  <DropdownMenuSeparator className="my-1 border-slate-100 dark:border-slate-800" />

                                  <DropdownMenuItem
                                    onClick={() => {
                                      setUserToDelete(u);
                                      setIsDeleteOpen(true);
                                    }}
                                    className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg cursor-pointer font-normal"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                    <span>Xóa nhân sự</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
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
                totalItems={filteredAndSortedUsers.length}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                itemLabel="nhân sự"
              />
            </div>
          </div>
        )
      ) : activeTab === "REQUESTS" ? (
        /* REQUESTS TAB VIEW */
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Inbox className="w-4 h-4 text-amber-500" />
                  Yêu cầu từ nhân sự
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Đổi máy tính và kích hoạt lại Personal Token
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <Select
                value={requestTypeFilter}
                onValueChange={(v) => setRequestTypeFilter(v as typeof requestTypeFilter)}
              >
                <SelectTrigger className="h-9 rounded-xl text-xs cursor-pointer bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                  <SelectValue placeholder="Loại yêu cầu" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="ALL" className="text-xs cursor-pointer">
                    Tất cả loại ({machineRequestCount + extensionRequestCount})
                  </SelectItem>
                  <SelectItem value="MACHINE_CHANGE" className="text-xs cursor-pointer">
                    Đổi máy ({machineRequestCount})
                  </SelectItem>
                  <SelectItem value="TOKEN_ACTIVATION" className="text-xs cursor-pointer">
                    Kích hoạt Extension ({extensionRequestCount})
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={requestStatusFilter}
                onValueChange={(v) => setRequestStatusFilter(v as typeof requestStatusFilter)}
              >
                <SelectTrigger className="h-9 rounded-xl text-xs cursor-pointer bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                  <SelectValue placeholder="Trạng thái" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="ALL" className="text-xs cursor-pointer">Tất cả trạng thái</SelectItem>
                  <SelectItem value="PENDING" className="text-xs cursor-pointer">Đang chờ</SelectItem>
                  <SelectItem value="APPROVED" className="text-xs cursor-pointer">Đã duyệt</SelectItem>
                  <SelectItem value="REJECTED" className="text-xs cursor-pointer">Từ chối</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={requestUserFilter}
                onValueChange={setRequestUserFilter}
              >
                <SelectTrigger className="h-9 rounded-xl text-xs cursor-pointer bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                  <SelectValue placeholder="Nhân sự">
                    {requestUserFilter === "ALL" ? (
                      <span>Tất cả nhân sự</span>
                    ) : (
                      (() => {
                        const selected = requestPersonnelOptions.find(
                          (u) => u.id === requestUserFilter
                        );
                        if (!selected) return <span>Nhân sự</span>;
                        return (
                          <span className="flex items-center gap-2 min-w-0">
                            {renderRequestUserAvatar(selected, "w-4 h-4 text-[8px]")}
                            <span className="truncate">{selected.label}</span>
                          </span>
                        );
                      })()
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-xl max-h-64">
                  <SelectItem value="ALL" className="text-xs cursor-pointer">
                    Tất cả nhân sự
                  </SelectItem>
                  {requestPersonnelOptions.map((u) => (
                    <SelectItem key={u.id} value={u.id} className="text-xs cursor-pointer">
                      <div className="flex items-center gap-2">
                        {renderRequestUserAvatar(u, "w-4 h-4 text-[8px]")}
                        <span>{u.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Popover open={isRequestRangeOpen} onOpenChange={setIsRequestRangeOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="h-9 w-full inline-flex items-center justify-between gap-2 rounded-xl text-xs px-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900"
                  >
                    <span className="inline-flex items-center gap-1.5 truncate">
                      <Calendar className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                      {requestDateFrom && requestDateTo
                        ? `${format(new Date(requestDateFrom + "T00:00:00"), "dd/MM/yy")} – ${format(new Date(requestDateTo + "T00:00:00"), "dd/MM/yy")}`
                        : "Thời gian"}
                    </span>
                    {(requestDateFrom || requestDateTo) && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setRequestRangeSelection(undefined);
                          setRequestDateFrom("");
                          setRequestDateTo("");
                        }}
                        className="text-slate-400 hover:text-rose-500"
                      >
                        <X className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  side="bottom"
                  align="end"
                  sideOffset={6}
                  className="w-[325px] p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50"
                >
                  <div className="flex items-center justify-between gap-2 pb-2 mb-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Chọn thời gian
                    </span>
                    {requestRangeSelection?.from && (
                      <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800 whitespace-nowrap">
                        {format(requestRangeSelection.from, "dd/MM/yy")} –{" "}
                        {requestRangeSelection.to
                          ? format(requestRangeSelection.to, "dd/MM/yy")
                          : "..."}
                      </span>
                    )}
                  </div>
                  <CalendarPicker
                    mode="range"
                    selected={requestRangeSelection}
                    onSelect={setRequestRangeSelection}
                    numberOfMonths={1}
                    className="w-full p-0"
                  />
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setRequestRangeSelection(undefined);
                        setRequestDateFrom("");
                        setRequestDateTo("");
                        setIsRequestRangeOpen(false);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Xóa
                    </button>
                    <button
                      type="button"
                      disabled={!requestRangeSelection?.from}
                      onClick={() => {
                        if (!requestRangeSelection?.from) return;
                        let from = requestRangeSelection.from;
                        let to = requestRangeSelection.to || from;
                        if (to.getTime() < from.getTime()) {
                          const tmp = from;
                          from = to;
                          to = tmp;
                        }
                        setRequestDateFrom(format(from, "yyyy-MM-dd"));
                        setRequestDateTo(format(to, "yyyy-MM-dd"));
                        setRequestRangeSelection({ from, to });
                        setIsRequestRangeOpen(false);
                      }}
                      className="px-4 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg cursor-pointer disabled:opacity-50"
                    >
                      Áp dụng
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {filteredRequests.length === 0 ? (
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center space-y-3">
              <Inbox className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Không có yêu cầu nào
              </h3>
              <p className="text-xs text-slate-400">
                Không có yêu cầu khớp bộ lọc hiện tại.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredRequests.map((item) => {
                const statusBadge =
                  item.status === "APPROVED" ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
                      Đã duyệt
                    </span>
                  ) : item.status === "REJECTED" ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      Từ chối
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
                      Đang chờ
                    </span>
                  );

                if (item.kind === "MACHINE_CHANGE") {
                  const req = item.raw;
                  return (
                    <div
                      key={item.id}
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
                            {statusBadge}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {item.status === "PENDING" && (
                            <>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    disabled={reviewMachineChangeMutation.isPending}
                                    onClick={() =>
                                      reviewMachineChangeMutation.mutate({
                                        requestId: req.id,
                                        decision: "APPROVED",
                                      })
                                    }
                                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                                  >
                                    Duyệt
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  Duyệt yêu cầu đổi máy
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    disabled={reviewMachineChangeMutation.isPending}
                                    onClick={() =>
                                      reviewMachineChangeMutation.mutate({
                                        requestId: req.id,
                                        decision: "REJECTED",
                                      })
                                    }
                                    className="px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-300 dark:hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
                                  >
                                    Từ chối
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  Từ chối yêu cầu đổi máy
                                </TooltipContent>
                              </Tooltip>
                            </>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
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
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                                aria-label="Xóa yêu cầu"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              Xóa yêu cầu
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 min-w-0">
                          {renderRequestUserAvatar(req.user, "w-6 h-6 text-[9px]")}
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {req.user?.name || req.user?.username || req.user?.email}
                            </div>
                            {req.user?.email && (
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                {req.user.email}
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
                const u = req.user || {};
                return (
                  <div
                    key={item.id}
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
                          {statusBadge}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.status === "PENDING" && (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  disabled={reviewExtensionAccessMutation.isPending}
                                  onClick={async () => {
                                    const ok = await confirm({
                                      title: "Duyệt kích hoạt Extension",
                                      description: `Mở khóa quyền Extension và cấp Personal Token mới cho ${u.name || u.username || u.email}?`,
                                      confirmLabel: "Duyệt & Cấp Token",
                                      variant: "amber",
                                      icon: "check",
                                    });
                                    if (ok) {
                                      reviewExtensionAccessMutation.mutate({
                                        requestId: req.id,
                                        decision: "APPROVED",
                                      });
                                    }
                                  }}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
                                >
                                  <Key className="w-3.5 h-3.5" />
                                  Duyệt & Cấp Token
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                Duyệt & cấp Personal Token
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  disabled={reviewExtensionAccessMutation.isPending}
                                  onClick={() =>
                                    reviewExtensionAccessMutation.mutate({
                                      requestId: req.id,
                                      decision: "REJECTED",
                                    })
                                  }
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-300 dark:hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
                                >
                                  Từ chối
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                Từ chối yêu cầu kích hoạt
                              </TooltipContent>
                            </Tooltip>
                          </>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
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
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                              aria-label="Xóa yêu cầu"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            Xóa yêu cầu
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 min-w-0">
                        {renderRequestUserAvatar(u, "w-6 h-6 text-[9px]")}
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {u.name || u.username || u.email}
                          </div>
                          {(u.email || u.boundMachineName || u.boundMachineId) && (
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              {u.email}
                              {u.boundMachineName || u.boundMachineId
                                ? `${u.email ? " · " : ""}Máy: ${u.boundMachineName || u.boundMachineId}`
                                : ""}
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
          )}
        </div>
      ) : (
        /* INVITATIONS TAB VIEW */
        <div className="space-y-4">
          {/* KPI Bar for Invitations */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Tổng Số Lời Mời</div>
              {loadingInvites ? (
                <div className="h-8 w-14 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse mt-1" />
              ) : (
                <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{invitations.length}</div>
              )}
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Đang Chờ Kích Hoạt
              </div>
              {loadingInvites ? (
                <div className="h-8 w-12 bg-amber-100 dark:bg-amber-950/60 rounded-lg animate-pulse mt-1" />
              ) : (
                <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
                  {invitations.filter((i: any) => i.status === "PENDING").length}
                </div>
              )}
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Đã Kích Hoạt Thành Công
              </div>
              {loadingInvites ? (
                <div className="h-8 w-12 bg-emerald-100 dark:bg-emerald-950/60 rounded-lg animate-pulse mt-1" />
              ) : (
                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                  {invitations.filter((i: any) => i.status === "ACCEPTED").length}
                </div>
              )}
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1">
                <Ban className="w-3.5 h-3.5" /> Đã Thu Hồi / Hết Hạn
              </div>
              {loadingInvites ? (
                <div className="h-8 w-12 bg-rose-100 dark:bg-rose-950/60 rounded-lg animate-pulse mt-1" />
              ) : (
                <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
                  {invitations.filter((i: any) => i.status === "EXPIRED" || i.status === "REVOKED").length}
                </div>
              )}
            </div>
          </div>

          {/* Invitations Table */}
          {loadingInvites ? (
            <DataTableSkeleton columnCount={7} rowCount={5} />
          ) : invitations.length === 0 ? (
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center shadow-sm">
              <div className="w-16 h-16 rounded-2xl bg-pink-500/10 text-pink-500 flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Chưa có thư mời nào</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                Hãy mời nhân viên hoặc cộng sự mới tham gia hệ thống bằng cách bấm nút &quot;Mời Thành Viên Mới&quot;.
              </p>
              <button
                onClick={() => setIsInviteModalOpen(true)}
                className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-md cursor-pointer"
              >
                <Mail className="w-4 h-4" />
                <span>Gửi Thư Mời Đầu Tiên</span>
              </button>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-3.5 px-4 sticky left-0 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs border-r border-slate-200 dark:border-slate-800 after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-slate-200 dark:after:bg-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.03)] min-w-[220px]">
                        Email Nhận Lời Mời
                      </th>
                      <th className="py-3.5 px-4 whitespace-nowrap min-w-[120px]">Phân Quyền</th>
                      <th className="py-3.5 px-4 whitespace-nowrap min-w-[140px]">Nhóm / Team</th>
                      <th className="py-3.5 px-4 whitespace-nowrap min-w-[140px]">Người Gửi Lời Mời</th>
                      <th className="py-3.5 px-4 whitespace-nowrap min-w-[140px]">Hạn Sử Dụng</th>
                      <th className="py-3.5 px-4 whitespace-nowrap min-w-[120px]">Trạng Thái</th>
                      <th className="py-3.5 px-4 text-center whitespace-nowrap min-w-[140px]">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                    {invitations.map((inv: any) => {
                      const isPending = inv.status === "PENDING";
                      const isAccepted = inv.status === "ACCEPTED";
                      const isExpired = inv.status === "EXPIRED";
                      const isRevoked = inv.status === "REVOKED";

                      const isExpiringSoon = isPending && new Date(inv.expiresAt).getTime() - Date.now() < 6 * 60 * 60 * 1000;

                      return (
                        <tr key={inv.id} className="group hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white sticky left-0 z-10 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/90 border-r border-slate-200/80 dark:border-slate-800/80 shadow-[2px_0_5px_rgba(0,0,0,0.03)] min-w-[220px] transition-colors">
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                              <span className="truncate max-w-[240px]">{inv.email}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {getRoleBadge(inv.role)}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {inv.groupName ? (
                              <span className="inline-flex items-center px-2.5 h-7.5 rounded-xl text-xs font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 shadow-2xs">
                                {inv.groupName}
                              </span>
                            ) : (
                              <span className="inline-flex items-center h-7.5 text-slate-400 text-xs">Chưa gán</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap text-slate-700 dark:text-slate-300">
                            {inv.invitedBy?.name || inv.invitedBy?.username || inv.invitedBy?.email || "Admin"}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap text-slate-600 dark:text-slate-400">
                            <div className="flex flex-col">
                              <span>
                                {new Date(inv.expiresAt).toLocaleDateString("vi-VN")}{" "}
                                {new Date(inv.expiresAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                              {isExpiringSoon && (
                                <span className="text-xs font-bold text-amber-500 flex items-center gap-0.5">
                                  <Clock className="w-3 h-3" /> Sắp hết hạn
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {isPending && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 h-7.5 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shadow-2xs">
                                <Clock className="w-3.5 h-3.5" /> Đang chờ
                              </span>
                            )}
                            {isAccepted && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 h-7.5 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-2xs">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Đã tham gia
                              </span>
                            )}
                            {isExpired && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 h-7.5 rounded-xl text-xs font-bold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20 shadow-2xs">
                                <Clock className="w-3.5 h-3.5" /> Hết hạn
                              </span>
                            )}
                            {isRevoked && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 h-7.5 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shadow-2xs">
                                <Ban className="w-3.5 h-3.5" /> Đã thu hồi
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center justify-center gap-1">
                              {isPending && (
                                <>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        onClick={() => handleCopyInviteLink(inv.token)}
                                        className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
                                      >
                                        <Copy className="w-3.5 h-3.5" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>Sao chép liên kết mời</TooltipContent>
                                  </Tooltip>

                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        onClick={() => resendInviteMutation.mutate({ id: inv.id })}
                                        disabled={resendInviteMutation.isPending}
                                        className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40"
                                      >
                                        <RotateCcw className={`w-3.5 h-3.5 ${resendInviteMutation.isPending ? "animate-spin" : ""}`} />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>Gửi lại email & Gia hạn thêm 24h</TooltipContent>
                                  </Tooltip>

                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        onClick={async () => {
                                          const ok = await confirm({
                                            title: "Thu hồi lời mời",
                                            description: `Xác nhận THU HỒI lời mời gửi đến "${inv.email}"? Sau khi thu hồi, liên kết kích hoạt trong email sẽ bị vô hiệu hóa hoàn toàn ngay lập tức.`,
                                            confirmLabel: "Xác nhận thu hồi",
                                            variant: "danger",
                                            icon: "ban",
                                          });
                                          if (ok) {
                                            revokeInviteMutation.mutate({ id: inv.id });
                                          }
                                        }}
                                        disabled={revokeInviteMutation.isPending}
                                        className="w-7 h-7 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40"
                                      >
                                        <Ban className="w-3.5 h-3.5" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>Thu hồi (vô hiệu hóa) lời mời</TooltipContent>
                                  </Tooltip>
                                </>
                              )}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={async () => {
                                      const ok = await confirm({
                                        title: "Xóa lời mời",
                                        description: `Xác nhận xóa hoàn toàn bản ghi lời mời gửi đến "${inv.email}"?`,
                                        confirmLabel: "Xác nhận xóa",
                                        variant: "danger",
                                      });
                                      if (ok) {
                                        deleteInviteMutation.mutate({ id: inv.id });
                                      }
                                    }}
                                    disabled={deleteInviteMutation.isPending}
                                    className="w-7 h-7 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Xóa bản ghi</TooltipContent>
                              </Tooltip>
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

      {/* Floating Bottom Bulk Action Bar */}
      {activeTab === "USERS" && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 px-5 py-3 shadow-2xl shadow-slate-900/10 dark:shadow-black/60 backdrop-blur-md ring-1 ring-slate-100 dark:ring-slate-800 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <span className="text-xs font-bold text-slate-900 dark:text-white">
            Đã chọn {selectedIds.size} nhân sự
          </span>
          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            Bỏ chọn
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

      {/* Modal: Invite New Member */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-pink-50 dark:bg-pink-950/50 text-pink-600 dark:text-pink-400 flex items-center justify-center shrink-0 shadow-xs">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Mời Thành Viên Mới
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Gửi thư mời qua email để thành viên tự tạo mật khẩu
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Invite Form */}
            <form onSubmit={handleSendInvite} className="space-y-4">
              {/* Email field with multi-email badges */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Danh Sách Email Thành Viên <span className="text-rose-500">*</span>
                  </label>
                  {inviteEmailsList.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-pink-600 dark:text-pink-400">
                        {inviteEmailsList.length} email đã chọn
                      </span>
                      <button
                        type="button"
                        onClick={() => setInviteEmailsList([])}
                        className="inline-flex items-center text-xs font-medium text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 px-2 py-0.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-transparent hover:border-rose-200/60 dark:hover:border-rose-900/50 transition-all cursor-pointer"
                      >
                        Xóa hết
                      </button>
                    </div>
                  )}
                </div>

                {/* Email badges */}
                {inviteEmailsList.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl mb-2">
                    {inviteEmailsList.map((em, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-pink-50 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300 border border-pink-200/80 dark:border-pink-900/60"
                      >
                        <span className="truncate max-w-[220px]">{em}</span>
                        <button
                          type="button"
                          onClick={() => setInviteEmailsList((prev) => prev.filter((_, i) => i !== idx))}
                          className="w-3.5 h-3.5 rounded-full hover:bg-pink-200 dark:hover:bg-pink-900 flex items-center justify-center text-pink-500 hover:text-pink-800 dark:hover:text-white transition-colors cursor-pointer"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder={inviteEmailsList.length > 0 ? "Thêm email khác hoặc dán danh sách..." : "Nhập email và nhấn Enter hoặc dán danh sách..."}
                      value={inviteEmailInput}
                      onChange={(e) => setInviteEmailInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "," || e.key === " ") {
                          e.preventDefault();
                          parseAndAddEmails(inviteEmailInput);
                        }
                      }}
                      onPaste={(e) => {
                        const pasted = e.clipboardData.getData("text");
                        if (pasted && (pasted.includes(",") || pasted.includes("\n") || pasted.includes(" ") || pasted.includes(";"))) {
                          e.preventDefault();
                          parseAndAddEmails(pasted);
                        }
                      }}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-3.5 pr-8 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all"
                    />
                    <Mail className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  <button
                    type="button"
                    onClick={() => parseAndAddEmails(inviteEmailInput)}
                    disabled={!inviteEmailInput.trim()}
                    className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer transition-colors shrink-0"
                  >
                    + Thêm
                  </button>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  💡 Hỗ trợ dán danh sách nhiều email cùng lúc (ngăn cách bởi dấu phẩy, khoảng trắng hoặc xuống dòng).
                </p>
              </div>

              {/* Role selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Phân Quyền Vai Trò (Role) <span className="text-rose-500">*</span>
                </label>
                <Select
                  value={inviteRole}
                  onValueChange={(val: "ADMIN" | "LEAD" | "STAFF") => setInviteRole(val)}
                >
                  <SelectTrigger className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white cursor-pointer">
                    <SelectValue placeholder="Chọn vai trò" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="STAFF" className="text-xs cursor-pointer">
                      STAFF (Nhân viên vận hành)
                    </SelectItem>
                    <SelectItem value="LEAD" className="text-xs cursor-pointer">
                      LEAD (Trưởng nhóm)
                    </SelectItem>
                    <SelectItem value="ADMIN" className="text-xs cursor-pointer">
                      ADMIN (Quản trị viên cấp cao)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {inviteRole === "STAFF" && "• Chỉ xem và thao tác các tài khoản TikTok được chỉ định"}
                  {inviteRole === "LEAD" && "• Quản lý thành viên và danh sách tài khoản thuộc nhóm phụ trách"}
                  {inviteRole === "ADMIN" && "• Toàn quyền hệ thống, nhân sự và cấu hình phân nhóm"}
                </p>
              </div>

              {/* Group / Team selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Phân Vào Nhóm / Team <span className="text-slate-400 font-normal">(Tùy chọn)</span>
                </label>
                <Select
                  value={inviteGroup || "NONE"}
                  onValueChange={(val) => setInviteGroup(val === "NONE" ? "" : val)}
                >
                  <SelectTrigger className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white cursor-pointer">
                    <SelectValue placeholder="Chọn nhóm / team" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="NONE" className="text-xs cursor-pointer">
                      -- Chưa gán nhóm (Mặc định) --
                    </SelectItem>
                    {availableGroups.map((g: string) => (
                      <SelectItem key={g} value={g} className="text-xs cursor-pointer">
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notice note */}
              <div className="p-3 rounded-2xl bg-pink-50/50 dark:bg-pink-950/20 border border-pink-100 dark:border-pink-900/40 text-xs text-pink-700 dark:text-pink-300 leading-relaxed">
                💡 <span className="font-medium">Lưu ý:</span> Email lời mời có hiệu lực trong vòng <strong>24 giờ</strong>. Sau khi hoàn tất đăng ký, tài khoản sẽ được tự động kích hoạt và đưa vào nhóm tương ứng.
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={createBulkInvitesMutation.isPending || (inviteEmailsList.length === 0 && !inviteEmailInput.trim())}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 shadow-md shadow-pink-600/25 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {createBulkInvitesMutation.isPending ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang gửi thư mời...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {inviteEmailsList.length > 1
                          ? `Gửi ${inviteEmailsList.length} Lời Mời`
                          : "Gửi Lời Mời"}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Group Management (ADMIN ONLY) */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-pink-500" />
                Quản Lý & Thêm Nhóm (Group / Team)
              </h3>
              <button
                onClick={() => setIsGroupModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Create group form */}
            <form onSubmit={handleCreateGroup} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Tên Nhóm / Team Mới
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="e.g. Team US #1, Team Affiliate..."
                    value={newGroupNameInput}
                    onChange={(e) => setNewGroupNameInput(e.target.value)}
                    className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-pink-500"
                  />
                  <button
                    type="submit"
                    disabled={createGroupMutation.isPending || !newGroupNameInput.trim()}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white shadow-sm cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {createGroupMutation.isPending ? "Đang thêm..." : "+ Thêm Nhóm"}
                  </button>
                </div>
              </div>
            </form>

            {/* Existing Groups List */}
            <div className="space-y-2 pt-2">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Danh Sách Nhóm Hiện Có ({availableGroups.length})
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                {availableGroups.map((groupName: string) => {
                  const memberCount = users.filter((u: any) => u.groupName === groupName).length;
                  return (
                    <div
                      key={groupName}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {groupName}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {memberCount} thành viên
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={deleteGroupMutation.isPending}
                        onClick={async () => {
                          const ok = await confirm({
                            title: "Xóa nhóm",
                            description: `Bạn có chắc muốn xóa nhóm "${groupName}"? Nhân sự trong nhóm sẽ về trạng thái Chưa gán nhóm.`,
                            confirmLabel: "Xác nhận xóa",
                            variant: "danger",
                          });
                          if (ok) {
                            deleteGroupMutation.mutate({ name: groupName });
                          }
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                        title="Xóa nhóm"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsGroupModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Role */}
      {isEditRoleOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-pink-500" />
                Cập Nhật Vai Trò
              </h3>
              <button
                onClick={() => setIsEditRoleOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateRole} className="space-y-4">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Nhân sự:</div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedUser.name || selectedUser.username} ({selectedUser.email})
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Chọn Vai Trò (Role)
                </label>
                <Select value={editRole} onValueChange={(val) => setEditRole(val as any)}>
                  <SelectTrigger className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white cursor-pointer">
                    <SelectValue placeholder="Chọn vai trò" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="STAFF" className="text-xs cursor-pointer">STAFF (Nhân viên vận hành)</SelectItem>
                    <SelectItem value="LEAD" className="text-xs cursor-pointer">LEAD (Trưởng nhóm)</SelectItem>
                    <SelectItem value="ADMIN" className="text-xs cursor-pointer">ADMIN (Quản trị viên cấp cao)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditRoleOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={updateUserRoleMutation.isPending}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white shadow-md shadow-pink-600/30 cursor-pointer disabled:opacity-60"
                >
                  {updateUserRoleMutation.isPending ? "Đang lưu..." : "Lưu Thay Đổi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirm Delete Single User */}
      {isDeleteOpen && userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Xác nhận xóa nhân sự
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Hành động này sẽ gỡ tài khoản nhân sự khỏi hệ thống
                </p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/60 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800 space-y-1.5">
              <div className="text-xs text-slate-700 dark:text-slate-300">
                <span className="font-semibold">Họ & tên:</span>{" "}
                {userToDelete.fullName || userToDelete.name || userToDelete.username}
              </div>
              <div className="text-xs text-slate-700 dark:text-slate-300">
                <span className="font-semibold">Username:</span> @{userToDelete.username}
              </div>
              <div className="text-xs text-slate-700 dark:text-slate-300">
                <span className="font-semibold">Email:</span> {userToDelete.email}
              </div>
              {userToDelete.accountsCount > 0 && (
                <div className="text-xs text-amber-600 dark:text-amber-400 pt-1 font-medium">
                  ⚠️ Nhân sự này đang phụ trách {userToDelete.accountsCount} tài khoản TikTok. Các tài khoản này sẽ được chuyển về trạng thái Chưa phân công.
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteOpen(false);
                  setUserToDelete(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={deleteUserMutation.isPending}
                onClick={() => {
                  if (userToDelete) {
                    deleteUserMutation.mutate({ userId: userToDelete.id });
                  }
                }}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deleteUserMutation.isPending ? "Đang xóa..." : "Xác nhận xóa"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirm Bulk Delete Users */}
      {isBulkDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Xác nhận xóa hàng loạt
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Bạn có chắc chắn muốn xóa {selectedIds.size} nhân sự đã chọn?
                </p>
              </div>
            </div>

            <div className="bg-rose-50/60 dark:bg-rose-950/30 rounded-2xl p-4 border border-rose-200/60 dark:border-rose-800/60 text-xs text-rose-800 dark:text-rose-300">
              ⚠️ Các tài khoản TikTok đang được phụ trách bởi các nhân sự này sẽ được tự động bỏ gán về trạng thái Chưa phân công.
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
                disabled={bulkDeleteUsersMutation.isPending}
                onClick={() => {
                  bulkDeleteUsersMutation.mutate({ userIds: Array.from(selectedIds) });
                }}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{bulkDeleteUsersMutation.isPending ? "Đang xóa..." : `Xác nhận xóa (${selectedIds.size})`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirm Block / Unblock User Access */}
      {isToggleStatusModalOpen && userToToggleStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${userToToggleStatus.isActive
                  ? "bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400"
                  : "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400"
                  }`}
              >
                {userToToggleStatus.isActive ? (
                  <Ban className="w-5 h-5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {userToToggleStatus.isActive
                    ? "Xác nhận chặn quyền truy cập"
                    : "Xác nhận mở chặn quyền truy cập"}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {userToToggleStatus.isActive
                    ? "Nhân sự sẽ không thể đăng nhập vào hệ thống"
                    : "Cho phép nhân sự đăng nhập và sử dụng hệ thống"}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/60 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800 space-y-1.5">
              <div className="text-xs text-slate-700 dark:text-slate-300">
                <span className="font-semibold">Họ & tên:</span>{" "}
                {userToToggleStatus.fullName || userToToggleStatus.name || userToToggleStatus.username}
              </div>
              <div className="text-xs text-slate-700 dark:text-slate-300">
                <span className="font-semibold">Username:</span> @{userToToggleStatus.username}
              </div>
              <div className="text-xs text-slate-700 dark:text-slate-300">
                <span className="font-semibold">Email:</span> {userToToggleStatus.email}
              </div>
              <div className="text-xs text-slate-700 dark:text-slate-300">
                <span className="font-semibold">Trạng thái hiện tại:</span>{" "}
                {userToToggleStatus.isActive ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">Đang hoạt động</span>
                ) : (
                  <span className="text-rose-600 dark:text-rose-400 font-bold">Đang bị chặn</span>
                )}
              </div>
            </div>

            {userToToggleStatus.isActive ? (
              <div className="p-3.5 bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200/70 dark:border-rose-900/50 rounded-2xl text-xs text-rose-700 dark:text-rose-300 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Ban className="w-3.5 h-3.5" />
                  <span>Cảnh báo chặn truy cập</span>
                </div>
                <p className="text-xs leading-relaxed text-rose-600 dark:text-rose-300/90">
                  Khi bạn chặn quyền truy cập, nhân sự này sẽ bị ngắt mọi phiên làm việc hiện tại ngay lập tức và <b>không thể đăng nhập</b> vào hệ thống cho đến khi được bạn mở chặn lại.
                </p>
              </div>
            ) : (
              <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-900/50 rounded-2xl text-xs text-emerald-700 dark:text-emerald-300 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Mở lại quyền truy cập</span>
                </div>
                <p className="text-xs leading-relaxed text-emerald-600 dark:text-emerald-300/90">
                  Nhân sự này sẽ có thể đăng nhập bình thường và tiếp tục quản trị các tài khoản TikTok được phân công.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsToggleStatusModalOpen(false);
                  setUserToToggleStatus(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={toggleStatusMutation.isPending}
                onClick={() => {
                  if (userToToggleStatus) {
                    toggleStatusMutation.mutate({
                      userId: userToToggleStatus.id,
                      isActive: !userToToggleStatus.isActive,
                    });
                  }
                }}
                className={`flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white rounded-xl shadow-md active:scale-95 transition-all disabled:opacity-60 cursor-pointer ${userToToggleStatus.isActive
                  ? "bg-rose-600 hover:bg-rose-700"
                  : "bg-emerald-600 hover:bg-emerald-700"
                  }`}
              >
                {userToToggleStatus.isActive ? (
                  <>
                    <Ban className="w-3.5 h-3.5" />
                    <span>{toggleStatusMutation.isPending ? "Đang xử lý..." : "Xác nhận chặn"}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{toggleStatusMutation.isPending ? "Đang xử lý..." : "Mở quyền truy cập"}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Admin Extension Token Management */}
      {isTokenModalOpen && selectedUserForToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5 animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-xs">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Quản Lý Extension Token
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {selectedUserForToken.fullName || selectedUserForToken.username} ({selectedUserForToken.email})
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsTokenModalOpen(false);
                  setSelectedUserForToken(null);
                }}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Explanation Note */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1.5 leading-relaxed">
              <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <span>💡 Cơ chế Machine-Wide Token</span>
              </div>
              <p>
                Token xác thực Extension/Agent của nhân sự. Zip tải về chỉ chứa mã pairing dùng 1 lần (~10 phút) — không còn nhúng Personal Token. Sau thu hồi/cấp lại: nhân sự tải zip mới hoặc dán token từ đây.
              </p>
            </div>

            {/* Token Display Box */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Extension Secret Token:
                </label>
                <div className="flex items-center gap-1.5">
                  {tokenData?.accessEnabled === false ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                      🚫 Đã vô hiệu hóa
                    </span>
                  ) : tokenData?.token ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      ✓ Đang hoạt động
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">
                      {loadingToken ? "Đang truy xuất..." : "Chưa tạo"}
                    </span>
                  )}
                </div>
              </div>

              <div className="relative flex items-center">
                <input
                  type={isTokenRevealed ? "text" : "password"}
                  readOnly
                  placeholder={tokenData?.accessEnabled === false ? "Quyền đã bị khóa" : "Chưa có token"}
                  value={loadingToken ? "Đang tải token..." : tokenData?.token || ""}
                  className={`w-full bg-slate-50 dark:bg-slate-950 border rounded-xl px-3.5 py-2.5 text-xs font-mono pr-20 focus:outline-none ${tokenData?.accessEnabled === false
                    ? "border-rose-200 dark:border-rose-900/60 text-rose-500"
                    : "border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                    }`}
                />
                <div className="absolute right-2 flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={!tokenData?.token}
                        onClick={() => setIsTokenRevealed(!isTokenRevealed)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer transition-colors disabled:opacity-40"
                      >
                        {isTokenRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {isTokenRevealed ? "Ẩn Token" : "Hiện Token"}
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={!tokenData?.token}
                        onClick={() => {
                          if (tokenData?.token) {
                            navigator.clipboard.writeText(tokenData.token);
                            setCopiedExtensionToken(true);
                            setTimeout(() => setCopiedExtensionToken(false), 2500);
                          }
                        }}
                        className="p-1.5 text-slate-400 hover:text-pink-600 dark:hover:text-pink-400 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer transition-colors disabled:opacity-40"
                      >
                        {copiedExtensionToken ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {copiedExtensionToken ? "Đã sao chép!" : "Sao chép Token"}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
              {copiedExtensionToken && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  ✓ Đã sao chép token vào bộ nhớ tạm!
                </p>
              )}
            </div>

            {/* Quick Actions for Admin */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                disabled={regenerateTokenMutation.isPending}
                onClick={async () => {
                  const ok = await confirm({
                    title: tokenData?.accessEnabled === false ? "Mở khóa & cấp Token" : "Cấp lại Token mới",
                    description: `Xác nhận ${tokenData?.accessEnabled === false ? "mở lại quyền và cấp Token mới" : "thu hồi và tạo Token mới"} cho ${selectedUserForToken.fullName || selectedUserForToken.username}?`,
                    confirmLabel: "Xác nhận",
                    variant: "amber",
                  });
                  if (ok) {
                    regenerateTokenMutation.mutate({ userId: selectedUserForToken.id });
                  }
                }}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 cursor-pointer transition-all disabled:opacity-60"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${regenerateTokenMutation.isPending ? "animate-spin" : ""}`}
                />
                <span>
                  {regenerateTokenMutation.isPending ? "Đang xử lý..." : tokenData?.accessEnabled === false ? "Mở khóa & Cấp Token" : "Cấp lại Token mới"}
                </span>
              </button>

              {tokenData?.accessEnabled !== false && (
                <button
                  type="button"
                  disabled={revokeTokenMutation.isPending}
                  onClick={async () => {
                    const ok = await confirm({
                      title: "Vô hiệu hóa Extension",
                      description: `Xác nhận VÔ HIỆU HÓA HOÀN TOÀN quyền Extension của ${selectedUserForToken.fullName || selectedUserForToken.username}? Sau khi vô hiệu hóa, nhân sự sẽ không thể tự tạo lại token và Extension sẽ bị khóa ngay lập tức!`,
                      confirmLabel: "Xác nhận vô hiệu hóa",
                      variant: "danger",
                      icon: "ban",
                    });
                    if (ok) {
                      revokeTokenMutation.mutate({ userId: selectedUserForToken.id });
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-900/50 cursor-pointer transition-all disabled:opacity-60"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>Vô hiệu hóa</span>
                </button>
              )}

              <a
                href={tokenData?.accessEnabled === false ? "#" : `/api/extension/download?userId=${selectedUserForToken.id}`}
                download={tokenData?.accessEnabled !== false}
                onClick={(e) => {
                  if (tokenData?.accessEnabled === false) {
                    e.preventDefault();
                    alert("Quyền Extension của nhân sự này đang bị vô hiệu hóa. Hãy bấm 'Mở khóa & Cấp Token' trước.");
                  }
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${tokenData?.accessEnabled === false
                  ? "bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                  : "text-white bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 shadow-md shadow-pink-600/20 cursor-pointer active:scale-95"
                  }`}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải Extension hộ</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {confirmDialog}
    </div>
  );
}

export default function UsersManagementPage() {
  return (
    <Suspense fallback={<DataTableSkeleton columnCount={8} rowCount={10} />}>
      <UsersManagementContent />
    </Suspense>
  );
}

