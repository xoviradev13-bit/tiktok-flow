"use client";

import { useState, useMemo, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
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
import { trpc } from "@/lib/trpc";

type SortKey = "fullName" | "username" | "email" | "role" | "groupName" | "accountsCount" | "isActive" | "createdAt";

function UsersManagementContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // View Mode: read initial value from URL Search Params ("grid" | "list")
  const urlViewMode = (searchParams?.get("view") === "list" ? "list" : "grid") as "grid" | "list";
  const [viewMode, setViewMode] = useState<"grid" | "list">(urlViewMode);

  const initialPage = useMemo(() => {
    const p = searchParams?.get("page");
    const num = p ? parseInt(p, 10) : 1;
    return isNaN(num) || num < 1 ? 1 : num;
  }, [searchParams]);

  const initialPageSize = useMemo(() => {
    const ps = searchParams?.get("pageSize");
    const fallback = urlViewMode === "grid" ? 12 : 10;
    const num = ps ? parseInt(ps, 10) : fallback;
    return isNaN(num) || num < 1 ? fallback : num;
  }, [searchParams, urlViewMode]);

  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const updateUrlParams = useCallback(
    (updates: Record<string, string | number | undefined | null>) => {
      const params = new URLSearchParams(searchParams?.toString() || "");
      Object.entries(updates).forEach(([key, val]) => {
        if (
          val === undefined ||
          val === null ||
          val === "" ||
          (key === "page" && Number(val) === 1) ||
          (key === "view" && val === "grid")
        ) {
          params.delete(key);
        } else {
          params.set(key, String(val));
        }
      });
      const searchStr = params.toString();
      const newUrl = searchStr ? `${pathname}?${searchStr}` : pathname;
      window.history.replaceState(null, "", newUrl);
    },
    [searchParams, pathname]
  );

  const handleViewModeChange = (mode: "grid" | "list") => {
    setViewMode(mode);
    const defaultSize = mode === "grid" ? 12 : 10;
    setPageSize(defaultSize);
    setPage(1);
    updateUrlParams({ view: mode, pageSize: defaultSize, page: 1 });
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    updateUrlParams({ page: newPage });
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
    updateUrlParams({ pageSize: newSize, page: 1 });
  };

  const { data: session, status } = useSession();
  const isAdmin = (session?.user as any)?.role === "ADMIN";

  useEffect(() => {
    if (status !== "loading" && !isAdmin) {
      router.replace("/accounts");
    }
  }, [status, isAdmin, router]);

  const [activeTab, setActiveTab] = useState<"USERS" | "INVITATIONS">("USERS");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | "ADMIN" | "LEAD" | "STAFF">("ALL");
  const [groupFilter, setGroupFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [hasAccountsFilter, setHasAccountsFilter] = useState<"ALL" | "YES" | "NO">("ALL");

  const [sortConfig, setSortConfig] = useState<{ key: SortKey; desc: boolean }>({
    key: "createdAt",
    desc: true,
  });

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
    onSuccess: () => {
      refetchToken();
      utils.admin.listUsers.invalidate();
      setActionMsg(
        `🔑 Đã thu hồi & cấp Token mới thành công cho ${selectedUserForToken?.fullName || selectedUserForToken?.username
        }!`
      );
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

  // Filter chips
  const activeFiltersCount =
    (search ? 1 : 0) +
    (roleFilter !== "ALL" ? 1 : 0) +
    (groupFilter !== "ALL" ? 1 : 0) +
    (statusFilter !== "ALL" ? 1 : 0) +
    (hasAccountsFilter !== "ALL" ? 1 : 0);

  const clearAllFilters = () => {
    setSearch("");
    setRoleFilter("ALL");
    setGroupFilter("ALL");
    setStatusFilter("ALL");
    setHasAccountsFilter("ALL");
    setPage(1);
  };

  // Stats
  const totalCount = users.length;
  const adminCount = users.filter((u: any) => u.role === "ADMIN").length;
  const leadCount = users.filter((u: any) => u.role === "LEAD").length;
  const staffCount = users.filter((u: any) => u.role === "STAFF").length;

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "ADMIN":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 h-7.5 rounded-xl text-xs font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 shadow-2xs">
            <Shield className="w-3.5 h-3.5" />
            ADMIN
          </span>
        );
      case "LEAD":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 h-7.5 rounded-xl text-xs font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 shadow-2xs">
            <ShieldCheck className="w-3.5 h-3.5" />
            LEAD
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 h-7.5 rounded-xl text-xs font-bold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20 shadow-2xs">
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
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
              <UserCog className="w-7 h-7 text-pink-500" />
              <span>Quản Lý Nhân Sự & Phân Quyền</span>
              {loading ? (
                <span className="inline-block w-10 h-6 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse align-middle" />
              ) : (
                <span>({totalCount})</span>
              )}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Quản trị tài khoản thành viên, phân nhóm Team/Group, phân quyền Lead/Staff và theo dõi số lượng tài khoản TikTok phụ trách.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
            <Link
              href="/groups"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-xs active:scale-95 transition-all cursor-pointer"
            >
              <Layers className="w-4 h-4 text-pink-500" />
              <span>Quản Lý Nhóm ({availableGroups.length})</span>
            </Link>
            <button
              onClick={() => setIsInviteModalOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-lg shadow-pink-600/30 active:scale-95 transition-all cursor-pointer"
            >
              <Mail className="w-4 h-4" />
              <span>Mời Thành Viên Mới</span>
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
            <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
              {/* Search Input */}
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm theo tên, username, email..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="w-full h-9 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-4 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-pink-500"
                />
              </div>

              <div className="flex items-center gap-2.5 w-full md:w-auto justify-end flex-wrap">
                {/* Quick Role Selector */}
                <Select
                  value={roleFilter}
                  onValueChange={(val) => {
                    setRoleFilter(val as any);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-36 h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer">
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

                {/* Quick Group Selector */}
                <Select
                  value={groupFilter}
                  onValueChange={(val) => {
                    setGroupFilter(val);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-36 h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer">
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

                {/* Advanced Filter Popover */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={`h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl text-xs font-normal border transition-all cursor-pointer ${activeFiltersCount > 0
                        ? "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800"
                        : "bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900"
                        }`}
                    >
                      <Filter className="w-3.5 h-3.5" />
                      <span>Bộ lọc</span>
                      {activeFiltersCount > 0 && (
                        <span className="w-4 h-4 rounded-full bg-purple-600 text-white text-xs font-bold flex items-center justify-center">
                          {activeFiltersCount}
                        </span>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl space-y-3.5">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                      <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Bộ lọc nâng cao</h4>
                      {activeFiltersCount > 0 && (
                        <button
                          onClick={clearAllFilters}
                          className="text-xs font-medium text-pink-600 hover:underline cursor-pointer"
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
                      <Select
                        value={statusFilter}
                        onValueChange={(val) => {
                          setStatusFilter(val as any);
                          setPage(1);
                        }}
                      >
                        <SelectTrigger className="w-full h-8.5 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer">
                          <SelectValue placeholder="Tất cả trạng thái" />
                        </SelectTrigger>
                        <SelectContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
                          <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">Tất cả trạng thái</SelectItem>
                          <SelectItem value="ACTIVE" className="text-xs font-normal cursor-pointer">Đang hoạt động</SelectItem>
                          <SelectItem value="INACTIVE" className="text-xs font-normal cursor-pointer">Tạm khóa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Phụ trách Fleet */}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Số tài khoản phụ trách
                      </label>
                      <Select
                        value={hasAccountsFilter}
                        onValueChange={(val) => {
                          setHasAccountsFilter(val as any);
                          setPage(1);
                        }}
                      >
                        <SelectTrigger className="w-full h-8.5 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer">
                          <SelectValue placeholder="Tất cả" />
                        </SelectTrigger>
                        <SelectContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
                          <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">Tất cả</SelectItem>
                          <SelectItem value="YES" className="text-xs font-normal cursor-pointer">Đang phụ trách TikTok Acc</SelectItem>
                          <SelectItem value="NO" className="text-xs font-normal cursor-pointer">Chưa gán tài khoản nào (0)</SelectItem>
                        </SelectContent>
                      </Select>
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
                    <div className="text-xs font-semibold text-slate-900 dark:text-white pb-1 border-b border-slate-100 dark:border-slate-800">
                      Sắp xếp theo cột
                    </div>
                    {[
                      { key: "fullName", label: "Họ & tên" },
                      { key: "username", label: "Username" },
                      { key: "email", label: "Email" },
                      { key: "role", label: "Vai trò" },
                      { key: "groupName", label: "Nhóm" },
                      { key: "accountsCount", label: "Số acc phụ trách" },
                      { key: "isActive", label: "Trạng thái hoạt động" },
                      { key: "createdAt", label: "Ngày tạo" },
                    ].map((item) => (
                      <button
                        key={item.key}
                        onClick={() => handleSort(item.key as SortKey)}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-normal text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <span>{item.label}</span>
                        {sortConfig.key === item.key && (
                          <span className="text-xs font-bold text-pink-600 dark:text-pink-400">
                            {sortConfig.desc ? "Giảm dần ↓" : "Tăng dần ↑"}
                          </span>
                        )}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>

                {/* View Mode Switcher */}
                <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <button
                    onClick={() => handleViewModeChange("grid")}
                    className={`flex items-center justify-center w-7 h-7 rounded-lg text-xs transition-all cursor-pointer ${
                      viewMode === "grid"
                        ? "bg-white dark:bg-slate-900 text-pink-600 dark:text-pink-400 shadow-xs font-semibold"
                        : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                    }`}
                    title="Dạng lưới thẻ (Grid Cards)"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleViewModeChange("list")}
                    className={`flex items-center justify-center w-7 h-7 rounded-lg text-xs transition-all cursor-pointer ${
                      viewMode === "list"
                        ? "bg-white dark:bg-slate-900 text-pink-600 dark:text-pink-400 shadow-xs font-semibold"
                        : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                    }`}
                    title="Dạng bảng danh sách (Table List)"
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Column Visibility Popover (Only for List view) */}
                {viewMode === "list" && (
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
                          className="text-xs text-pink-500 hover:underline font-normal cursor-pointer"
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
                    className={`group bg-white dark:bg-slate-900/80 rounded-3xl border transition-all duration-200 relative overflow-hidden flex flex-col hover:shadow-lg hover:shadow-pink-500/5 hover:-translate-y-0.5 ${
                      isSelected
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
                        {getRoleBadge(u.role)}
                      </div>

                      <div className="flex items-center gap-1.5">
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
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold border transition-all ${
                            u.id === session?.user?.id
                              ? "opacity-75 cursor-default"
                              : "cursor-pointer"
                          } ${
                            u.isActive
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                              : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 hover:bg-rose-500/20"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              u.isActive ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
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
                                className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5 text-slate-400" />
                                <span>Xem chi tiết Fleet</span>
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
                                className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg cursor-pointer font-medium"
                              >
                                <Key className="w-3.5 h-3.5 text-amber-500" />
                                <span>Quản lý Extension Token</span>
                              </DropdownMenuItem>
                            )}

                            {isAdmin && (
                              <DropdownMenuItem
                                disabled={u.id === session?.user?.id}
                                onClick={() => openToggleStatusModal(u)}
                                className={`flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer font-medium ${
                                  u.id === session?.user?.id
                                    ? "opacity-50 cursor-not-allowed text-slate-400"
                                    : u.isActive
                                    ? "text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                    : "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                }`}
                              >
                                {u.isActive ? (
                                  <>
                                    <Ban className="w-3.5 h-3.5 text-rose-500" />
                                    <span>Chặn quyền truy cập</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
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
                              className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg cursor-pointer font-semibold"
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
                          <SelectTrigger className="w-36 h-7 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer">
                            <SelectValue placeholder="Gán nhóm">
                              {u.groupName ? (
                                <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                                  {u.groupName}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic">Chưa gán</span>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-56">
                            <SelectItem value="NONE" className="text-xs text-slate-400 cursor-pointer">
                              Không gán nhóm (Trống)
                            </SelectItem>
                            {availableGroups.map((g: string) => (
                              <SelectItem key={g} value={g} className="text-xs cursor-pointer font-medium">
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
                        href={`/accounts?userId=${u.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-pink-600 dark:text-pink-400 hover:text-pink-700 dark:hover:text-pink-300 transition-colors"
                      >
                        <span>Dàn acc</span>
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
            <div className="overflow-x-auto relative">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-slate-600 dark:text-slate-300 font-semibold text-xs border-b border-slate-200 dark:border-slate-800 select-none normal-case">
                  <tr>
                    {/* Checkbox All (Frozen Left) */}
                    <th className="py-3.5 px-4 w-10 sticky left-0 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs">
                      <Checkbox
                        checked={isAllPageSelected}
                        onCheckedChange={(val) => toggleSelectAll(!!val)}
                        aria-label="Chọn tất cả trên trang"
                      />
                    </th>

                    {/* Columns */}
                    {visibleColumns.fullName && (
                      <th
                        onClick={() => handleSort("fullName")}
                        className="py-3.5 px-4 cursor-pointer group hover:text-slate-900 dark:hover:text-white sticky left-10 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.03)] min-w-[220px]"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Họ & tên</span>
                          {renderSortIndicator("fullName")}
                        </div>
                      </th>
                    )}

                    {visibleColumns.username && (
                      <th
                        onClick={() => handleSort("username")}
                        className="py-3.5 px-4 cursor-pointer group hover:text-slate-900 dark:hover:text-white min-w-[140px]"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Username</span>
                          {renderSortIndicator("username")}
                        </div>
                      </th>
                    )}

                    {visibleColumns.email && (
                      <th
                        onClick={() => handleSort("email")}
                        className="py-3.5 px-4 cursor-pointer group hover:text-slate-900 dark:hover:text-white min-w-[180px]"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Email</span>
                          {renderSortIndicator("email")}
                        </div>
                      </th>
                    )}

                    {visibleColumns.role && (
                      <th
                        onClick={() => handleSort("role")}
                        className="py-3.5 px-4 cursor-pointer group hover:text-slate-900 dark:hover:text-white min-w-[120px]"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Vai trò</span>
                          {renderSortIndicator("role")}
                        </div>
                      </th>
                    )}

                    {/* Group Column */}
                    {visibleColumns.groupName && (
                      <th
                        onClick={() => handleSort("groupName")}
                        className="py-3.5 px-4 cursor-pointer group hover:text-slate-900 dark:hover:text-white min-w-[160px]"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Nhóm</span>
                          {renderSortIndicator("groupName")}
                        </div>
                      </th>
                    )}

                    {visibleColumns.accountsCount && (
                      <th
                        onClick={() => handleSort("accountsCount")}
                        className="py-3.5 px-4 cursor-pointer group hover:text-slate-900 dark:hover:text-white min-w-[155px] whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Số acc phụ trách</span>
                          {renderSortIndicator("accountsCount")}
                        </div>
                      </th>
                    )}

                    {visibleColumns.isActive && (
                      <th
                        onClick={() => handleSort("isActive")}
                        className="py-3.5 px-4 cursor-pointer group hover:text-slate-900 dark:hover:text-white min-w-[150px] whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Trạng thái</span>
                          {renderSortIndicator("isActive")}
                        </div>
                      </th>
                    )}

                    {visibleColumns.actions && (
                      <th className="py-3.5 px-6 text-center whitespace-nowrap sticky right-0 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs border-l border-slate-200 dark:border-slate-800 shadow-[-2px_0_5px_rgba(0,0,0,0.03)] min-w-[110px]">
                        Thao tác
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
                            <td className="py-3 px-4 sticky left-10 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs group-hover:bg-slate-50 dark:group-hover:bg-slate-800/90 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.03)] min-w-[220px]">
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
                            <td className="py-3 px-4 text-slate-600 dark:text-slate-300 font-mono text-xs">
                              @{u.username}
                            </td>
                          )}

                          {/* Email */}
                          {visibleColumns.email && (
                            <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                              {u.email}
                            </td>
                          )}

                          {/* Role */}
                          {visibleColumns.role && (
                            <td className="py-3 px-4">
                              {getRoleBadge(u.role)}
                            </td>
                          )}

                          {/* Group Select Dropdown */}
                          {visibleColumns.groupName && (
                            <td className="py-3 px-4">
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
                                <SelectTrigger className="w-36 h-7.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer">
                                  <SelectValue placeholder="Gán nhóm">
                                    {u.groupName ? (
                                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                                        {u.groupName}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">Chưa gán nhóm</span>
                                    )}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-56">
                                  <SelectItem value="NONE" className="text-xs text-slate-400 cursor-pointer">
                                    Không gán nhóm (Trống)
                                  </SelectItem>
                                  {availableGroups.map((g: string) => (
                                    <SelectItem key={g} value={g} className="text-xs cursor-pointer font-medium">
                                      {g}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                          )}

                          {/* Accounts Count */}
                          {visibleColumns.accountsCount && (
                            <td className="py-3 px-4">
                              <span className="inline-flex items-center px-2.5 h-7.5 rounded-xl text-xs font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 shadow-2xs">
                                {u.accountsCount} tài khoản
                              </span>
                            </td>
                          )}

                          {/* Status */}
                          {visibleColumns.isActive && (
                            <td className="py-3 px-4 whitespace-nowrap min-w-[150px]">
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
                                className={`inline-flex items-center gap-1.5 px-3 h-7.5 rounded-xl text-xs font-bold border transition-all shadow-2xs whitespace-nowrap ${
                                  u.id === session?.user?.id
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
                            <td className="py-3 px-6 text-center sticky right-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs group-hover:bg-slate-50 dark:group-hover:bg-slate-800/90 border-l border-slate-200 dark:border-slate-800 shadow-[-2px_0_5px_rgba(0,0,0,0.03)]">
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
                                      <span>Xem chi tiết Fleet</span>
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
                                      className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg cursor-pointer font-medium"
                                    >
                                      <Key className="w-3.5 h-3.5 text-amber-500" />
                                      <span>Quản lý Extension Token</span>
                                    </DropdownMenuItem>
                                  )}

                                  {isAdmin && (
                                    <DropdownMenuItem
                                      disabled={u.id === session?.user?.id}
                                      onClick={() => openToggleStatusModal(u)}
                                      className={`flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer font-medium ${
                                        u.id === session?.user?.id
                                          ? "opacity-50 cursor-not-allowed text-slate-400"
                                          : u.isActive
                                          ? "text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                          : "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                      }`}
                                    >
                                      {u.isActive ? (
                                        <>
                                          <Ban className="w-3.5 h-3.5 text-rose-500" />
                                          <span>Chặn quyền truy cập</span>
                                        </>
                                      ) : (
                                        <>
                                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
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
                                    className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg cursor-pointer font-semibold"
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
                      <th className="py-3.5 px-4 sticky left-0 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.03)] min-w-[220px]">
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
                                        onClick={() => {
                                          if (
                                            confirm(
                                              `Xác nhận THU HỒI lời mời gửi đến "${inv.email}"?\n\nSau khi thu hồi, liên kết kích hoạt trong email sẽ bị vô hiệu hóa hoàn toàn ngay lập tức.`
                                            )
                                          ) {
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
                                    onClick={() => {
                                      if (confirm(`Xác nhận xóa hoàn toàn bản ghi lời mời gửi đến "${inv.email}"?`)) {
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
      {selectedIds.size > 0 && (
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
                        onClick={() => {
                          if (confirm(`Bạn có chắc muốn xóa nhóm "${groupName}"? Nhân sự trong nhóm sẽ về trạng thái Chưa gán nhóm.`)) {
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
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                  userToToggleStatus.isActive
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
                className={`flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white rounded-xl shadow-md active:scale-95 transition-all disabled:opacity-60 cursor-pointer ${
                  userToToggleStatus.isActive
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
                onClick={() => {
                  if (
                    confirm(
                      `Xác nhận ${tokenData?.accessEnabled === false ? "mở lại quyền và cấp Token mới" : "thu hồi và tạo Token mới"} cho ${selectedUserForToken.fullName || selectedUserForToken.username
                      }?`
                    )
                  ) {
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
                  onClick={() => {
                    if (
                      confirm(
                        `Xác nhận VÔ HIỆU HÓA HOÀN TOÀN quyền Extension của ${selectedUserForToken.fullName || selectedUserForToken.username
                        }?\n\nSau khi vô hiệu hóa, nhân sự sẽ không thể tự tạo lại token và Extension sẽ bị khóa ngay lập tức!`
                      )
                    ) {
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
                <span>Tải Extension hộ (ZIP pairing)</span>
              </a>
            </div>
          </div>
        </div>
      )}
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

