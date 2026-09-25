"use client";

import { useState, useEffect, useMemo, Fragment, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useUrlParams } from "@/hooks/useUrlState";
import Link from "next/link";
import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Clock,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  FileEdit,
  Play,
  Check,
  SlidersHorizontal,
  X,
  Plus,
  Minus,
  Download,
  Search,
  Filter,
  Calendar as CalendarIcon,
  Video,
  Shield,
  ShieldCheck,
  Eye,
  ExternalLink,
  Zap,
  TrendingUp,
  Award,
  Users,
  Percent,
  MoreVertical,
  MoreHorizontal,
  Ban,
  XCircle,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  subDays,
} from "date-fns";
import confetti from "canvas-confetti";
import * as XLSX from "xlsx";
import TimesheetCalendar from "@/features/checklist/components/TimesheetCalendar";
import TimesheetCharts from "@/features/checklist/components/TimesheetCharts";
import DayDetailModal from "@/features/checklist/components/DayDetailModal";
import VideoCrossCheckModal from "@/features/checklist/components/VideoCrossCheckModal";
import { SyncStatusBadge, getAccountSyncDiagnostic, hasAccountSyncIssue } from "@/components/common/SyncStatusBadge";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { TeamScopeBanner } from "@/components/team/TeamScopeBanner";
import { useDebounce } from "@/hooks/useDebounce";
import { smartSearchMatch } from "@/utils/search";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { TimePickerField } from "@/features/schedule/ScheduleModal";
import { Switch } from "@/components/ui/switch";
import { useConfirmDialog } from "@/components/ui/confirm-modal";

