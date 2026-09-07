"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
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

type GroupSortKey = "name" | "membersCount" | "totalAccounts" | "createdAt";

const COLOR_OPTIONS = [
  { value: "pink", label: "Hồng Neon", class: "bg-pink-500", text: "text-pink-500", border: "border-pink-500/30", bgLight: "bg-pink-500/10" },
  { value: "cyan", label: "Xanh Cyan", class: "bg-cyan-500", text: "text-cyan-500", border: "border-cyan-500/30", bgLight: "bg-cyan-500/10" },
  { value: "emerald", label: "Xanh Lá", class: "bg-emerald-500", text: "text-emerald-500", border: "border-emerald-500/30", bgLight: "bg-emerald-500/10" },
  { value: "violet", label: "Tím Violet", class: "bg-violet-500", text: "text-violet-500", border: "border-violet-500/30", bgLight: "bg-violet-500/10" },
  { value: "amber", label: "Cam Amber", class: "bg-amber-500", text: "text-amber-500", border: "border-amber-500/30", bgLight: "bg-amber-500/10" },
  { value: "indigo", label: "Xanh Indigo", class: "bg-indigo-500", text: "text-indigo-500", border: "border-indigo-500/30", bgLight: "bg-indigo-500/10" },
];

export default function GroupsManagementPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === "ADMIN";

  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: GroupSortKey; desc: boolean }>({
    key: "createdAt",
    desc: true,
  });

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

  // Action feedback message
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Bulk Selection State
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  // Modals: Single Actions
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newColor, setNewColor] = useState("pink");
  const [newLeaderId, setNewLeaderId] = useState("");

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editColor, setEditColor] = useState("pink");
  const [editLeaderId, setEditLeaderId] = useState("");

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<any>(null);

  // Modals: Bulk Actions
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isBulkAssignLeaderOpen, setIsBulkAssignLeaderOpen] = useState(false);
  const [bulkLeaderId, setBulkLeaderId] = useState("");
  const [isBulkColorOpen, setIsBulkColorOpen] = useState(false);
  const [bulkColorVal, setBulkColorVal] = useState("pink");

  const utils = trpc.useUtils();

  // Queries
  const { data: groupsData, isLoading: loading } = trpc.admin.listGroups.useQuery();
  const { data: allUsers = [] } = trpc.admin.listUsers.useQuery();

  const groups = useMemo(() => {
    return groupsData?.groupsDetails || [];
  }, [groupsData]);

  // Mutations
  const createGroupMutation = trpc.admin.createGroup.useMutation({
    onSuccess: () => {
      setIsCreateOpen(false);
      setNewName("");
      setNewDesc("");
      setNewColor("pink");
      setNewLeaderId("");
      setActionMsg("✅ Đã tạo nhóm mới thành công!");
      utils.admin.listGroups.invalidate();
      utils.admin.listUsers.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => {
      alert(err.message || "Lỗi tạo nhóm");
    },
  });

  const updateGroupMutation = trpc.admin.updateGroup.useMutation({
    onSuccess: () => {
      setIsEditOpen(false);
      setEditingGroup(null);
      setActionMsg("✅ Đã cập nhật thông tin nhóm!");
      utils.admin.listGroups.invalidate();
      utils.admin.listUsers.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => {
      alert(err.message || "Lỗi cập nhật nhóm");
    },
  });

  const deleteGroupMutation = trpc.admin.deleteGroup.useMutation({
    onSuccess: () => {
      setIsDeleteOpen(false);
      setGroupToDelete(null);
      setActionMsg("🗑️ Đã xóa nhóm thành công!");
      utils.admin.listGroups.invalidate();
      utils.admin.listUsers.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => {
      alert(err.message || "Lỗi xóa nhóm");
    },
  });

  // Bulk Mutations
  const bulkDeleteGroupsMutation = trpc.admin.bulkDeleteGroups.useMutation({
    onSuccess: (res) => {
      setIsBulkDeleteOpen(false);
      setSelectedGroupIds([]);
      setActionMsg(`🗑️ Đã xóa thành công ${res.count} nhóm đã chọn!`);
      utils.admin.listGroups.invalidate();
      utils.admin.listUsers.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => {
      alert(err.message || "Lỗi xóa nhóm hàng loạt");
    },
  });

  const bulkAssignLeaderMutation = trpc.admin.bulkAssignGroupsLeader.useMutation({
    onSuccess: (res) => {
      setIsBulkAssignLeaderOpen(false);
      setBulkLeaderId("");
      setSelectedGroupIds([]);
      setActionMsg(`👑 Đã cập nhật Trưởng nhóm cho ${res.count} nhóm!`);
      utils.admin.listGroups.invalidate();
      utils.admin.listUsers.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => {
      alert(err.message || "Lỗi chỉ định leader");
    },
  });

  const bulkChangeColorMutation = trpc.admin.bulkChangeGroupsColor.useMutation({
    onSuccess: (res) => {
      setIsBulkColorOpen(false);
      setSelectedGroupIds([]);
      setActionMsg(`🎨 Đã đổi màu nhãn cho ${res.count} nhóm!`);
      utils.admin.listGroups.invalidate();
      utils.admin.listUsers.invalidate();
      setTimeout(() => setActionMsg(null), 4000);
    },
    onError: (err: any) => {
      alert(err.message || "Lỗi đổi màu nhóm");
    },
  });

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    createGroupMutation.mutate({
      name: newName.trim(),
      description: newDesc.trim() || undefined,
      color: newColor,
      leaderId: newLeaderId || null,
    });
  };

  const handleOpenEdit = (group: any) => {
    setEditingGroup(group);
    setEditName(group.name);
    setEditDesc(group.description || "");
    setEditColor(group.color || "pink");
    setEditLeaderId(group.leader?.id || "");
    setIsEditOpen(true);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup || !editName.trim()) return;
    updateGroupMutation.mutate({
      id: editingGroup.id,
      name: editName.trim(),
      description: editDesc.trim() || null,
      color: editColor,
      leaderId: editLeaderId || null,
    });
  };

  const handleSort = (key: GroupSortKey) => {
    setSortConfig((prev) => ({
      key,
      desc: prev.key === key ? !prev.desc : false,
    }));
  };

  // Filter & Sort
  const filteredAndSortedGroups = useMemo(() => {
    const s = search.toLowerCase().trim();

    const filtered = groups.filter((g: any) => {
      const matchName = g.name.toLowerCase().includes(s);
      const matchDesc = g.description && g.description.toLowerCase().includes(s);
      const matchLeader = g.leader && g.leader.name.toLowerCase().includes(s);
      const matchMember = g.members?.some(
        (m: any) => m.name.toLowerCase().includes(s) || m.username.toLowerCase().includes(s)
      );
      return !s || matchName || matchDesc || matchLeader || matchMember;
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
    allFilteredIds.every((id: string) => selectedGroupIds.includes(id));
  const isSomeSelected =
    allFilteredIds.some((id: string) => selectedGroupIds.includes(id)) && !isAllSelected;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedGroupIds([]);
    } else {
      setSelectedGroupIds(allFilteredIds);
    }
  };

  const toggleSelectGroup = (id: string) => {
    setSelectedGroupIds((prev) =>
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

  const renderSortIndicator = (key: GroupSortKey) => {
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-28">
      {/* Sticky Header Section */}
      <div className="sticky top-16 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-md pt-2 pb-3 -mt-2 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
              <Layers className="w-7 h-7 text-pink-500" />
              Quản Lý Nhóm & Teams ({totalGroupsCount})
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Quản trị cơ cấu nhóm, chỉ định Trưởng nhóm (Leader) và theo dõi thành viên & dàn tài khoản TikTok phụ trách.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <Link
              href="/users"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-xs active:scale-95 transition-all cursor-pointer"
            >
              <Users className="w-4 h-4 text-slate-500" />
              <span>Xem Danh Sách Nhân Sự</span>
            </Link>

            {isAdmin && (
              <button
                onClick={() => setIsCreateOpen(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-lg shadow-pink-600/30 active:scale-95 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Tạo Nhóm Mới</span>
              </button>
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
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{totalGroupsCount}</div>
          </div>
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5" /> Thành Viên Đã Vào Nhóm
            </div>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{totalAssignedMembers}</div>
          </div>
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
            <div className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> Chưa Phân Nhóm
            </div>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{unassignedStaffCount}</div>
          </div>
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
            <div className="text-xs font-medium text-pink-600 dark:text-pink-400 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" /> Tổng Account Thuộc Nhóm
            </div>
            <div className="text-2xl font-black text-pink-600 dark:text-pink-400 mt-1">{totalAccountsCovered}</div>
          </div>
        </div>

        {/* Search & Action Toolbar */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo tên nhóm, mô tả, trưởng nhóm, thành viên..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-4 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-pink-500"
            />
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end flex-wrap">
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
                  { key: "name", label: "Tên nhóm (Group Name)" },
                  { key: "membersCount", label: "Số lượng thành viên" },
                  { key: "totalAccounts", label: "Số account phụ trách" },
                  { key: "createdAt", label: "Thời gian tạo" },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => handleSort(item.key as GroupSortKey)}
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
                        name: true,
                        createdBy: true,
                        createdAt: true,
                        leader: true,
                        members: true,
                        totalAccounts: true,
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

            <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline ml-2">
              Hiển thị: <strong className="text-slate-900 dark:text-white">{filteredAndSortedGroups.length}</strong> nhóm
            </span>
          </div>
        </div>
      </div>

      {/* Main Groups Table */}
      {loading ? (
        <DataTableSkeleton columnCount={visibleColumnCount} rowCount={5} />
      ) : (
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden relative z-0 isolate">
          <div className="overflow-x-auto relative">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800 select-none">
                <tr>
                  {isAdmin && (
                    <th className="py-3.5 px-4 w-10 text-center sticky left-0 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs">
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
                  <th className={`py-3.5 px-4 w-12 text-center sticky ${isAdmin ? "left-10" : "left-0"} z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs`}>
                    #
                  </th>
                  {visibleColumns.name && (
                    <th
                      onClick={() => handleSort("name")}
                      className={`py-3.5 px-4 cursor-pointer group hover:text-slate-900 dark:hover:text-white sticky ${
                        isAdmin ? "left-22" : "left-12"
                      } z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.03)] min-w-[200px]`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Tên nhóm</span>
                        {renderSortIndicator("name")}
                      </div>
                    </th>
                  )}
                  {visibleColumns.createdBy && (
                    <th className="py-3.5 px-4 min-w-[150px]">Người tạo</th>
                  )}
                  {visibleColumns.createdAt && (
                    <th
                      onClick={() => handleSort("createdAt")}
                      className="py-3.5 px-4 cursor-pointer group hover:text-slate-900 dark:hover:text-white min-w-[140px]"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Ngày tạo</span>
                        {renderSortIndicator("createdAt")}
                      </div>
                    </th>
                  )}
                  {visibleColumns.leader && (
                    <th className="py-3.5 px-4 min-w-[170px]">Trưởng nhóm</th>
                  )}
                  {visibleColumns.members && (
                    <th
                      onClick={() => handleSort("membersCount")}
                      className="py-3.5 px-4 cursor-pointer group hover:text-slate-900 dark:hover:text-white min-w-[180px]"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Thành viên</span>
                        {renderSortIndicator("membersCount")}
                      </div>
                    </th>
                  )}
                  {visibleColumns.totalAccounts && (
                    <th
                      onClick={() => handleSort("totalAccounts")}
                      className="py-3.5 px-4 cursor-pointer group hover:text-slate-900 dark:hover:text-white min-w-[140px]"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Số acc phụ trách</span>
                        {renderSortIndicator("totalAccounts")}
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
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredAndSortedGroups.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumnCount} className="py-12 text-center text-slate-400 dark:text-slate-500">
                      Không tìm thấy nhóm nào phù hợp.
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedGroups.map((group: any, idx: number) => {
                    const members = group.members || [];
                    const maxDisplay = 5;
                    const displayMembers = members.slice(0, maxDisplay);
                    const remainingMembers = members.slice(maxDisplay);
                    const hasMore = remainingMembers.length > 0;
                    const isSelected = selectedGroupIds.includes(group.id);
                    const rowBgClass = isSelected
                      ? "bg-pink-50/50 dark:bg-pink-950/20"
                      : "bg-white dark:bg-slate-900";

                    return (
                      <tr
                        key={group.id}
                        className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 group ${
                          isSelected ? "bg-pink-50/50 dark:bg-pink-950/20" : ""
                        }`}
                      >
                        {/* Checkbox (Frozen Left) */}
                        {isAdmin && (
                          <td className={`py-4 px-4 text-center sticky left-0 z-10 ${rowBgClass} group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors`}>
                            <button
                              type="button"
                              onClick={() => toggleSelectGroup(group.id)}
                              className="text-slate-400 hover:text-pink-500 transition-colors cursor-pointer"
                              aria-label={`Chọn nhóm ${group.name}`}
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-pink-500" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                        )}

                        {/* Index (Frozen Left) */}
                        <td className={`py-4 px-4 text-center font-mono text-slate-400 text-[11px] sticky ${isAdmin ? "left-10" : "left-0"} z-10 ${rowBgClass} group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors`}>
                          {idx + 1}
                        </td>

                        {/* Group Name & Description (Frozen Left) */}
                        {visibleColumns.name && (
                          <td className={`py-4 px-4 sticky ${isAdmin ? "left-22" : "left-12"} z-10 ${rowBgClass} group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.03)]`}>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold border ${getColorClass(
                                    group.color
                                  )}`}
                                >
                                  <Layers className="w-3 h-3" />
                                  {group.name}
                                </span>
                              </div>
                              {group.description && (
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 max-w-xs">
                                  {group.description}
                                </p>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Created By */}
                        {visibleColumns.createdBy && (
                          <td className="py-4 px-4 whitespace-nowrap">
                            {group.createdBy ? (
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 font-bold text-[9px] uppercase shrink-0">
                                  {group.createdBy.name.slice(0, 2)}
                                </div>
                                <div>
                                  <span className="text-xs text-slate-800 dark:text-slate-200 font-medium block">
                                    {group.createdBy.name}
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    @{group.createdBy.username}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs italic">Hệ thống</span>
                            )}
                          </td>
                        )}

                        {/* Created At */}
                        {visibleColumns.createdAt && (
                          <td className="py-4 px-4 text-slate-600 dark:text-slate-400 text-[11px] whitespace-nowrap">
                            {group.createdAt ? (
                              <div>
                                <div className="font-medium text-slate-800 dark:text-slate-200">
                                  {new Date(group.createdAt).toLocaleDateString("vi-VN", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "numeric",
                                  })}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {new Date(group.createdAt).toLocaleTimeString("vi-VN", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </div>
                              </div>
                            ) : (
                              "--"
                            )}
                          </td>
                        )}

                        {/* Leader */}
                        {visibleColumns.leader && (
                          <td className="py-4 px-4 whitespace-nowrap">
                            {group.leader ? (
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-[10px] uppercase shadow-xs shrink-0">
                                  {group.leader.name.slice(0, 2)}
                                </div>
                                <div>
                                  <Link
                                    href={`/users/${group.leader.id}`}
                                    className="font-bold text-slate-800 dark:text-slate-200 hover:text-pink-600 dark:hover:text-pink-400 hover:underline transition-colors block text-xs"
                                  >
                                    {group.leader.name}
                                  </Link>
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-cyan-600 dark:text-cyan-400">
                                    <Crown className="w-2.5 h-2.5" /> Leader
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs italic">-- Chưa chỉ định --</span>
                            )}
                          </td>
                        )}

                        {/* Members with Avatar Stack (max 5) & Popover for the rest */}
                        {visibleColumns.members && (
                          <td className="py-4 px-4 min-w-[200px]">
                            {members.length === 0 ? (
                              <span className="text-slate-400 text-xs italic">Chưa có thành viên</span>
                            ) : (
                              <div className="flex items-center gap-2">
                                {/* Avatar Stack */}
                                <div className="flex items-center -space-x-2 overflow-hidden py-1">
                                  {displayMembers.map((member: any) => (
                                    <Tooltip key={member.id}>
                                      <TooltipTrigger asChild>
                                        <Link
                                          href={`/users/${member.id}`}
                                          className="inline-block relative ring-2 ring-white dark:ring-slate-900 rounded-full hover:scale-115 hover:z-20 transition-transform"
                                        >
                                          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-pink-500 to-rose-500 flex items-center justify-center text-white font-bold text-[10px] uppercase shadow-xs">
                                            {member.name.slice(0, 2)}
                                          </div>
                                        </Link>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="text-xs font-semibold">
                                        <div className="text-slate-900 dark:text-white font-bold">{member.name}</div>
                                        <div className="text-[10px] text-slate-400 font-normal">
                                          @{member.username} ({member.role})
                                        </div>
                                        <div className="text-[10px] text-pink-500 font-medium">
                                          {member.accountsCount} accounts phụ trách
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  ))}
                                </div>

                                {/* Remaining Members Popover */}
                                {hasMore && (
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button
                                        type="button"
                                        className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                                      >
                                        +{remainingMembers.length} thành viên
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent
                                      align="start"
                                      className="w-80 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl space-y-2.5"
                                    >
                                      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                                        <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                          <Users className="w-3.5 h-3.5 text-pink-500" />
                                          Toàn Bộ Thành Viên ({members.length})
                                        </div>
                                      </div>
                                      <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                                        {members.map((m: any) => (
                                          <Link
                                            key={m.id}
                                            href={`/users/${m.id}`}
                                            className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-950/60 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
                                          >
                                            <div className="flex items-center gap-2">
                                              <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-pink-500 to-rose-500 flex items-center justify-center text-white font-bold text-[9px] uppercase shadow-xs">
                                                {m.name.slice(0, 2)}
                                              </div>
                                              <div>
                                                <div className="font-bold text-xs text-slate-900 dark:text-white">
                                                  {m.name}
                                                </div>
                                                <div className="text-[10px] text-slate-400">
                                                  @{m.username} • {m.role}
                                                </div>
                                              </div>
                                            </div>
                                            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                              {m.accountsCount} accs
                                            </span>
                                          </Link>
                                        ))}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                )}
                              </div>
                            )}
                          </td>
                        )}

                        {/* Total Accounts */}
                        {visibleColumns.totalAccounts && (
                          <td className="py-4 px-4 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            {group.totalAccounts}{" "}
                            <span className="text-slate-400 text-[11px] font-normal">accounts</span>
                          </td>
                        )}

                        {/* Actions (Frozen Right, DropdownMenu) */}
                        {visibleColumns.actions && (
                          <td className={`py-4 px-6 text-center whitespace-nowrap sticky right-0 z-10 ${rowBgClass} group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors border-l border-slate-200 dark:border-slate-800 shadow-[-2px_0_5px_rgba(0,0,0,0.03)] min-w-[110px]`}>
                            {isAdmin ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                    aria-label="Thao tác"
                                  >
                                    <MoreHorizontal className="w-4 h-4" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-1.5 shadow-xl">
                                  <DropdownMenuItem
                                    onClick={() => handleOpenEdit(group)}
                                    className="flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-slate-400" />
                                    <span>Chỉnh sửa nhóm</span>
                                  </DropdownMenuItem>

                                  <DropdownMenuSeparator className="my-1 bg-slate-100 dark:bg-slate-800" />

                                  <DropdownMenuItem
                                    onClick={() => {
                                      setGroupToDelete(group);
                                      setIsDeleteOpen(true);
                                    }}
                                    className="flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Xóa nhóm</span>
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
      {isAdmin && selectedGroupIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 dark:bg-slate-900/95 border border-slate-700/80 text-white px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-4 animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-2 text-xs font-bold border-r border-slate-700 pr-3">
            <Layers className="w-4 h-4 text-pink-400" />
            <span>Đã chọn <strong className="text-pink-400 font-extrabold">{selectedGroupIds.length}</strong> nhóm</span>
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
            onClick={() => setSelectedGroupIds([])}
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

            <form onSubmit={handleCreateGroup} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Mô Tả Nhóm (Tùy chọn)
                </label>
                <textarea
                  rows={2}
                  placeholder="Mô tả mục tiêu, khu vực hoạt động của nhóm..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-pink-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Màu Sắc Nhãn Nhóm
                </label>
                <div className="flex items-center gap-2">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setNewColor(c.value)}
                      className={`w-7 h-7 rounded-full ${c.class} transition-transform cursor-pointer ${
                        newColor === c.value
                          ? "ring-2 ring-offset-2 ring-pink-500 scale-110"
                          : "opacity-80 hover:opacity-100"
                      }`}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Chỉ Định Trưởng Nhóm (Leader)
                </label>
                <Select
                  value={newLeaderId || "UNASSIGNED"}
                  onValueChange={(val) => setNewLeaderId(val === "UNASSIGNED" ? "" : val)}
                >
                  <SelectTrigger className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white cursor-pointer">
                    <SelectValue placeholder="-- Chưa chỉ định leader --" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl max-h-56">
                    <SelectItem value="UNASSIGNED" className="text-xs text-slate-400 cursor-pointer">
                      -- Chưa chỉ định leader --
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
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={createGroupMutation.isPending}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white shadow-md shadow-pink-600/30 cursor-pointer disabled:opacity-60"
                >
                  {createGroupMutation.isPending ? "Đang tạo..." : "Tạo Nhóm"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Group */}
      {isEditOpen && editingGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Pencil className="w-4 h-4 text-pink-500" />
                Chỉnh Sửa Nhóm {editingGroup.name}
              </h3>
              <button
                onClick={() => setIsEditOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Mô Tả Nhóm
                </label>
                <textarea
                  rows={2}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-pink-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Màu Sắc Nhãn Nhóm
                </label>
                <div className="flex items-center gap-2">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setEditColor(c.value)}
                      className={`w-7 h-7 rounded-full ${c.class} transition-transform cursor-pointer ${
                        editColor === c.value
                          ? "ring-2 ring-offset-2 ring-pink-500 scale-110"
                          : "opacity-80 hover:opacity-100"
                      }`}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Chỉ Định Trưởng Nhóm (Leader)
                </label>
                <Select
                  value={editLeaderId || "UNASSIGNED"}
                  onValueChange={(val) => setEditLeaderId(val === "UNASSIGNED" ? "" : val)}
                >
                  <SelectTrigger className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white cursor-pointer">
                    <SelectValue placeholder="-- Chưa chỉ định leader --" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl max-h-56">
                    <SelectItem value="UNASSIGNED" className="text-xs text-slate-400 cursor-pointer">
                      -- Chưa chỉ định leader --
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
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={updateGroupMutation.isPending}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white shadow-md shadow-pink-600/30 cursor-pointer disabled:opacity-60"
                >
                  {updateGroupMutation.isPending ? "Đang lưu..." : "Lưu Thay Đổi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirm Delete Single Group */}
      {isDeleteOpen && groupToDelete && (
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
                  Bạn có chắc muốn xóa nhóm <strong className="text-slate-800 dark:text-slate-200">{groupToDelete.name}</strong>?
                </p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/60 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
              <div><span className="font-semibold">Số thành viên:</span> {groupToDelete.membersCount} nhân sự</div>
              <div><span className="font-semibold">Tài khoản liên đới:</span> {groupToDelete.totalAccounts} accounts</div>
              <p className="text-[11px] text-amber-600 dark:text-amber-400 pt-1">
                ⚠️ Các thành viên trong nhóm này sẽ được chuyển về trạng thái Chưa phân nhóm.
              </p>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteOpen(false);
                  setGroupToDelete(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={deleteGroupMutation.isPending}
                onClick={() => {
                  deleteGroupMutation.mutate({ id: groupToDelete.id });
                }}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deleteGroupMutation.isPending ? "Đang xóa..." : "Xác nhận xóa"}</span>
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
                Chỉ Định Leader Cho {selectedGroupIds.length} Nhóm
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
                  disabled={bulkAssignLeaderMutation.isPending}
                  onClick={() => {
                    bulkAssignLeaderMutation.mutate({
                      groupIds: selectedGroupIds,
                      leaderId: bulkLeaderId || null,
                    });
                  }}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-600/30 cursor-pointer disabled:opacity-60"
                >
                  {bulkAssignLeaderMutation.isPending ? "Đang gán..." : "Áp Dụng Cho Tất Cả"}
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
                Đổi Màu Nhãn Cho {selectedGroupIds.length} Nhóm
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
                      className={`w-8 h-8 rounded-full ${c.class} transition-transform cursor-pointer ${
                        bulkColorVal === c.value
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
                      groupIds: selectedGroupIds,
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
                  Bạn có chắc muốn xóa <strong className="text-rose-500">{selectedGroupIds.length}</strong> nhóm đã chọn?
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
                disabled={bulkDeleteGroupsMutation.isPending}
                onClick={() => {
                  bulkDeleteGroupsMutation.mutate({
                    groupIds: selectedGroupIds,
                  });
                }}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{bulkDeleteGroupsMutation.isPending ? "Đang xóa..." : `Xóa ${selectedGroupIds.length} nhóm`}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
