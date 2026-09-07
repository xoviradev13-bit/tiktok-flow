"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
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
} from "lucide-react";
import { Pagination } from "@/components/ui/pagination";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
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

export default function UsersManagementPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === "ADMIN";

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

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "LEAD" | "STAFF">("STAFF");
  const [inviteGroup, setInviteGroup] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // New staff modal (Direct create)
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"ADMIN" | "LEAD" | "STAFF">("STAFF");
  const [newGroup, setNewGroup] = useState("");

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

  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: users = [], isLoading: loading } = trpc.admin.listUsers.useQuery();
  const { data: invitations = [], isLoading: loadingInvites } = trpc.admin.listInvitations.useQuery();
  const { data: groupsData } = trpc.admin.listGroups.useQuery();
  const availableGroups = useMemo(() => {
    return groupsData?.groups || ["Team US #1", "Team EU #1", "Team VN #1"];
  }, [groupsData]);

  const createInviteMutation = trpc.admin.createInvitation.useMutation({
    onSuccess: (res) => {
      setIsInviteModalOpen(false);
      setInviteEmail("");
      setInviteGroup("");
      setActionMsg(`✅ Đã gửi thư mời thành công đến ${res.email}!`);
      utils.admin.listInvitations.invalidate();
      setTimeout(() => setActionMsg(null), 5000);
    },
    onError: (err: any) => {
      alert(err.message || "Lỗi tạo thư mời");
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

  const createUserMutation = trpc.admin.createUser.useMutation({
    onSuccess: () => {
      setIsAddUserOpen(false);
      setNewUsername("");
      setNewFullName("");
      setNewEmail("");
      setNewPassword("");
      setNewGroup("");
      setActionMsg("✅ Đã tạo nhân sự mới thành công!");
      utils.admin.listUsers.invalidate();
      utils.admin.listGroups.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => {
      alert(err.message || "Lỗi tạo tài khoản");
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
      setActionMsg(
        res.isActive ? "✅ Đã kích hoạt tài khoản" : "⚠️ Đã tạm khóa tài khoản"
      );
      utils.admin.listUsers.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => alert(err.message),
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newEmail) return;
    createUserMutation.mutate({
      username: newUsername,
      name: newFullName || undefined,
      email: newEmail,
      role: newRole,
      groupName: newGroup || null,
      password: newPassword || undefined,
    });
  };

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    createInviteMutation.mutate({
      email: inviteEmail.trim(),
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

  const handleToggleStatus = (userId: string, currentStatus: boolean) => {
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
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20">
            <Shield className="w-3 h-3" />
            ADMIN
          </span>
        );
      case "LEAD":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
            <ShieldCheck className="w-3 h-3" />
            LEAD
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
            <UserCheck className="w-3 h-3" />
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      {/* Sticky Header Section */}
      <div className="sticky top-16 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-md pt-2 pb-3 -mt-2 space-y-4">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
              <UserCog className="w-7 h-7 text-pink-500" />
              Quản Lý Nhân Sự & Phân Quyền ({totalCount})
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
              onClick={() => setIsAddUserOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-xs active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo Trực Tiếp</span>
            </button>
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
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "USERS"
                ? "bg-pink-600 text-white shadow-md shadow-pink-600/25"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Thành Viên Hệ Thống ({totalCount})</span>
          </button>
          <button
            onClick={() => setActiveTab("INVITATIONS")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "INVITATIONS"
                ? "bg-pink-600 text-white shadow-md shadow-pink-600/25"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Lời Mời Đang Chờ ({invitations.filter((i: any) => i.status === "PENDING").length})</span>
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
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{totalCount}</div>
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-medium text-pink-600 dark:text-pink-400 flex items-center gap-1">
                <Shield className="w-3.5 h-3.5" /> Quản Trị Viên (Admin)
              </div>
              <div className="text-2xl font-black text-pink-600 dark:text-pink-400 mt-1">{adminCount}</div>
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-medium text-cyan-600 dark:text-cyan-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Trưởng Nhóm (Lead)
              </div>
              <div className="text-2xl font-black text-cyan-600 dark:text-cyan-400 mt-1">{leadCount}</div>
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5" /> Nhân Viên (Staff)
              </div>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{staffCount}</div>
            </div>
          </div>
        )}

        {/* Filter & Search Toolbar */}
        {activeTab === "USERS" && (
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
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
                        <span className="w-4 h-4 rounded-full bg-purple-600 text-white text-[10px] font-bold flex items-center justify-center">
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
                          className="text-[11px] font-medium text-pink-600 hover:underline cursor-pointer"
                        >
                          Đặt lại
                        </button>
                      )}
                    </div>

                    {/* Trạng thái hoạt động */}
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
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
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
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
                        className="text-[10px] text-pink-500 hover:underline font-normal cursor-pointer"
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
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {activeTab === "USERS" ? (
        loading ? (
          <DataTableSkeleton columnCount={visibleColumnCount} rowCount={pageSize} />
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
                        className="py-3.5 px-4 cursor-pointer group hover:text-slate-900 dark:hover:text-white min-w-[130px]"
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
                          className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group ${
                            isSelected ? "bg-pink-50/40 dark:bg-pink-950/20" : ""
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
                                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-pink-500 to-rose-500 flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                                  {u.avatar ? (
                                    <img
                                      src={u.avatar}
                                      alt={u.username}
                                      className="w-full h-full rounded-full object-cover"
                                    />
                                  ) : (
                                    (u.fullName || u.username || "U")[0]?.toUpperCase()
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
                                <SelectTrigger className="w-36 h-7 text-[11px] rounded-lg bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer">
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
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20">
                                {u.accountsCount} tài khoản
                              </span>
                            </td>
                          )}

                          {/* Status */}
                          {visibleColumns.isActive && (
                            <td className="py-3 px-4">
                              <button
                                onClick={() => handleToggleStatus(u.id, u.isActive)}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                                  u.isActive
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
                                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20"
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    u.isActive ? "bg-emerald-500" : "bg-rose-500"
                                  }`}
                                />
                                {u.isActive ? "Hoạt động" : "Tạm khóa"}
                              </button>
                            </td>
                          )}

                          {/* Action Menu (Frozen Right) */}
                          {visibleColumns.actions && (
                            <td className="py-3 px-6 text-center sticky right-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs group-hover:bg-slate-50 dark:group-hover:bg-slate-800/90 border-l border-slate-200 dark:border-slate-800 shadow-[-2px_0_5px_rgba(0,0,0,0.03)]">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
                                    <MoreHorizontal className="w-4 h-4" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="end"
                                  className="w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-1"
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
                onPageChange={setPage}
                onPageSizeChange={(newSize) => {
                  setPageSize(newSize);
                  setPage(1);
                }}
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
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{invitations.length}</div>
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Đang Chờ Kích Hoạt
              </div>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
                {invitations.filter((i: any) => i.status === "PENDING").length}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Đã Kích Hoạt Thành Công
              </div>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {invitations.filter((i: any) => i.status === "ACCEPTED").length}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1">
                <Ban className="w-3.5 h-3.5" /> Đã Thu Hồi / Hết Hạn
              </div>
              <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
                {invitations.filter((i: any) => i.status === "EXPIRED" || i.status === "REVOKED").length}
              </div>
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
                      <th className="py-3.5 px-4">Email Nhận Lời Mời</th>
                      <th className="py-3.5 px-4">Phân Quyền</th>
                      <th className="py-3.5 px-4">Nhóm / Team</th>
                      <th className="py-3.5 px-4">Người Gửi Lời Mời</th>
                      <th className="py-3.5 px-4">Hạn Sử Dụng</th>
                      <th className="py-3.5 px-4">Trạng Thái</th>
                      <th className="py-3.5 px-4 text-center">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                    {invitations.map((inv: any) => {
                      const isPending = inv.status === "PENDING";
                      const isAccepted = inv.status === "ACCEPTED";
                      const isExpired = inv.status === "EXPIRED";
                      const isRevoked = inv.status === "REVOKED";

                      const isExpiringSoon = isPending && new Date(inv.expiresAt).getTime() - Date.now() < 24 * 60 * 60 * 1000;

                      return (
                        <tr key={inv.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4 text-slate-400" />
                              <span>{inv.email}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            {getRoleBadge(inv.role)}
                          </td>
                          <td className="py-3.5 px-4">
                            {inv.groupName ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20">
                                {inv.groupName}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">Chưa gán</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                            {inv.invitedBy?.name || inv.invitedBy?.username || inv.invitedBy?.email || "Admin"}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                            <div className="flex flex-col">
                              <span>{new Date(inv.expiresAt).toLocaleDateString("vi-VN")}</span>
                              {isExpiringSoon && (
                                <span className="text-[10px] font-bold text-amber-500 flex items-center gap-0.5">
                                  <Clock className="w-3 h-3" /> Sắp hết hạn
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            {isPending && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                <Clock className="w-3 h-3" /> Đang chờ
                              </span>
                            )}
                            {isAccepted && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3" /> Đã tham gia
                              </span>
                            )}
                            {isExpired && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
                                <Clock className="w-3 h-3" /> Hết hạn
                              </span>
                            )}
                            {isRevoked && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                <Ban className="w-3 h-3" /> Đã thu hồi
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
                                        className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
                                      >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>Gửi lại & Gia hạn 7 ngày</TooltipContent>
                                  </Tooltip>

                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        onClick={() => revokeInviteMutation.mutate({ id: inv.id })}
                                        className="w-7 h-7 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 flex items-center justify-center transition-colors cursor-pointer"
                                      >
                                        <Ban className="w-3.5 h-3.5" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>Thu hồi lời mời</TooltipContent>
                                  </Tooltip>
                                </>
                              )}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => deleteInviteMutation.mutate({ id: inv.id })}
                                    className="w-7 h-7 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 flex items-center justify-center transition-colors cursor-pointer"
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
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
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

      {/* Modal: Add User */}
      {isAddUserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-pink-500" />
                Thêm Thành Viên Mới
              </h3>
              <button
                onClick={() => setIsAddUserOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Username *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. david_staff"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-pink-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Họ & Tên
                </label>
                <input
                  type="text"
                  placeholder="e.g. David Nguyen"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-pink-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  required
                  placeholder="email@tiktokflow.io"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-pink-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Mật Khẩu Khởi Tạo (Tùy chọn)
                </label>
                <input
                  type="password"
                  placeholder="Mặc định: 123456"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-pink-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Vai Trò (Role)
                  </label>
                  <Select value={newRole} onValueChange={(val) => setNewRole(val as "ADMIN" | "LEAD" | "STAFF")}>
                    <SelectTrigger className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white cursor-pointer">
                      <SelectValue placeholder="Chọn vai trò" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      <SelectItem value="STAFF" className="text-xs cursor-pointer">STAFF (Nhân viên / Operator)</SelectItem>
                      <SelectItem value="LEAD" className="text-xs cursor-pointer">LEAD (Team Leader)</SelectItem>
                      <SelectItem value="ADMIN" className="text-xs cursor-pointer">ADMIN (Quản trị viên)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nhóm (Group / Team)
                  </label>
                  <Select value={newGroup || "UNASSIGNED"} onValueChange={(val) => setNewGroup(val === "UNASSIGNED" ? "" : val)}>
                    <SelectTrigger className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white cursor-pointer">
                      <SelectValue placeholder="-- Chưa gán nhóm --" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl max-h-56">
                      <SelectItem value="UNASSIGNED" className="text-xs text-slate-400 cursor-pointer">
                        -- Chưa gán nhóm --
                      </SelectItem>
                      {availableGroups.map((g: string) => (
                        <SelectItem key={g} value={g} className="text-xs cursor-pointer">
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddUserOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={createUserMutation.isPending}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white shadow-md shadow-pink-600/30 cursor-pointer disabled:opacity-60"
                >
                  {createUserMutation.isPending ? "Đang tạo..." : "Tạo Nhân Sự"}
                </button>
              </div>
            </form>
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
                <div className="text-[11px] text-amber-600 dark:text-amber-400 pt-1 font-medium">
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
    </div>
  );
}