function ChecklistPageContent() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN" || (session?.user as any)?.userType === "ADMIN";
  const isLeadOrAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "LEAD";
  const { confirm, confirmDialog } = useConfirmDialog();

  // SaaS URL Query State Synchronization
  const { searchParams, updateUrlParams } = useUrlParams();

  // Primary View Mode: "table" (Bảng chi tiết) | "calendar" (Lịch chấm công) | "charts" (Biểu đồ & thống kê)
  const initialViewType = (searchParams?.get("view") || "table") as "table" | "calendar" | "charts";
  const [viewType, setViewType] = useState<"table" | "calendar" | "charts">(initialViewType);

  // Mode inside Table View: "daily" (Roll call 1 date) or "range" (Timeline for range)
  const initialMode = searchParams?.get("mode") === "range" ? "range" : "daily";
  const [viewMode, setViewMode] = useState<"daily" | "range">(initialMode);

  // Calendar Month State (Defaults to current month)
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date());

  // Day Inspector Modal State
  const [selectedDateForModal, setSelectedDateForModal] = useState<string | null>(null);

  // Filter States
  const initialUser = searchParams?.get("user") || "ALL";
  const [selectedUserId, setSelectedUserId] = useState<string>(initialUser);

  const initialTeam = searchParams?.get("team") || "ALL";
  const [teamFilter, setTeamFilter] = useState<string>(initialTeam);

  // STAFF users can only see their own data — lock to their session ID
  const resolvedUserId = !isLeadOrAdmin && session?.user?.id
    ? session.user.id
    : selectedUserId;

  const initialDate = searchParams?.get("date") || new Date().toISOString().split("T")[0];
  const [dateStr, setDateStr] = useState<string>(initialDate);

  const initialFrom = searchParams?.get("from") || (() => {
    if (searchParams?.get("preset") === "month") {
      const now = new Date();
      return format(new Date(now.getFullYear(), now.getMonth(), 16), "yyyy-MM-dd");
    }
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  })();
  const [startDateStr, setStartDateStr] = useState<string>(initialFrom);

  const initialTo = searchParams?.get("to") || (() => {
    if (searchParams?.get("preset") === "month") {
      const now = new Date();
      return format(new Date(now.getFullYear(), now.getMonth() + 1, 15), "yyyy-MM-dd");
    }
    return new Date().toISOString().split("T")[0];
  })();
  const [endDateStr, setEndDateStr] = useState<string>(initialTo);

  const initialPreset = searchParams?.get("preset") || "7d";
  const [activeRangePreset, setActiveRangePreset] = useState<string>(initialPreset);

  const initialSearch = searchParams?.get("q") || searchParams?.get("search") || "";
  const [search, setSearch] = useState<string>(initialSearch);
  const debouncedSearch = useDebounce(search, 300);

  const initialScore = (searchParams?.get("score") || "ALL") as "ALL" | "FULL" | "HALF" | "ZERO";
  const [scoreFilter, setScoreFilter] = useState<"ALL" | "FULL" | "HALF" | "ZERO">(initialScore);

  // Date picker popovers
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isRangePickerOpen, setIsRangePickerOpen] = useState(false);
  const [rangeSelection, setRangeSelection] = useState<DateRange | undefined>(() => ({
    from: new Date(startDateStr + "T00:00:00"),
    to: new Date(endDateStr + "T00:00:00"),
  }));

  // Auto sync active state to URL
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    updateUrlParams(
      {
        view: viewType,
        mode: viewType === "table" ? viewMode : undefined,
        date: viewType === "table" && viewMode === "daily" ? dateStr : undefined,
        from: (viewType === "charts" || (viewType === "table" && viewMode === "range")) ? startDateStr : undefined,
        to: (viewType === "charts" || (viewType === "table" && viewMode === "range")) ? endDateStr : undefined,
        preset: (viewType === "charts" || (viewType === "table" && viewMode === "range")) ? activeRangePreset : undefined,
        user: selectedUserId,
        team: teamFilter,
        q: viewType === "table" ? search : undefined,
        score: viewType === "table" ? scoreFilter : undefined,
      },
      {
        view: "table",
        mode: "daily",
        date: today,
        from: undefined,
        to: undefined,
        preset: "7d",
        user: "ALL",
        team: "ALL",
        q: "",
        score: "ALL",
      }
    );
  }, [
    viewType,
    viewMode,
    dateStr,
    startDateStr,
    endDateStr,
    activeRangePreset,
    selectedUserId,
    teamFilter,
    search,
    scoreFilter,
    updateUrlParams,
  ]);

  // Date helpers for Daily Mode
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = format(yesterdayDate, "yyyy-MM-dd");

  const isDailyToday = dateStr === todayStr;
  const isDailyYesterday = dateStr === yesterdayStr;
  const isDailyCustom = !isDailyToday && !isDailyYesterday;

  // Settings Drawer
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
  const [editRules, setEditRules] = useState({
    cutOffHour: 22,
    cutOffMinute: 0,
    fullDayThreshold: 85,
    halfDayThreshold: 50,
    requireDataSync: true,
    excludeBannedAccounts: true,
  });

  // Expanded Staff Accordion Rows (Set of checklist IDs or row keys)
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());
  const [optimisticToggles, setOptimisticToggles] = useState<Record<string, { isPosted?: boolean; isSynced?: boolean }>>({});

  // Action status / toast banner
  const [actionMsg, setActionMsg] = useState<{ text: string; type: "success" | "info" | "error" } | null>(null);
  const [scanning, setScanning] = useState(false);

  // Note Modal State
  const [noteModalItem, setNoteModalItem] = useState<{
    id: string;
    accountUsername: string;
    country?: string;
    notes: string;
    dateFormatted: string;
    staffName: string;
    canEdit: boolean;
  } | null>(null);
  const [noteInputText, setNoteInputText] = useState<string>("");

  // Video Cross-Check Modal State
  const [crossCheckItem, setCrossCheckItem] = useState<{
    username: string;
    accountId: string;
    dateStr: string;
    staffName: string;
    itemId: string;
  } | null>(null);

  const utils = trpc.useUtils();

  const showToast = (text: string, type: "success" | "info" | "error" = "success") => {
    setActionMsg({ text, type });
    setTimeout(() => setActionMsg(null), 4500);
  };

  // Fetch Staff List for filter dropdown
  const { data: staffList = [] } = trpc.user.listStaff.useQuery();
  const { data: teamsData } = trpc.admin.listTeams.useQuery(undefined, { enabled: isLeadOrAdmin });
  const allTeams = teamsData?.teamsDetails || [];

  const filteredStaffList = useMemo(() => {
    if (teamFilter === "ALL") return staffList;
    return staffList.filter((s: any) => s.teamId === teamFilter);
  }, [staffList, teamFilter]);

  const handleTeamChange = (newTeam: string) => {
    setTeamFilter(newTeam);
    if (newTeam !== "ALL" && selectedUserId !== "ALL") {
      const match = staffList.some((s: any) => s.id === selectedUserId && s.teamId === newTeam);
      if (!match) {
        setSelectedUserId("ALL");
      }
    }
  };

  // Calculate Date Intervals depending on active View
  const calStartStr = format(startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const calCycleEnd = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 15);
  const calEndGrid = endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 1 });
  const calEffectiveEnd = calCycleEnd > calEndGrid ? calCycleEnd : calEndGrid;
  const calEndStr = format(calEffectiveEnd, "yyyy-MM-dd");

  const queryStartDate =
    viewType === "calendar"
      ? calStartStr
      : viewType === "charts" || viewMode === "range"
        ? startDateStr
        : undefined;

  const queryEndDate =
    viewType === "calendar"
      ? calEndStr
      : viewType === "charts" || viewMode === "range"
        ? endDateStr
        : undefined;

  const queryDate =
    viewType === "table" && viewMode === "daily" ? dateStr : undefined;

  // Query Timesheet / Checklist Data
  const { data: timesheetData, isLoading: loading, refetch } = trpc.checklist.getByDate.useQuery({
    date: queryDate,
    startDate: queryStartDate,
    endDate: queryEndDate,
    userId: selectedUserId === "ALL" ? undefined : selectedUserId,
    teamId: teamFilter === "ALL" ? undefined : teamFilter,
    search: viewType === "table" && debouncedSearch ? debouncedSearch : undefined,
    scoreFilter: viewType === "table" && scoreFilter !== "ALL" ? scoreFilter : undefined,
  });

  const filteredChecklists = useMemo(() => {
    const list = timesheetData?.checklists || [];
    if (!search.trim()) return list;
    return list.filter((chk: any) =>
      smartSearchMatch(
        search,
        chk.user?.fullName,
        chk.user?.name,
        chk.user?.username,
        chk.user?.email,
        chk.user?.role,
        ...(chk.items || []).flatMap((item: any) => [
          item.account?.username,
          item.account?.gpmProfileName,
          item.account?.groupName,
          item.account?.country,
          item.account?.status,
        ])
      )
    );
  }, [timesheetData?.checklists, search]);

  // Listen to auto-refresh event
  useEffect(() => {
    const handleRefresh = () => {
      utils.checklist.getByDate.invalidate();
    };
    window.addEventListener("refreshData", handleRefresh);
    return () => window.removeEventListener("refreshData", handleRefresh);
  }, [utils]);

  // Sync editRules when scoringConfig is loaded from database
  useEffect(() => {
    if (timesheetData?.scoringConfig) {
      setEditRules({
        cutOffHour: timesheetData.scoringConfig.cutOffHour ?? 22,
        cutOffMinute: timesheetData.scoringConfig.cutOffMinute ?? 0,
        fullDayThreshold: timesheetData.scoringConfig.fullDayThreshold ?? 85,
        halfDayThreshold: timesheetData.scoringConfig.halfDayThreshold ?? 50,
        requireDataSync: timesheetData.scoringConfig.requireDataSync ?? true,
        excludeBannedAccounts: timesheetData.scoringConfig.excludeBannedAccounts ?? true,
      });
    }
  }, [timesheetData?.scoringConfig]);

  // Lock body scroll when settings drawer is open
  useEffect(() => {
    if (isSettingsDrawerOpen) {
      document.body.style.overflow = "hidden";
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") setIsSettingsDrawerOpen(false);
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKeyDown);
      };
    } else {
      document.body.style.overflow = "";
    }
  }, [isSettingsDrawerOpen]);

  // Mutations
  const toggleItemMutation = trpc.checklist.toggleItem.useMutation({
    onSuccess: () => {
      utils.checklist.getByDate.invalidate();
    },
    onError: (err) => showToast(err.message || "Lỗi cập nhật trạng thái", "error"),
  });

  const saveRulesMutation = trpc.checklist.saveRules.useMutation({
    onSuccess: () => {
      showToast("✅ Đã lưu cấu hình quy tắc chấm công vào cơ sở dữ liệu thành công!", "success");
      setIsSettingsDrawerOpen(false);
      utils.checklist.getByDate.invalidate();
      utils.settings.getAll.invalidate();
    },
    onError: (err) => {
      showToast(err.message || "Lỗi khi lưu cấu hình quy tắc", "error");
    },
  });

  const massCompleteMutation = trpc.checklist.massCompleteAll.useMutation({
    onSuccess: (res: any) => {
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
      showToast("🎉 Đã chấm hoàn thành Đạt 100% (1.0 Công) cho toàn bộ nhân sự!", "success");
      utils.checklist.getByDate.invalidate();
    },
    onError: (err) => showToast(err.message || "Lỗi chấm công hàng loạt", "error"),
  });

  const autoScanMutation = trpc.checklist.autoScanAndCheck.useMutation({
    onSuccess: (res) => {
      setScanning(false);
      showToast(
        `⚡ Đã tự động quét ${res.totalStaffScanned} nhân sự (${res.totalAccountsScanned} accounts)! Phát hiện ${res.postedCount} video mới và đồng bộ ${res.syncedCount} profile.`,
        "success"
      );
      utils.checklist.getByDate.invalidate();
    },
    onError: (err) => {
      setScanning(false);
      showToast(err.message || "Lỗi khi tự động quét", "error");
    },
  });

  const startGpmMutation = trpc.gpm.startProfile.useMutation({
    onSuccess: () => showToast("Đã mở trình duyệt GPMLogin!", "success"),
    onError: (err) => showToast(err.message || "Lỗi mở GPM Profile", "error"),
  });

  const syncAccountMutation = trpc.accounts.syncAccount.useMutation({
    onSuccess: (data) => {
      showToast(`Đã đồng bộ Live tài khoản @${data.account.username}!`, "success");
      utils.checklist.getByDate.invalidate();
    },
    onError: (err) => showToast(err.message || "Lỗi đồng bộ tài khoản", "error"),
  });

  const updateNotesMutation = trpc.checklist.updateNotes.useMutation({
    onSuccess: () => {
      utils.checklist.getByDate.invalidate();
    },
  });

  // Handlers
  const handleToggleRowExpand = (id: string) => {
    const next = new Set(expandedRowIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedRowIds(next);
  };

  const handleExpandAll = (expand: boolean) => {
    if (!timesheetData?.checklists) return;
    if (expand) {
      setExpandedRowIds(new Set(timesheetData.checklists.map((c: any) => c.id)));
    } else {
      setExpandedRowIds(new Set());
    }
  };

  const handleAutoScanAll = () => {
    setScanning(true);
    showToast("⏳ Đang tiến hành quét tự động toàn bộ nhân sự & tài khoản TikTok...", "info");
    autoScanMutation.mutate({
      date: viewMode === "daily" ? dateStr : undefined,
      userId: selectedUserId === "ALL" ? undefined : selectedUserId,
    });
  };

  const handleMassCompleteAll = async () => {
    const ok = await confirm({
      title: "Chấm hoàn thành hàng loạt",
      description: "Xác nhận chấm 100% hoàn thành (1.0 Ngày công) cho tất cả nhân sự đang hiển thị?",
      confirmLabel: "Xác nhận chấm công",
      variant: "amber",
      icon: "check",
    });
    if (ok) {
      massCompleteMutation.mutate({
        date: viewMode === "daily" ? dateStr : undefined,
      });
    }
  };

  const handleAdminCheckComplete = async (checklistId: string, fullName: string) => {
    if (!isLeadOrAdmin) {
      showToast("Chỉ Quản trị viên (Admin) hoặc Trưởng nhóm (Lead) mới có quyền duyệt hoàn thành công thủ công", "error");
      return;
    }
    const ok = await confirm({
      title: "Duyệt hoàn thành",
      description: `Xác nhận duyệt hoàn thành 100% (1.0 Ngày công) cho nhân sự ${fullName}?`,
      confirmLabel: "Xác nhận duyệt",
      variant: "amber",
      icon: "check",
    });
    if (ok) {
      massCompleteMutation.mutate(
        { checklistId },
        {
          onSuccess: () => {
            showToast(`✅ Đã duyệt hoàn thành 1.0 công cho ${fullName}!`, "success");
            confetti({ particleCount: 60, spread: 60, origin: { y: 0.7 } });
          },
          onError: (err) => showToast(err.message || "Lỗi khi duyệt hoàn thành", "error"),
        }
      );
    }
  };

  const handleAdminCheckHalfDay = async (checklistId: string, fullName: string) => {
    if (!isLeadOrAdmin) {
      showToast("Chỉ Quản trị viên (Admin) hoặc Trưởng nhóm (Lead) mới có quyền duyệt hoàn thành công thủ công", "error");
      return;
    }
    const ok = await confirm({
      title: "Duyệt nửa công",
      description: `Xác nhận duyệt hoàn thành 50% (0.5 Ngày công) cho nhân sự ${fullName}?`,
      confirmLabel: "Xác nhận duyệt",
      variant: "amber",
      icon: "check",
    });
    if (ok) {
      massCompleteMutation.mutate(
        { checklistId, scoreOverride: 0.5 },
        {
          onSuccess: () =>
            showToast(`✅ Đã duyệt hoàn thành 0.5 công cho ${fullName}!`, "success"),
          onError: (err) => showToast(err.message || "Lỗi khi duyệt hoàn thành", "error"),
        }
      );
    }
  };

  const handleAdminCheckZero = async (checklistId: string, fullName: string) => {
    if (!isLeadOrAdmin) {
      showToast("Chỉ Quản trị viên (Admin) hoặc Trưởng nhóm (Lead) mới có quyền duyệt hoàn thành công thủ công", "error");
      return;
    }
    const ok = await confirm({
      title: "Duyệt không hoàn thành",
      description: `Xác nhận duyệt không hoàn thành (0 Ngày công) cho nhân sự ${fullName}?`,
      confirmLabel: "Xác nhận duyệt",
      variant: "amber",
      icon: "check",
    });
    if (ok) {
      massCompleteMutation.mutate(
        { checklistId, scoreOverride: 0 },
        {
          onSuccess: () =>
            showToast(`✅ Đã duyệt không hoàn thành (0 công) cho ${fullName}!`, "success"),
          onError: (err) => showToast(err.message || "Lỗi khi duyệt hoàn thành", "error"),
        }
      );
    }
  };

  const handleSaveNoteModal = () => {
    if (!noteModalItem) return;
    updateNotesMutation.mutate(
      {
        itemId: noteModalItem.id,
        notes: noteInputText.trim() || null,
      },
      {
        onSuccess: () => {
          showToast("✅ Đã cập nhật ghi chú vận hành thành công!", "success");
          setNoteModalItem(null);
        },
        onError: (err) => showToast(err.message || "Lỗi khi lưu ghi chú", "error"),
      }
    );
  };

  const handleToggleItemField = (item: any, field: "isPosted" | "isSynced" | "isCompleted") => {
    if (!isLeadOrAdmin) {
      showToast("Chỉ Quản trị viên (Admin) hoặc Trưởng nhóm (Lead) mới có quyền chỉnh sửa trạng thái kiểm tra", "error");
      return;
    }
    const currentOpt = optimisticToggles[item.id]?.[field as "isPosted" | "isSynced"];
    const currentValue = currentOpt !== undefined ? currentOpt : item[field];
    const nextValue = !currentValue;

    // Optimistically update UI immediately
    setOptimisticToggles((prev) => ({
      ...prev,
      [item.id]: {
        ...prev[item.id],
        [field]: nextValue,
      },
    }));

    toggleItemMutation.mutate(
      {
        itemId: item.id,
        field,
        value: nextValue,
      },
      {
        onError: (err) => {
          // Revert optimistic update on error
          setOptimisticToggles((prev) => ({
            ...prev,
            [item.id]: {
              ...prev[item.id],
              [field]: currentValue,
            },
          }));
          showToast(err.message || "Lỗi cập nhật trạng thái", "error");
        },
      }
    );
  };

  const handleExportExcel = () => {
    if (!timesheetData?.checklists || timesheetData.checklists.length === 0) {
      showToast("Không có dữ liệu để xuất Excel", "error");
      return;
    }

    const rows: any[] = [];
    for (const c of timesheetData.checklists) {
      const dateFormatted = format(new Date(c.date), "dd/MM/yyyy");
      const scoreLabel = Number(c.workdayScore) >= 1 ? "1.0 Công (Đạt)" : Number(c.workdayScore) === 0.5 ? "0.5 Công (Nửa công)" : "0 Công (Không đạt)";

      if (c.items.length === 0) {
        rows.push({
          "Ngày Chấm": dateFormatted,
          "Họ & Tên": c.user.fullName,
          "Username": `@${c.user.username}`,
          "Vai Trò": c.user.role,
          "Tài Khoản TikTok": "Chưa gán tài khoản",
          "Quốc Gia": "—",
          "Đã Đăng Video": "—",
          "Đã Sync GPM": "—",
          "Đạt KPI Acc": "—",
          "Tỷ Lệ Hoàn Thành (%)": `${c.completionRate}%`,
          "Điểm Ngày Công": scoreLabel,
          "Ghi Chú Vận Hành": "—",
        });
      } else {
        for (const it of c.items) {
          rows.push({
            "Ngày Chấm": dateFormatted,
            "Họ & Tên": c.user.fullName,
            "Username": `@${c.user.username}`,
            "Vai Trò": c.user.role,
            "Tài Khoản TikTok": `@${it.account.username}`,
            "Quốc Gia": it.account.country || "US",
            "Đã Đăng Video": it.isPosted ? "ĐÃ ĐĂNG" : "CHƯA ĐĂNG",
            "Đã Sync GPM": it.isSynced ? "ĐÃ SYNC" : "CHƯA SYNC",
            "Đạt KPI Acc": it.isCompleted || (it.isPosted && it.isSynced) ? "ĐẠT" : "CHƯA ĐẠT",
            "Tỷ Lệ Hoàn Thành (%)": `${c.completionRate}%`,
            "Điểm Ngày Công": scoreLabel,
            "Ghi Chú Vận Hành": it.notes || "—",
          });
        }
      }
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bang_Cham_Cong");
    const fileName = `Bang_Cham_Cong_${viewMode === "daily" ? dateStr : `${startDateStr}_den_${endDateStr}`}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast(`✅ Đã xuất thành công file ${fileName}!`, "success");
  };

  // Quick Presets helper for Range Mode
  const applyRangePreset = (days: number, key: string) => {
    setActiveRangePreset(key);
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setStartDateStr(format(start, "yyyy-MM-dd"));
    setEndDateStr(format(end, "yyyy-MM-dd"));
    setRangeSelection({ from: start, to: end });
  };

  const applyThisMonth = () => {
    setActiveRangePreset("month");
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 16);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 15);
    setStartDateStr(format(start, "yyyy-MM-dd"));
    setEndDateStr(format(end, "yyyy-MM-dd"));
    setRangeSelection({ from: start, to: end });
  };

  // Country badge helper
  const getCountryBadge = (country?: string) => {
    const code = (country || "US").toUpperCase();
    switch (code) {
      case "US":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <span>🇺🇸</span> US
          </span>
        );
      case "UK":
      case "GB":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            <span>🇬🇧</span> UK
          </span>
        );
      case "VN":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-800">
            <span>🇻🇳</span> VN
          </span>
        );
      case "DE":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <span>🇩🇪</span> DE
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {code}
          </span>
        );
    }
  };

  const getWorkdayBadge = (scoreNum: number, rateNum?: number) => {
    if (scoreNum >= 1.0) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1.5 px-3 h-7.5 rounded-xl text-xs font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-2xs cursor-default">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>1.0 Công</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs font-semibold">
            Đạt chỉ tiêu KPI
          </TooltipContent>
        </Tooltip>
      );
    }
    if (scoreNum === 0.5) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1.5 px-3 h-7.5 rounded-xl text-xs font-black bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 shadow-2xs cursor-default">
              <Clock className="w-3.5 h-3.5" />
              <span>0.5 Công</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs font-semibold">
            Nửa ngày công
          </TooltipContent>
        </Tooltip>
      );
    }
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1.5 px-3 h-7.5 rounded-xl text-xs font-black bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 shadow-2xs cursor-default">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>0 Công</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs font-semibold">
          Không đạt
        </TooltipContent>
      </Tooltip>
    );
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "ADMIN":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-xl text-xs font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 shadow-2xs whitespace-nowrap">
            <Shield className="w-3.5 h-3.5 shrink-0" /> Quản trị viên
          </span>
        );
      case "LEAD":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-xl text-xs font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 shadow-2xs whitespace-nowrap">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" /> Trưởng nhóm
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-xl text-xs font-bold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20 shadow-2xs whitespace-nowrap">
            <UserCheck className="w-3.5 h-3.5 shrink-0" /> Nhân viên
          </span>
        );
    }
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

  const renderTeamSelector = (widthClass = "w-full sm:w-44 md:w-48") => {
    if (!isLeadOrAdmin || allTeams.length === 0) return null;
    return (
      <div className={cn("relative", widthClass)}>
        <Select
          value={teamFilter}
          onValueChange={handleTeamChange}
        >
          <SelectTrigger
            className={`w-full h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 cursor-pointer [&>span]:truncate whitespace-nowrap transition-colors ${teamFilter !== "ALL"
              ? "pr-8 border-pink-200 dark:border-pink-900/60 bg-pink-50/40 dark:bg-pink-950/25 text-pink-700 dark:text-pink-300 [&_svg]:hidden font-medium"
              : ""
              }`}
          >
            <SelectValue placeholder="Tất cả đội nhóm" />
          </SelectTrigger>
          <SelectContent className="rounded-2xl max-h-72">
            <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">
              Tất cả đội nhóm ({allTeams.length} nhóm)
            </SelectItem>
            {allTeams.map((t: any) => (
              <SelectItem key={t.id} value={t.id} className="text-xs font-normal cursor-pointer">
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {teamFilter !== "ALL" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handleTeamChange("ALL");
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200/90 hover:bg-rose-500 hover:text-white dark:bg-slate-800 dark:hover:bg-rose-500 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all z-10 cursor-pointer shadow-2xs hover:scale-110"
                aria-label="Xóa chọn đội nhóm"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Xóa chọn đội nhóm</TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  };

  const renderStaffSelector = (widthClass = "w-full sm:w-44 md:w-48") => {
    if (!isLeadOrAdmin) return null;
    return (
      <div className={cn("relative", widthClass)}>
        <Select
          value={selectedUserId}
          onValueChange={(val) => setSelectedUserId(val)}
        >
          <SelectTrigger
            className={`w-full h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 cursor-pointer [&>span]:truncate whitespace-nowrap transition-colors ${selectedUserId !== "ALL"
              ? "pr-8 border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/25 text-emerald-700 dark:text-emerald-300 [&_svg]:hidden"
              : ""
              }`}
          >
            <SelectValue placeholder="Tất cả thành viên" />
          </SelectTrigger>
          <SelectContent className="rounded-2xl max-h-72">
            <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">
              Tất cả thành viên ({filteredStaffList.length})
            </SelectItem>
            {filteredStaffList.map((s: any) => (
              <SelectItem key={s.id} value={s.id} className="text-xs font-normal cursor-pointer">
                <div className="flex items-center gap-2">
                  {renderUserAvatar(s, "w-4 h-4 text-[8px]")}
                  <span className="truncate">{s.fullName || s.name || s.username}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedUserId !== "ALL" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setSelectedUserId("ALL");
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
    );
  };

  const summary = timesheetData?.summary || {
    totalRecords: 0,
    totalStaff: 0,
    fullWorkdayCount: 0,
    halfWorkdayCount: 0,
    zeroWorkdayCount: 0,
    avgCompletionRate: 0,
    totalAssignedAccounts: 0,
    totalVideosPosted: 0,
    totalSynced: 0,
  };

  // When in Calendar view, compute cycle stats for 16th of calendarMonth to 15th of next month
  const calendarCycleSummary = useMemo(() => {
    if (viewType !== "calendar") return null;
    const cycleStart = format(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 16), "yyyy-MM-dd");
    const cycleEnd = format(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 15), "yyyy-MM-dd");
    const items = (timesheetData?.checklists || []).filter((c: any) => {
      const d = format(new Date(c.date), "yyyy-MM-dd");
      return d >= cycleStart && d <= cycleEnd;
    });
    return {
      totalStaff: new Set(items.map((c: any) => c.userId)).size,
      fullWorkdayCount: items.filter((c: any) => Number(c.workdayScore) >= 1.0).length,
      halfWorkdayCount: items.filter((c: any) => Number(c.workdayScore) === 0.5).length,
      zeroWorkdayCount: items.filter((c: any) => Number(c.workdayScore) === 0).length,
    };
  }, [viewType, calendarMonth, timesheetData?.checklists]);

  const displaySummary = useMemo(() => {
    if (viewType === "calendar" && calendarCycleSummary) {
      return { ...summary, ...calendarCycleSummary };
    }
    return summary;
  }, [viewType, calendarCycleSummary, summary]);

  const isMonthCycleMode =
    viewType === "calendar" ||
    ((viewType === "charts" || (viewType === "table" && viewMode === "range")) && activeRangePreset === "month");

  const cycleRangeLabel = useMemo(() => {
    if (viewType === "calendar") {
      const s = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 16);
      const e = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 15);
      return `${format(s, "dd/MM")} - ${format(e, "dd/MM")}`;
    }
    if (startDateStr && endDateStr) {
      try {
        const s = new Date(startDateStr + "T00:00:00");
        const e = new Date(endDateStr + "T00:00:00");
        return `${format(s, "dd/MM")} - ${format(e, "dd/MM")}`;
      } catch {
        /* fallback */
      }
    }
    const now = new Date();
    const s = new Date(now.getFullYear(), now.getMonth(), 16);
    const e = new Date(now.getFullYear(), now.getMonth() + 1, 15);
    return `${format(s, "dd/MM")} - ${format(e, "dd/MM")}`;
  }, [viewType, calendarMonth, startDateStr, endDateStr]);

  const currentRangeLabel = useMemo(() => {
    if (viewType === "calendar" || activeRangePreset === "month") {
      return cycleRangeLabel;
    }
    if (viewType === "table" && viewMode === "daily") {
      try {
        return format(new Date(dateStr + "T00:00:00"), "dd/MM/yyyy");
      } catch {
        return dateStr;
      }
    }
    if (startDateStr && endDateStr) {
      try {
        const s = new Date(startDateStr + "T00:00:00");
        const e = new Date(endDateStr + "T00:00:00");
        return `${format(s, "dd/MM")} - ${format(e, "dd/MM")}`;
      } catch {
        return `${startDateStr} - ${endDateStr}`;
      }
    }
    return cycleRangeLabel;
  }, [viewType, viewMode, activeRangePreset, dateStr, startDateStr, endDateStr, cycleRangeLabel]);

  const cutoffInfo = timesheetData?.cutoffInfo;

  const activeRules = timesheetData?.scoringConfig || {
    cutOffHour: 22,
    cutOffMinute: 0,
    fullDayThreshold: 85,
    halfDayThreshold: 50,
    requireDataSync: true,
  };
  const activeCutoffStr = `${String(activeRules.cutOffHour).padStart(2, "0")}:${String(activeRules.cutOffMinute).padStart(2, "0")}`;

  // Client-side live countdown ticker for Cutoff Time (Asia/Ho_Chi_Minh)
  const [liveCutoff, setLiveCutoff] = useState({
    remaining: "--:--:--",
    remainingNext: "--:--:--",
    isPast: false,
    mounted: false,
  });

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const vnString = now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" });
      const vnDate = new Date(vnString);

      const cutoffToday = new Date(vnDate);
      cutoffToday.setHours(activeRules.cutOffHour, activeRules.cutOffMinute, 0, 0);

      const isPast = vnDate.getTime() >= cutoffToday.getTime();

      const diffMs = Math.max(0, cutoffToday.getTime() - vnDate.getTime());
      const h = Math.floor(diffMs / (1000 * 60 * 60));
      const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diffMs % (1000 * 60)) / 1000);
      const remaining = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

      const cutoffTomorrow = new Date(cutoffToday);
      cutoffTomorrow.setDate(cutoffTomorrow.getDate() + 1);
      const diffNextMs = Math.max(0, cutoffTomorrow.getTime() - vnDate.getTime());
      const nh = Math.floor(diffNextMs / (1000 * 60 * 60));
      const nm = Math.floor((diffNextMs % (1000 * 60 * 60)) / (1000 * 60));
      const ns = Math.floor((diffNextMs % (1000 * 60)) / 1000);
      const remainingNext = `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}:${String(ns).padStart(2, "0")}`;

      setLiveCutoff({
        remaining,
        remainingNext,
        isPast,
        mounted: true,
      });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [activeRules.cutOffHour, activeRules.cutOffMinute]);

  return (
    <div className="space-y-6 w-full pb-24 animate-fadeIn">
      {/* Top Header Section */}
      <div className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5 min-w-0">
              <CheckSquare className="w-6 h-6 text-emerald-500 shrink-0" />
              <span className="truncate">Bảng Chấm Công & KPI Vận Hành</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
              Theo dõi chấm công hàng ngày, tỷ lệ hoàn thành KPI, tự động chốt công và quản lý lịch sử vận hành.
            </p>
          </div>

          {/* Action Buttons Group */}
          <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-auto">
            {/* Auto-Scan Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleAutoScanAll}
                  disabled={scanning}
                  className="h-10 inline-flex items-center gap-2 px-4 rounded-xl text-xs font-black bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-lg shadow-pink-600/25 active:scale-95 transition-all cursor-pointer disabled:opacity-70 whitespace-nowrap shrink-0"
                >
                  <Zap className={`w-4 h-4 shrink-0 ${scanning ? "animate-spin" : ""}`} />
                  <span className="truncate">{scanning ? "Đang Quét Toàn Dàn..." : "Tự Động Chấm Công"}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-semibold">
                Tự động kết nối và ghi nhận chấm công toàn bộ dàn tài khoản
              </TooltipContent>
            </Tooltip>

            {/* Export Excel Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleExportExcel}
                  className="h-10 inline-flex items-center gap-1.5 px-3.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-xs cursor-pointer active:scale-95 whitespace-nowrap shrink-0"
                >
                  <Download className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="truncate">Xuất Excel (.xlsx)</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-semibold">
                Tải file Excel danh sách bảng chấm công và KPI ngày hiện tại
              </TooltipContent>
            </Tooltip>

            {/* Config Rules Button */}
            {isAdmin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setIsSettingsDrawerOpen(true)}
                    className="h-10 inline-flex items-center gap-1.5 px-3.5 rounded-xl text-xs font-bold bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 transition-all shadow-xs cursor-pointer active:scale-95 whitespace-nowrap shrink-0"
                  >
                    <SlidersHorizontal className="w-4 h-4 shrink-0" />
                    <span className="truncate">Cấu Hình Quy Tắc</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs font-semibold">
                  Cấu hình giờ chốt công và điều kiện hoàn thành checklist
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Toast / Notification Banner */}
        {actionMsg && (
          <div
            className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between shadow-sm animate-in fade-in ${actionMsg.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
              : actionMsg.type === "error"
                ? "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
                : "bg-cyan-50 text-cyan-800 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800"
              }`}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 shrink-0 text-pink-500" />
              <span>{actionMsg.text}</span>
            </div>
            <button onClick={() => setActionMsg(null)} className="p-1 hover:opacity-75 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Cutoff Countdown & Auto-Scan Status Banner */}
        <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-xs">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            {/* Left Side: Cutoff Status & Rules */}
            <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0 border border-slate-200/60 dark:border-slate-700/60 shadow-xs">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white tracking-tight">
                    Mốc Chốt Công Tự Động: {activeCutoffStr} {activeRules.cutOffHour >= 12 ? "Tối" : "Sáng"} (Giờ VN)
                  </span>
                  {liveCutoff.isPast ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      Đã chốt hôm nay ({activeCutoffStr}) • Chốt tiếp: <span className="font-mono">{liveCutoff.mounted ? liveCutoff.remainingNext : "--:--:--"}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 animate-pulse" />
                      Đang chờ chốt (Còn: <span className="font-mono">{liveCutoff.mounted ? liveCutoff.remaining : "--:--:--"}</span>)
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-[560px] leading-relaxed">
                  Đúng {activeCutoffStr} mỗi ngày, hệ thống tự động quét Live toàn bộ dàn kênh. Nhân sự hoàn thành <strong>&ge;{activeRules.fullDayThreshold}%</strong> hưởng 1.0 công, <strong>{activeRules.halfDayThreshold}% - {activeRules.fullDayThreshold}%</strong> hưởng 0.5 công.
                </p>
              </div>
            </div>

            {/* Right Side: Cohesive Segmented KPI Stat Bar */}
            <div className="w-full xl:w-auto flex flex-col items-end gap-2.5 shrink-0">
              <div className="w-full xl:w-auto grid grid-cols-2 sm:grid-cols-4 xl:flex xl:items-center bg-slate-50 dark:bg-slate-950 p-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 gap-1.5">
                <div className="px-2.5 py-1.5 text-center bg-white dark:bg-slate-900/60 rounded-xl border border-slate-200/60 dark:border-slate-800/60 shadow-2xs">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Tổng Nhân Sự</div>
                  {loading ? (
                    <div className="w-10 h-4 mx-auto rounded bg-slate-200 dark:bg-slate-800 animate-pulse mt-1" />
                  ) : (
                    <div className="text-xs sm:text-sm font-black text-slate-900 dark:text-white mt-0.5">{displaySummary.totalStaff} NV</div>
                  )}
                </div>
                <div className="px-2.5 py-1.5 text-center bg-white dark:bg-slate-900/60 rounded-xl border border-slate-200/60 dark:border-slate-800/60 shadow-2xs">
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    1.0 Công
                  </div>
                  {loading ? (
                    <div className="w-8 h-4 mx-auto rounded bg-slate-200 dark:bg-slate-800 animate-pulse mt-1" />
                  ) : (
                    <div className="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{displaySummary.fullWorkdayCount}</div>
                  )}
                </div>
                <div className="px-2.5 py-1.5 text-center bg-white dark:bg-slate-900/60 rounded-xl border border-slate-200/60 dark:border-slate-800/60 shadow-2xs">
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    0.5 Công
                  </div>
                  {loading ? (
                    <div className="w-8 h-4 mx-auto rounded bg-slate-200 dark:bg-slate-800 animate-pulse mt-1" />
                  ) : (
                    <div className="text-xs sm:text-sm font-black text-amber-600 dark:text-amber-400 mt-0.5">{displaySummary.halfWorkdayCount}</div>
                  )}
                </div>
                <div className="px-2.5 py-1.5 text-center bg-white dark:bg-slate-900/60 rounded-xl border border-slate-200/60 dark:border-slate-800/60 shadow-2xs">
                  <div className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center justify-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                    0 Công
                  </div>
                  {loading ? (
                    <div className="w-8 h-4 mx-auto rounded bg-slate-200 dark:bg-slate-800 animate-pulse mt-1" />
                  ) : (
                    <div className="text-xs sm:text-sm font-black text-rose-600 dark:text-rose-400 mt-0.5">{displaySummary.zeroWorkdayCount}</div>
                  )}
                </div>
              </div>
              {/* Aligned cycle text + badge spanning full card width */}
              <div className="flex items-center gap-1.5 self-center xl:self-end">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {isMonthCycleMode ? "Chu kỳ tính công:" : "Thời gian thống kê:"}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-pink-50 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800/80 cursor-help shadow-2xs">
                      <CalendarIcon className="w-3 h-3 text-pink-500 shrink-0" />
                      <span>{isMonthCycleMode ? `Kỳ: ${cycleRangeLabel}` : currentRangeLabel}</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs font-semibold z-50">
                    {isMonthCycleMode
                      ? `Tính từ 16 tháng trước - 15 tháng này (${cycleRangeLabel})`
                      : `Dữ liệu tính từ ${currentRangeLabel}`}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>

        {/* Filter & Toolbar Box */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-3.5 sm:p-4 shadow-sm space-y-3.5">
          {/* Row 1: Primary View Switcher (Table | Calendar | Charts) & Time Presets */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* Left: View Type Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setViewType("table")}
                className={`h-8 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${viewType === "table"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
              >
                <CheckSquare className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>Bảng Dữ Liệu</span>
              </button>

              <button
                type="button"
                onClick={() => setViewType("calendar")}
                className={`h-8 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${viewType === "calendar"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
              >
                <CalendarIcon className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                <span>Lịch Chấm Công</span>
              </button>

              <button
                type="button"
                onClick={() => setViewType("charts")}
                className={`h-8 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${viewType === "charts"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
              >
                <TrendingUp className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                <span>Biểu Đồ & Thống Kê</span>
              </button>
            </div>

            {/* Center: In Table View Sub-mode Toggle (Daily vs Range) */}
            {viewType === "table" && (
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode("daily")}
                  className={`h-8 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${viewMode === "daily"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                >
                  <span className="shrink-0 text-xs">📅</span>
                  <span>Theo ngày</span>
                  <span className="hidden xl:inline text-slate-400 font-normal">(Roll Call)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("range")}
                  className={`h-8 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${viewMode === "range"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                >
                  <span className="shrink-0 text-xs">📈</span>
                  <span>Khoảng ngày</span>
                  <span className="hidden xl:inline text-slate-400 font-normal">(Timesheet)</span>
                </button>
              </div>
            )}

            {/* Right side: View-specific controls */}
            {viewType === "calendar" ? (
              isLeadOrAdmin ? (
                <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 flex-wrap">
                  {renderTeamSelector("w-full sm:w-44 md:w-48")}
                  {renderStaffSelector("w-full sm:w-44 md:w-48")}
                </div>
              ) : null
            ) : viewType === "charts" || (viewType === "table" && viewMode === "range") ? (
              /* Charts or Table Range: Range presets */
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 shrink-0">
                {[
                  { id: "7d", label: "7 Ngày", action: () => applyRangePreset(7, "7d") },
                  { id: "28d", label: "28 Ngày", action: () => applyRangePreset(28, "28d") },
                  { id: "month", label: "Tháng Này", action: applyThisMonth },
                  { id: "60d", label: "60 Ngày", action: () => applyRangePreset(60, "60d") },
                  { id: "365d", label: "365 Ngày", action: () => applyRangePreset(365, "365d") },
                ].map((p) => {
                  const isActive = activeRangePreset === p.id;
                  const buttonElement = (
                    <button
                      key={p.id}
                      type="button"
                      onClick={p.action}
                      className={`h-8 px-2.5 sm:px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${isActive
                        ? "bg-amber-500 text-slate-950 shadow-xs font-bold"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                    >
                      {p.label}
                    </button>
                  );
                  if (p.id === "month") {
                    return (
                      <Tooltip key={p.id}>
                        <TooltipTrigger asChild>{buttonElement}</TooltipTrigger>
                        <TooltipContent side="top" className="text-xs font-semibold z-50">
                          Tính từ 16 - 15 tháng sau ({cycleRangeLabel})
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return buttonElement;
                })}

                {/* Custom Range Popover Tab Button */}
                <Popover
                  open={isRangePickerOpen}
                  onOpenChange={(open) => {
                    if (open) {
                      setRangeSelection({
                        from: new Date(startDateStr + "T00:00:00"),
                        to: new Date(endDateStr + "T00:00:00"),
                      });
                    }
                    setIsRangePickerOpen(open);
                  }}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={`h-8 px-2.5 sm:px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${activeRangePreset === "custom"
                        ? "bg-amber-500 text-slate-950 shadow-xs font-bold"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                    >
                      <CalendarIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {activeRangePreset === "custom"
                          ? `${format(new Date(startDateStr + "T00:00:00"), "dd/MM")} - ${format(new Date(endDateStr + "T00:00:00"), "dd/MM/yy")}`
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
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          Chọn khoảng ngày chấm công
                        </span>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Trong vòng 365 ngày gần nhất
                        </p>
                      </div>
                      {rangeSelection?.from && (
                        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800 whitespace-nowrap shrink-0">
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
                        disabled={(date) =>
                          date < subDays(new Date(), 365) || date > new Date()
                        }
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
                            setStartDateStr(s);
                            setEndDateStr(e);
                            setActiveRangePreset("custom");
                          }
                          setIsRangePickerOpen(false);
                        }}
                        className="px-4 py-1.5 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white rounded-lg shadow-sm cursor-pointer transition-all"
                      >
                        Áp dụng
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            ) : (
              /* Table Daily: Single day pills */
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setDateStr(todayStr)}
                  className={`h-8 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${isDailyToday
                    ? "bg-amber-500 text-slate-950 shadow-xs font-bold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                >
                  Hôm nay
                </button>
                <button
                  type="button"
                  onClick={() => setDateStr(yesterdayStr)}
                  className={`h-8 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${isDailyYesterday
                    ? "bg-amber-500 text-slate-950 shadow-xs font-bold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                >
                  Hôm qua
                </button>

                {/* Custom Date Popover Tab Button */}
                <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={`h-8 px-2.5 sm:px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${isDailyCustom
                        ? "bg-amber-500 text-slate-950 shadow-xs font-bold"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                    >
                      <CalendarIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {isDailyCustom
                          ? format(new Date(dateStr + "T00:00:00"), "dd/MM/yyyy")
                          : "Tùy chọn"}
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="bottom"
                    sideOffset={6}
                    align="end"
                    avoidCollisions={false}
                    className="w-[300px] p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50"
                  >
                    <div className="flex items-center justify-between pb-2 mb-1 border-b border-slate-100 dark:border-slate-800">
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Chọn ngày chấm công
                        </span>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Trong vòng 365 ngày gần nhất
                        </p>
                      </div>
                      {dateStr && (
                        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                          {format(new Date(dateStr + "T00:00:00"), "dd/MM/yy")}
                        </span>
                      )}
                    </div>
                    <div className="w-full py-0.5">
                      <CalendarPicker
                        mode="single"
                        selected={new Date(dateStr + "T00:00:00")}
                        onSelect={(d) => {
                          if (d) setDateStr(format(d, "yyyy-MM-dd"));
                          setIsDatePickerOpen(false);
                        }}
                        disabled={(date) =>
                          date < subDays(new Date(), 365) || date > new Date()
                        }
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
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>

          {/* Row 2: Filters - Table View or Charts View */}
          {viewType === "table" ? (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Search Input */}
              <div className="relative w-full sm:w-64 md:w-72 shrink-0">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm nhân sự, @username TikTok..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-9 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-8 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 transition-colors"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                    title="Xóa tìm kiếm"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Dropdown Filters Group */}
              <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
                {/* Team Selector */}
                {renderTeamSelector()}

                {/* Staff Selector */}
                {renderStaffSelector()}

                {/* Score Filter */}
                <div className="relative w-full sm:w-40 md:w-44">
                  <Select
                    value={scoreFilter}
                    onValueChange={(val: any) => setScoreFilter(val)}
                  >
                    <SelectTrigger
                      className={`w-full h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 cursor-pointer [&>span]:truncate whitespace-nowrap transition-colors ${scoreFilter !== "ALL"
                        ? "pr-8 border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/25 text-emerald-700 dark:text-emerald-300 [&_svg]:hidden"
                        : ""
                        }`}
                    >
                      <SelectValue placeholder="Tất cả kết quả" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">
                        Tất cả kết quả công
                      </SelectItem>
                      <SelectItem value="FULL" className="text-xs font-normal text-emerald-600 dark:text-emerald-400 cursor-pointer">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          <span>Đủ 1.0 Ngày Công (&ge;{activeRules.fullDayThreshold}%)</span>
                        </span>
                      </SelectItem>
                      <SelectItem value="HALF" className="text-xs font-normal text-amber-600 dark:text-amber-400 cursor-pointer">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                          <span>Nửa 0.5 Ngày Công ({activeRules.halfDayThreshold}%-{activeRules.fullDayThreshold}%)</span>
                        </span>
                      </SelectItem>
                      <SelectItem value="ZERO" className="text-xs font-normal text-rose-600 dark:text-rose-400 cursor-pointer">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                          <span>0 Ngày Công (&lt;{activeRules.halfDayThreshold}%)</span>
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {scoreFilter !== "ALL" && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setScoreFilter("ALL");
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200/90 hover:bg-rose-500 hover:text-white dark:bg-slate-800 dark:hover:bg-rose-500 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all z-10 cursor-pointer shadow-2xs hover:scale-110"
                          aria-label="Xóa chọn kết quả công"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Xóa chọn kết quả công</TooltipContent>
                    </Tooltip>
                  )}
                </div>

                {/* Quick Reset Filters Button when any filter active */}
                {(search || selectedUserId !== "ALL" || scoreFilter !== "ALL" || teamFilter !== "ALL") && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => {
                          setSearch("");
                          setSelectedUserId("ALL");
                          setScoreFilter("ALL");
                          handleTeamChange("ALL");
                        }}
                        className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-900 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer shrink-0 flex items-center justify-center gap-1.5"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Xóa bộ lọc</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Xóa tất cả bộ lọc đang áp dụng</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          ) : viewType === "charts" && isLeadOrAdmin ? (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Phạm vi thống kê theo nhân sự:</span>
              </div>
              <div className="flex items-center gap-2.5 justify-end">
                {renderTeamSelector()}
                {renderStaffSelector()}
              </div>
            </div>
          ) : null}

          {/* Row 3: Quick Row Expansion control (Table only) */}
          {viewType === "table" && (
            <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <span>Hiển thị</span>
                {loading ? (
                  <span className="inline-block w-8 h-4 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                ) : (
                  <strong>{filteredChecklists.length}</strong>
                )}
                <span>bản ghi chấm công.</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExpandAll(true)}
                  className="hover:text-emerald-600 dark:hover:text-emerald-400 font-bold cursor-pointer"
                >
                  Mở rộng tất cả (+)
                </button>
                <span>•</span>
                <button
                  onClick={() => handleExpandAll(false)}
                  className="hover:text-slate-800 dark:hover:text-slate-200 font-bold cursor-pointer"
                >
                  Thu gọn (-)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dynamic View Body: Calendar, Charts, or Table */}
      {viewType === "calendar" ? (
        <TimesheetCalendar
          checklists={timesheetData?.checklists || []}
          selectedMonthDate={calendarMonth}
          onMonthChange={setCalendarMonth}
          selectedDate={dateStr}
          selectedUserId={resolvedUserId}
          staffList={staffList}
          onNavigateDate={(dStr) => setDateStr(dStr)}
          onSelectDate={(dStr) => {
            setDateStr(dStr);
            setSelectedDateForModal(dStr);
          }}
          isLoading={loading}
          activeRules={activeRules}
        />
      ) : viewType === "charts" ? (
        <TimesheetCharts
          checklists={timesheetData?.checklists || []}
          startDate={startDateStr}
          endDate={endDateStr}
          selectedUserId={resolvedUserId}
          staffList={staffList}
          onSelectDate={(dStr) => setSelectedDateForModal(dStr)}
          isLoading={loading}
        />
      ) : loading ? (
        <DataTableSkeleton columnCount={8} rowCount={8} />
      ) : filteredChecklists.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <CheckSquare className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Không tìm thấy bản ghi chấm công phù hợp</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            Không có nhân sự nào khớp với điều kiện lọc hiện tại. Hãy thử đổi ngày hoặc đặt lại bộ lọc.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden relative z-0 isolate">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[1080px]">
              <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-slate-600 dark:text-slate-300 font-semibold text-xs border-b border-slate-200 dark:border-slate-800 select-none normal-case">
                <tr>
                  <th className="py-3.5 px-3 w-10 min-w-10 max-w-10 text-center">#</th>
                  {viewMode === "range" && <th className="py-3.5 px-3 w-28">Ngày chấm</th>}
                  <th className="py-3.5 px-4 w-[240px] min-w-[240px] max-w-[240px]">Nhân sự</th>
                  <th className="py-3.5 px-3 w-36 text-center">Chức vụ</th>
                  <th className="py-3.5 px-2 w-28 text-center">Số acc</th>
                  <th className="py-3.5 px-2 w-28 text-center">Đã đăng</th>
                  <th className="py-3.5 px-2 w-28 text-center">Đã sync GPM</th>
                  <th className="py-3.5 px-3 w-44">Tiến độ</th>
                  <th className="py-3.5 px-3 w-40 text-center">Kết quả chấm công</th>
                  <th className="py-3.5 px-2 w-28 text-center">Chi tiết</th>
                  <th className="py-3.5 px-3 w-28 text-center whitespace-nowrap">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filteredChecklists.map((chk: any, idx: number) => {
                  const isExpanded = expandedRowIds.has(chk.id);
                  const totalAcc = chk.items.length;
                  const postedCount = chk.items.filter((i: any) => i.isPosted).length;
                  const syncedCount = chk.items.filter((i: any) => i.isSynced).length;
                  const rate = Number(chk.completionRate || 0);
                  const score = Number(chk.workdayScore || 0);
                  const dateFormatted = format(new Date(chk.date), "dd/MM/yyyy");

                  return (
                    <Fragment key={chk.id}>
                      {/* Master Staff Row */}
                      <tr className="group hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                        {/* Col 0: Index */}
                        <td className="w-10 min-w-10 max-w-10 text-center text-slate-400 font-mono text-xs py-3 px-3">
                          {idx + 1}
                        </td>

                        {/* Range Mode: Date */}
                        {viewMode === "range" && (
                          <td className="w-28 px-3 font-mono text-xs font-bold text-slate-700 dark:text-slate-300 py-3">
                            {dateFormatted}
                          </td>
                        )}

                        {/* Col 1: Staff Info */}
                        <td className="w-[240px] min-w-[240px] max-w-[240px] px-4 py-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Link
                              href={`/users/${chk.user.id}`}
                              className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-pink-500 text-white font-bold text-xs flex items-center justify-center uppercase shrink-0 shadow-xs hover:scale-105 transition-transform"
                            >
                              {chk.user.fullName.slice(0, 2)}
                            </Link>
                            <div className="min-w-0">
                              <Link
                                href={`/users/${chk.user.id}`}
                                className="font-bold text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline transition-colors truncate block"
                              >
                                {chk.user.fullName}
                              </Link>
                              <div className="text-xs font-mono text-slate-400 truncate">
                                @{chk.user.username}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Col 1.5: Role / Chức vụ */}
                        <td className="w-36 text-center px-3 py-3">
                          <div className="flex items-center justify-center">
                            {getRoleBadge(chk.user.role)}
                          </div>
                        </td>

                        {/* Col 2: Total Accounts */}
                        <td className="w-28 text-center px-2 py-3">
                          <span className="font-extrabold text-slate-800 dark:text-slate-200">
                            {totalAcc}
                          </span>{" "}
                          <span className="text-slate-400 text-xs">accounts</span>
                        </td>

                        {/* Col 3: Posted Count */}
                        <td className="w-28 text-center px-2 py-3">
                          <span
                            className={`inline-flex items-center gap-1 font-bold ${postedCount === totalAcc && totalAcc > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-slate-700 dark:text-slate-300"
                              }`}
                          >
                            <Video className="w-3.5 h-3.5 text-pink-500" />
                            {postedCount}/{totalAcc}
                          </span>
                        </td>

                        {/* Col 4: Synced GPM Count */}
                        <td className="w-28 text-center px-2 py-3">
                          <span
                            className={`inline-flex items-center gap-1 font-bold ${syncedCount === totalAcc && totalAcc > 0
                              ? "text-cyan-600 dark:text-cyan-400"
                              : "text-slate-700 dark:text-slate-300"
                              }`}
                          >
                            <RefreshCw className="w-3.5 h-3.5 text-cyan-500" />
                            {syncedCount}/{totalAcc}
                          </span>
                        </td>

                        {/* Col 5: Completion Progress */}
                        <td className="w-44 px-3 py-3">
                          <div className="flex items-center justify-between text-xs font-bold mb-1">
                            <span className="text-slate-700 dark:text-slate-300">{rate}% Hoàn thành</span>
                            <span className="text-slate-400 font-normal">
                              {chk.completedCount}/{totalAcc}
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${rate >= activeRules.fullDayThreshold
                                ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                                : rate >= activeRules.halfDayThreshold
                                  ? "bg-gradient-to-r from-amber-500 to-yellow-400"
                                  : "bg-gradient-to-r from-rose-500 to-pink-500"
                                }`}
                              style={{ width: `${Math.min(100, rate)}%` }}
                            />
                          </div>
                        </td>

                        {/* Col 6: Workday Score Badge */}
                        <td className="w-40 text-center px-3 py-3">
                          {getWorkdayBadge(score, rate)}
                        </td>

                        {/* Col 7: Accordion Expand Chi Tiết Button */}
                        <td className="w-28 text-center px-2 py-3">
                          <button
                            onClick={() => handleToggleRowExpand(chk.id)}
                            className={`inline-flex items-center gap-1.5 px-3 h-7.5 rounded-xl text-xs font-bold transition-all cursor-pointer border shadow-2xs ${isExpanded
                              ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                              }`}
                          >
                            {isExpanded ? <Minus className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                            <span>{isExpanded ? "Thu gọn" : "Chi tiết"}</span>
                          </button>
                        </td>

                        {/* Col 8: More Actions Dropdown */}
                        <td className="w-28 text-center px-3 py-3">
                          <div className="flex justify-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  className="flex items-center justify-center w-7.5 h-7.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer shadow-2xs"
                                  title="Tùy chọn thao tác"
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56 p-1.5 rounded-2xl shadow-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setScanning(true);
                                    showToast(`⏳ Đang quét tự động cho @${chk.user.username}...`, "info");
                                    autoScanMutation.mutate({ checklistId: chk.id });
                                  }}
                                  className="flex items-center gap-2.5 px-3 py-2 text-xs font-normal cursor-pointer rounded-xl hover:bg-pink-50 dark:hover:bg-pink-950/50 text-slate-700 dark:text-slate-200"
                                >
                                  <Zap className="w-4 h-4 text-pink-500" />
                                  <span>Quét Tự Động Nhân Sự</span>
                                </DropdownMenuItem>

                                {isLeadOrAdmin ? (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => handleAdminCheckComplete(chk.id, chk.user.fullName)}
                                      className="flex items-center gap-2.5 px-3 py-2 text-xs font-normal text-emerald-600 dark:text-emerald-400 cursor-pointer rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                                    >
                                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                      <span>Check Hoàn Thành (1.0 Công)</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handleAdminCheckHalfDay(chk.id, chk.user.fullName)}
                                      className="flex items-center gap-2.5 px-3 py-2 text-xs font-normal text-amber-600 dark:text-amber-400 cursor-pointer rounded-xl hover:bg-amber-50 dark:hover:bg-amber-950/50"
                                    >
                                      <CheckCircle2 className="w-4 h-4 text-amber-500" />
                                      <span>Check Hoàn Thành (0.5 Công)</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handleAdminCheckZero(chk.id, chk.user.fullName)}
                                      className="flex items-center gap-2.5 px-3 py-2 text-xs font-normal text-rose-600 dark:text-rose-400 cursor-pointer rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/50"
                                    >
                                      <XCircle className="w-4 h-4 text-rose-500" />
                                      <span>Check Không Hoàn Thành (0 Công)</span>
                                    </DropdownMenuItem>
                                  </>
                                ) : (
                                  <div className="px-3 py-1.5 text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5 italic">
                                    <Shield className="w-3.5 h-3.5 shrink-0" />
                                    <span>Chỉ Admin/Lead mới được duyệt công</span>
                                  </div>
                                )}

                                <DropdownMenuSeparator className="my-1 bg-slate-100 dark:bg-slate-800" />

                                <DropdownMenuItem asChild>
                                  <Link
                                    href={`/users/${chk.user.id}`}
                                    className="flex items-center gap-2.5 px-3 py-2 text-xs font-normal text-slate-600 dark:text-slate-400 cursor-pointer rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800"
                                  >
                                    <Users className="w-4 h-4 text-slate-400" />
                                    <span>Xem Profile & Dàn Kênh</span>
                                  </Link>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Inner Sub-Table: Assigned Accounts for this staff */}
                      {isExpanded && (
                        <tr className="bg-slate-50/50 dark:bg-slate-950/40">
                          <td colSpan={viewMode === "range" ? 11 : 10} className="p-0">
                            <div className="bg-slate-50/90 dark:bg-slate-950/80 p-4 border-t border-b border-slate-200/80 dark:border-slate-800/80 animate-in slide-in-from-top-2 duration-200">
                              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
                                <div className="px-4 py-2.5 bg-slate-100/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                                  <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                    <Users className="w-4 h-4 text-pink-500" />
                                    <span>Danh sách {chk.items.length} tài khoản giao việc cho {chk.user.fullName}</span>
                                  </div>
                                </div>

                                {chk.items.length === 0 ? (
                                  <div className="p-6 text-center text-xs text-slate-400">
                                    Nhân viên này chưa được gán tài khoản TikTok nào. Vui lòng vào trang Quản lý tài khoản để phân công.
                                  </div>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs min-w-[840px]">
                                      <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-slate-600 dark:text-slate-300 font-semibold text-xs border-b border-slate-100 dark:border-slate-800 normal-case">
                                        <tr>
                                          <th className="py-2.5 px-4 w-[263px] min-w-[263px] max-w-[263px]">
                                            Tài khoản TikTok
                                          </th>
                                          <th className="py-2.5 px-4 text-center whitespace-nowrap">Đã đăng video</th>
                                          <th className="py-2.5 px-4 text-center whitespace-nowrap">Đã sync GPM</th>
                                          <th className="py-2.5 px-4 text-center w-36 min-w-[130px] whitespace-nowrap">Trạng thái KPI</th>
                                          <th className="py-2.5 px-4 min-w-[220px]">Giờ đăng & tiêu đề video mới nhất</th>
                                          <th className="py-2.5 px-4 min-w-[220px]">Ghi chú vận hành</th>
                                          <th className="py-2.5 px-4 text-right min-w-[100px] whitespace-nowrap">
                                            Thao tác
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                        {chk.items.map((item: any) => {
                                          const optPosted = optimisticToggles[item.id]?.isPosted !== undefined ? optimisticToggles[item.id].isPosted : item.isPosted;
                                          const optSynced = optimisticToggles[item.id]?.isSynced !== undefined ? optimisticToggles[item.id].isSynced : item.isSynced;
                                          const isItemCompleted = item.isCompleted || (optPosted && optSynced);
                                          const lastSyncFormatted = item.account.lastSyncedAt
                                            ? format(new Date(item.account.lastSyncedAt), "HH:mm dd/MM")
                                            : "Chưa sync";
                                          const isAccountFailed = item.account.status === "BANNED" || item.account.status === "RESTRICTED" || item.account.status === "STOPPED";
                                          const isGpmMissing = !item.account.gpmProfileId;

                                          return (
                                            <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                                              {/* Account Name & Link */}
                                              <td className="py-3 px-4 w-[263px] min-w-[263px] max-w-[263px]">
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                  <div className="w-6.5 h-6.5 rounded-lg bg-gradient-to-tr from-pink-500/20 via-rose-500/20 to-purple-500/20 border border-pink-500/30 flex items-center justify-center text-pink-600 dark:text-pink-400 font-bold text-xs shrink-0 shadow-2xs">
                                                    {item.account.username ? item.account.username.slice(0, 2).toUpperCase() : "TK"}
                                                  </div>
                                                  <Link
                                                    href={`/accounts/${item.account.id}`}
                                                    className="font-bold text-slate-900 dark:text-white hover:text-pink-600 dark:hover:text-pink-400 hover:underline transition-colors block truncate"
                                                  >
                                                    @{item.account.username}
                                                  </Link>
                                                </div>
                                              </td>

                                              {/* Status: Posted */}
                                              <td className="py-3 px-4 text-center">
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <div
                                                      className={`w-7.5 h-7.5 rounded-full border flex items-center justify-center mx-auto transition-all shadow-2xs cursor-default select-none ${optPosted
                                                        ? "bg-emerald-500 border-emerald-500 text-white"
                                                        : isAccountFailed
                                                          ? "bg-rose-500 border-rose-500 text-white"
                                                          : "bg-rose-500 border-rose-500 text-white"
                                                        }`}
                                                    >
                                                      {optPosted ? (
                                                        <Check className="w-4 h-4 stroke-[3]" />
                                                      ) : isAccountFailed ? (
                                                        <AlertCircle className="w-4 h-4 stroke-[2.5]" />
                                                      ) : (
                                                        <X className="w-4 h-4 stroke-[3]" />
                                                      )}
                                                    </div>
                                                  </TooltipTrigger>
                                                  <TooltipContent side="top" className="text-xs font-normal">
                                                    {optPosted
                                                      ? `Đã đăng video${item.postedAt ? ` lúc ${format(new Date(item.postedAt), "HH:mm dd/MM/yyyy")}` : " hôm nay"}`
                                                      : isAccountFailed
                                                        ? `Kiểm tra thất bại: Tài khoản bị ${item.account.status === "BANNED" ? "khóa (Banned)" : item.account.status === "RESTRICTED" ? "hạn chế" : "tạm dừng"} - Không thể đăng video`
                                                        : `Chưa đăng video ngày ${format(new Date(chk.date), "dd/MM/yyyy")}`}
                                                  </TooltipContent>
                                                </Tooltip>
                                              </td>

                                              {/* Status: Synced */}
                                              <td className="py-3 px-4 text-center">
                                                {(() => {
                                                  const syncDiag = getAccountSyncDiagnostic(item.account, {
                                                    isSyncedToday: optSynced,
                                                    syncedAt: item.syncedAt || item.account?.lastSyncedAt,
                                                  });
                                                  const isSynced = Boolean(optSynced);
                                                  const hasIssue = hasAccountSyncIssue(item.account);
                                                  const openAlerts = item.account?.alerts || [];

                                                  return (
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <div
                                                          className={`w-7.5 h-7.5 rounded-full border flex items-center justify-center mx-auto transition-all shadow-2xs cursor-default select-none ${isSynced
                                                            ? "bg-emerald-500 border-emerald-500 text-white"
                                                            : "bg-cyan-500 border-cyan-500 text-white"
                                                            }`}
                                                        >
                                                          {isSynced ? (
                                                            <Check className="w-4 h-4 stroke-[3]" />
                                                          ) : (
                                                            <RefreshCw className="w-4 h-4" />
                                                          )}
                                                        </div>
                                                      </TooltipTrigger>
                                                      <TooltipContent side="top" className="text-xs font-normal z-[200] max-w-xs p-3">
                                                        {isSynced && !hasIssue ? (
                                                          <div className="space-y-1 text-left">
                                                            <div className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                                                              <CheckCircle2 className="w-3.5 h-3.5" />
                                                              <span>Đã sync GPM hôm nay</span>
                                                            </div>
                                                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                                              {item.syncedAt
                                                                ? `Lúc: ${format(new Date(item.syncedAt), "HH:mm dd/MM/yyyy")}`
                                                                : syncDiag.detailTime !== "Chưa từng"
                                                                  ? `Lần sync: ${syncDiag.detailTime}`
                                                                  : "Đã hoàn thành đồng bộ dữ liệu"}
                                                            </p>
                                                          </div>
                                                        ) : (
                                                          <div className="space-y-1.5 text-left">
                                                            <div className={`flex items-center gap-1.5 font-bold ${isSynced ? "text-amber-500 dark:text-amber-400" : "text-rose-500 dark:text-rose-400"}`}>
                                                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                                              <span>{isSynced ? `Đã sync (${syncDiag.badgeText})` : `Chưa sync / ${syncDiag.badgeText}`}</span>
                                                            </div>
                                                            <div className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                                                              <span className="font-semibold text-slate-700 dark:text-slate-200">Nguyên nhân: </span>
                                                              <span className="text-slate-500 dark:text-slate-400">{syncDiag.reason}</span>
                                                            </div>
                                                            {openAlerts.length > 0 && (
                                                              <div className="space-y-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                                                                <span className="font-semibold text-rose-600 dark:text-rose-400 text-[10px] uppercase tracking-wide">Chi tiết cảnh báo:</span>
                                                                {openAlerts.map((al: any) => (
                                                                  <div key={al.id} className="text-[11px] text-rose-600/90 dark:text-rose-300 flex items-start gap-1">
                                                                    <span className="shrink-0">•</span>
                                                                    <span>{al.description || al.alertType}</span>
                                                                  </div>
                                                                ))}
                                                              </div>
                                                            )}
                                                            {syncDiag.action && (
                                                              <div className="pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                                                                <span className="font-semibold text-amber-600 dark:text-amber-400">Cách xử lý: </span>
                                                                <span className="text-slate-500 dark:text-slate-400">{syncDiag.action}</span>
                                                              </div>
                                                            )}
                                                            <div className="pt-1 text-[10px] text-slate-400">
                                                              Lần sync gần nhất: {syncDiag.detailTime}
                                                            </div>
                                                          </div>
                                                        )}
                                                      </TooltipContent>
                                                    </Tooltip>
                                                  );
                                                })()}
                                              </td>

                                              {/* KPI Status */}
                                              <td className="py-3 px-4 text-center w-36 min-w-[130px] whitespace-nowrap">
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <div className="inline-flex cursor-help">
                                                      {isItemCompleted ? (
                                                        <span className="inline-flex items-center justify-center gap-1.5 px-3 h-7.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shadow-2xs whitespace-nowrap">
                                                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Đạt KPI
                                                        </span>
                                                      ) : (
                                                        <span className="inline-flex items-center justify-center gap-1.5 px-3 h-7.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700 shadow-2xs whitespace-nowrap">
                                                          Chưa đạt
                                                        </span>
                                                      )}
                                                    </div>
                                                  </TooltipTrigger>
                                                  <TooltipContent side="top" className="text-xs font-normal">
                                                    {isItemCompleted
                                                      ? "Đạt KPI: Đã đăng video và đồng bộ GPM đầy đủ"
                                                      : "Không đạt: Chưa đăng video hoặc chưa đồng bộ GPM ngày này"}
                                                  </TooltipContent>
                                                </Tooltip>
                                              </td>

                                              {/* Latest Video Time & Title */}
                                              <td className="py-3 px-4 min-w-[220px]">
                                                <div className="space-y-0.5">
                                                  <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 font-bold text-xs">
                                                    <Video className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                                                    <span>
                                                      {item.notes?.includes("lúc")
                                                        ? item.notes.split("•")[0].trim()
                                                        : optPosted
                                                          ? `Đã đăng video hôm nay`
                                                          : "Chưa phát hiện video mới"}
                                                    </span>
                                                  </div>
                                                  <div className="text-xs text-slate-400">
                                                    Sync Live gần nhất: <strong>{lastSyncFormatted}</strong>
                                                  </div>
                                                  <button
                                                    type="button"
                                                    onClick={() => setCrossCheckItem({
                                                      username: item.account.username,
                                                      accountId: item.account.id,
                                                      dateStr: format(new Date(chk.date), "yyyy-MM-dd"),
                                                      staffName: chk.user.fullName,
                                                      itemId: item.id,
                                                    })}
                                                    className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400 hover:bg-pink-100 dark:hover:bg-pink-900/60 border border-pink-200/80 dark:border-pink-800 transition-colors cursor-pointer"
                                                  >
                                                    <Eye className="w-3 h-3" />
                                                    <span>Đối soát video</span>
                                                  </button>
                                                </div>
                                              </td>

                                              {/* Operator Notes Input / Modal Trigger */}
                                              <td className="py-3 px-4 min-w-[220px]">
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const canEdit = isAdmin || isLeadOrAdmin || chk.user.id === (session?.user as any)?.id;
                                                    setNoteModalItem({
                                                      id: item.id,
                                                      accountUsername: item.account.username,
                                                      country: item.account.country,
                                                      notes: item.notes || "",
                                                      dateFormatted,
                                                      staffName: chk.user.fullName,
                                                      canEdit,
                                                    });
                                                    setNoteInputText(item.notes || "");
                                                  }}
                                                  className="w-full text-left group/note flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 hover:bg-slate-100 dark:hover:bg-slate-900 border border-slate-200/80 dark:border-slate-800 transition-all cursor-pointer shadow-2xs hover:border-pink-300 dark:hover:border-pink-800"
                                                >
                                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                                    <FileEdit className="w-3.5 h-3.5 text-slate-400 group-hover/note:text-pink-500 shrink-0" />
                                                    <span className={`text-xs truncate ${item.notes ? "text-slate-800 dark:text-slate-200 font-medium" : "text-slate-400 italic"}`}>
                                                      {item.notes || "Nhập ghi chú vận hành, tiêu đề.."}
                                                    </span>
                                                  </div>
                                                  <span className="text-xs text-pink-600 dark:text-pink-400 font-bold shrink-0 opacity-0 group-hover/note:opacity-100 transition-opacity">
                                                    Sửa
                                                  </span>
                                                </button>
                                              </td>

                                              {/* Quick Actions */}
                                              <td className="py-3 px-4 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                  {/* Cross-Check Videos */}
                                                  <Tooltip>
                                                    <TooltipTrigger asChild>
                                                      <button
                                                        onClick={() => setCrossCheckItem({
                                                          username: item.account.username,
                                                          accountId: item.account.id,
                                                          dateStr: format(new Date(chk.date), "yyyy-MM-dd"),
                                                          staffName: chk.user.fullName,
                                                          itemId: item.id,
                                                        })}
                                                        className="p-1.5 rounded-lg text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-950/50 transition-colors cursor-pointer"
                                                        aria-label="Đối soát video đã đăng"
                                                      >
                                                        <Eye className="w-3.5 h-3.5" />
                                                      </button>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top" className="text-xs">
                                                      Đối soát video đã đăng
                                                    </TooltipContent>
                                                  </Tooltip>

                                                  {/* Launch GPM */}
                                                  {item.account.gpmProfileId && (
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <button
                                                          onClick={() => startGpmMutation.mutate({ gpmProfileId: item.account.gpmProfileId })}
                                                          className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors cursor-pointer"
                                                          aria-label="Mở trình duyệt GPMLogin"
                                                        >
                                                          <Play className="w-3.5 h-3.5" />
                                                        </button>
                                                      </TooltipTrigger>
                                                      <TooltipContent side="top" className="text-xs">
                                                        Mở GPM Profile
                                                      </TooltipContent>
                                                    </Tooltip>
                                                  )}

                                                  {/* Sync Account */}
                                                  <Tooltip>
                                                    <TooltipTrigger asChild>
                                                      <button
                                                        onClick={() => syncAccountMutation.mutate({ accountId: item.account.id })}
                                                        className="p-1.5 rounded-lg text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-950/50 transition-colors cursor-pointer"
                                                        aria-label="Đồng bộ Live"
                                                      >
                                                        <RefreshCw className="w-3.5 h-3.5" />
                                                      </button>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top" className="text-xs">
                                                      Đồng bộ Live Studio
                                                    </TooltipContent>
                                                  </Tooltip>

                                                  {/* Detail Link */}
                                                  <Tooltip>
                                                    <TooltipTrigger asChild>
                                                      <Link
                                                        href={`/accounts/${item.account.id}`}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                                                        aria-label="Xem chi tiết tài khoản"
                                                      >
                                                        <ExternalLink className="w-3.5 h-3.5" />
                                                      </Link>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top" className="text-xs">
                                                      Xem chi tiết kênh
                                                    </TooltipContent>
                                                  </Tooltip>
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rules Config Drawer (Admin) */}
      {isSettingsDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 h-full p-6 shadow-2xl flex flex-col justify-between border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-200 overflow-y-auto">
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-pink-500" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Cấu Hình Quy Tắc Chấm Công
                  </h3>
                </div>
                <button
                  onClick={() => setIsSettingsDrawerOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Cutoff Time */}
              <div>
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-2">
                  Khung giờ chốt công tự động (Giờ VN)
                </label>
                <TimePickerField
                  value={`${String(editRules.cutOffHour).padStart(2, "0")}:${String(editRules.cutOffMinute).padStart(2, "0")}`}
                  onChange={(val) => {
                    const [h, m] = val.split(":").map(Number);
                    if (!isNaN(h) && !isNaN(m)) {
                      setEditRules((prev) => ({
                        ...prev,
                        cutOffHour: h,
                        cutOffMinute: m,
                      }));
                    }
                  }}
                />
                <p className="text-xs text-slate-400 mt-2">
                  Hệ thống Cron tự động chốt vào mốc giờ này hàng ngày.
                </p>
              </div>

              {/* Threshold 1.0 */}
              <div>
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-2">
                  Ngưỡng tính 1 Ngày Công (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={editRules.fullDayThreshold === 0 ? "" : editRules.fullDayThreshold}
                  onChange={(e) => {
                    const val = e.target.value === "" ? 0 : parseInt(e.target.value, 10);
                    if (!isNaN(val)) {
                      setEditRules((prev) => ({
                        ...prev,
                        fullDayThreshold: Math.min(100, Math.max(0, val)),
                      }));
                    }
                  }}
                  placeholder="85"
                  className={cn(
                    "w-full h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border text-sm font-normal text-slate-900 dark:text-white transition-colors focus:outline-none focus:ring-2",
                    editRules.fullDayThreshold <= editRules.halfDayThreshold
                      ? "border-rose-300 dark:border-rose-800 focus:ring-rose-500"
                      : "border-slate-200 dark:border-slate-800 focus:ring-pink-500"
                  )}
                />
                <p className="text-xs text-slate-400 mt-2">
                  Đạt từ {editRules.fullDayThreshold}% số accounts được giao trở lên sẽ được tính 1.0 ngày công.
                </p>
              </div>

              {/* Threshold 0.5 */}
              <div>
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-2">
                  Ngưỡng tính 0.5 Ngày Công (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={editRules.halfDayThreshold === 0 ? "" : editRules.halfDayThreshold}
                  onChange={(e) => {
                    const val = e.target.value === "" ? 0 : parseInt(e.target.value, 10);
                    if (!isNaN(val)) {
                      setEditRules((prev) => ({
                        ...prev,
                        halfDayThreshold: Math.min(100, Math.max(0, val)),
                      }));
                    }
                  }}
                  placeholder="50"
                  className={cn(
                    "w-full h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border text-sm font-normal text-slate-900 dark:text-white transition-colors focus:outline-none focus:ring-2",
                    editRules.fullDayThreshold <= editRules.halfDayThreshold
                      ? "border-rose-300 dark:border-rose-800 focus:ring-rose-500"
                      : "border-slate-200 dark:border-slate-800 focus:ring-pink-500"
                  )}
                />
                <p className="text-xs text-slate-400 mt-2">
                  Đạt từ {editRules.halfDayThreshold}% đến dưới {editRules.fullDayThreshold}% sẽ được tính 0.5 ngày công. Dưới {editRules.halfDayThreshold}% tính 0 công.
                </p>
              </div>

              {/* Banned Account KPI Exclusion Policy */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 pr-2">
                    <div className="flex items-center gap-2">
                      <Ban className="w-4 h-4 text-rose-500 shrink-0" />
                      <label htmlFor="exclude-banned-toggle" className="text-xs font-bold text-slate-900 dark:text-white cursor-pointer">
                        Loại trừ kênh Banned khỏi Tổng Chỉ Tiêu (totalAssigned)
                      </label>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      {editRules.excludeBannedAccounts ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          ✓ Tiếp cận mới (Bật): Kênh Banned sẽ bị loại khỏi mẫu số totalAssigned. Nhân sự không bị trừ Điểm công ngày (workdayScore) do kênh chết ngoài ý muốn.
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          ⚠ Tính cả kênh Banned (Tắt): Vẫn tính kênh Banned vào tổng chỉ tiêu được giao. Điểm công ngày sẽ bị giảm nếu kênh banned không hoàn thành.
                        </span>
                      )}
                    </p>
                  </div>
                  <Switch
                    id="exclude-banned-toggle"
                    checked={editRules.excludeBannedAccounts}
                    onCheckedChange={(checked) =>
                      setEditRules((prev) => ({ ...prev, excludeBannedAccounts: checked }))
                    }
                    className="data-[state=checked]:bg-pink-600 cursor-pointer shrink-0 mt-0.5"
                  />
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80">
                  ℹ️ <strong>Lưu ý:</strong> Kênh bị TikTok <em>Hạn Chế (Restricted)</em> vẫn luôn được theo dõi trong danh sách kiểm tra và tính vào chỉ tiêu bình thường.
                </div>
              </div>

              {/* Threshold Validation Error Alert */}
              {editRules.fullDayThreshold <= editRules.halfDayThreshold && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-medium text-rose-700 dark:text-rose-300 flex items-start gap-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                  <span>
                    Ngưỡng hưởng 1.0 công ({editRules.fullDayThreshold}%) phải lớn hơn ngưỡng hưởng 0.5 công ({editRules.halfDayThreshold}%).
                  </span>
                </div>
              )}
            </div>

            <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
              <button
                onClick={() => setIsSettingsDrawerOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                disabled={editRules.fullDayThreshold <= editRules.halfDayThreshold || saveRulesMutation.isPending}
                onClick={() => {
                  if (editRules.fullDayThreshold <= editRules.halfDayThreshold) {
                    showToast("❌ Ngưỡng 1.0 Ngày Công phải lớn hơn ngưỡng 0.5 Ngày Công!", "error");
                    return;
                  }
                  saveRulesMutation.mutate(editRules);
                }}
                className={cn(
                  "px-5 py-2 rounded-xl text-xs font-bold text-white shadow-md transition-all cursor-pointer",
                  editRules.fullDayThreshold <= editRules.halfDayThreshold || saveRulesMutation.isPending
                    ? "bg-slate-300 dark:bg-slate-800 cursor-not-allowed opacity-60 shadow-none"
                    : "bg-pink-600 hover:bg-pink-500 shadow-pink-600/30"
                )}
              >
                {saveRulesMutation.isPending ? "Đang lưu..." : "Lưu Thay Đổi"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Note Modal / Dialog */}
      <Dialog open={!!noteModalItem} onOpenChange={(open) => !open && setNoteModalItem(null)}>
        <DialogContent className="max-w-xl p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
          <DialogHeader className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-pink-50 dark:bg-pink-950/50 text-pink-600 dark:text-pink-400 flex items-center justify-center shrink-0 border border-pink-200 dark:border-pink-800 shadow-xs">
                <FileEdit className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-black text-slate-900 dark:text-white">
                  Ghi Chú Vận Hành & KPI Kênh
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
                  Tài khoản <strong className="text-slate-700 dark:text-slate-300">@{noteModalItem?.accountUsername}</strong> • Nhân sự: {noteModalItem?.staffName}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 my-2">
            {!noteModalItem?.canEdit && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs font-semibold">
                <Shield className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>Chế độ chỉ xem: Chỉ Quản trị viên (Admin), Lead hoặc nhân sự phụ trách mới có quyền chỉnh sửa ghi chú.</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Nội dung ghi chú / Báo cáo vận hành:
              </label>
              <textarea
                rows={6}
                value={noteInputText}
                onChange={(e) => setNoteInputText(e.target.value)}
                readOnly={!noteModalItem?.canEdit}
                disabled={!noteModalItem?.canEdit}
                placeholder="Nhập ghi chú chi tiết, giải trình lỗi, tiêu đề video, lý do chưa đủ KPI..."
                className={`w-full min-h-[140px] p-3.5 text-xs rounded-2xl border text-slate-900 dark:text-white placeholder:text-slate-400 resize-none leading-relaxed ${noteModalItem?.canEdit
                  ? "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus:outline-none focus:border-pink-500"
                  : "bg-slate-100/70 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 opacity-80 cursor-not-allowed"
                  }`}
              />
            </div>

            {/* Quick Preset Tags (Only when user can edit) */}
            {noteModalItem?.canEdit && (
              <div>
                <div className="text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
                  Gợi ý nhanh (Click để chèn):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "✅ Đã đăng video hôm nay",
                    "🔄 Đã sync dữ liệu GPM",
                    "⚠️ Lỗi checkpoint / Proxy",
                    "🎬 Video đăng lúc 10:00 PM",
                    "📌 Xin phép bù ca / Nửa công",
                  ].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setNoteInputText((prev) => (prev ? `${prev} • ${tag}` : tag));
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            {noteModalItem?.canEdit ? (
              <>
                <button
                  type="button"
                  onClick={() => setNoteInputText("")}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                >
                  Xóa ghi chú
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setNoteModalItem(null)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveNoteModal}
                    disabled={updateNotesMutation.isPending}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all cursor-pointer disabled:opacity-50"
                  >
                    {updateNotesMutation.isPending ? "Đang lưu..." : "Lưu Ghi Chú"}
                  </button>
                </div>
              </>
            ) : (
              <div className="w-full flex justify-end">
                <button
                  type="button"
                  onClick={() => setNoteModalItem(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Video Cross-Check Modal */}
      <VideoCrossCheckModal
        isOpen={!!crossCheckItem}
        onClose={() => setCrossCheckItem(null)}
        username={crossCheckItem?.username || null}
        accountId={crossCheckItem?.accountId}
        dateStr={crossCheckItem?.dateStr || null}
        staffName={crossCheckItem?.staffName}
        canApprove={isAdmin || isLeadOrAdmin}
        onApproveVideo={(itemId) => {
          toggleItemMutation.mutate({ itemId, field: "isPosted", value: true });
          setCrossCheckItem(null);
          showToast("✅ Đã xác nhận đạt video cho tài khoản!", "success");
        }}
        onSyncAccount={(accId) => syncAccountMutation.mutate({ accountId: accId })}
      />

      {/* Day Detail Inspector Modal */}
      <DayDetailModal
        isOpen={!!selectedDateForModal}
        onClose={() => setSelectedDateForModal(null)}
        dateStr={selectedDateForModal}
        checklistsForDate={
          timesheetData?.checklists?.filter((c: any) => {
            const d = format(new Date(c.date), "yyyy-MM-dd");
            return d === selectedDateForModal;
          }) || []
        }
        onSwitchToTableView={(dStr) => {
          setViewType("table");
          setViewMode("daily");
          setDateStr(dStr);
          setSelectedDateForModal(null);
        }}
        onEditNote={(item, staffName) => {
          const canEdit =
            isAdmin ||
            isLeadOrAdmin ||
            item.userId === (session?.user as any)?.id;
          setNoteModalItem({
            id: item.id,
            accountUsername: item.account.username,
            country: item.account.country,
            notes: item.notes || "",
            dateFormatted: format(
              new Date(selectedDateForModal + "T00:00:00"),
              "dd/MM/yyyy"
            ),
            staffName,
            canEdit,
          });
          setNoteInputText(item.notes || "");
        }}
        onLaunchGpm={(gpmId) => startGpmMutation.mutate({ gpmProfileId: gpmId })}
        onSyncAccount={(accId) => syncAccountMutation.mutate({ accountId: accId })}
        onViewVideos={(acc, dStr) => setCrossCheckItem({ accountId: acc.id, username: acc.username, dateStr: dStr, staffName: "", itemId: "" })}
        isAdmin={isLeadOrAdmin}
        onAdminCheckComplete={handleAdminCheckComplete}
        onAdminCheckHalfDay={handleAdminCheckHalfDay}
        onAdminCheckZero={handleAdminCheckZero}
      />
      {confirmDialog}
    </div>
  );
}

export default function ChecklistPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400 text-xs">Đang tải bảng chấm công...</div>}>
      <ChecklistPageContent />
    </Suspense>
  );
}
