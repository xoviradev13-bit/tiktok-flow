"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Clock,
  UserCheck,
  CheckCircle2,
  AlertCircle,
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
} from "lucide-react";
import { format } from "date-fns";
import confetti from "canvas-confetti";
import * as XLSX from "xlsx";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
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

export default function ChecklistPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN" || (session?.user as any)?.userType === "ADMIN";
  const isLeadOrAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "LEAD";

  // Mode: "daily" (Roll call for all staff on 1 date) or "range" (Timeline for 1 user / org)
  const [viewMode, setViewMode] = useState<"daily" | "range">("daily");

  // Filter States
  const [selectedUserId, setSelectedUserId] = useState<string>("ALL");
  const [dateStr, setDateStr] = useState<string>(new Date().toISOString().split("T")[0]);
  const [startDateStr, setStartDateStr] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [endDateStr, setEndDateStr] = useState<string>(new Date().toISOString().split("T")[0]);
  const [activeRangePreset, setActiveRangePreset] = useState<string>("7d");

  const [search, setSearch] = useState<string>("");
  const [scoreFilter, setScoreFilter] = useState<"ALL" | "FULL" | "HALF" | "ZERO">("ALL");

  // Date picker popovers
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isRangePickerOpen, setIsRangePickerOpen] = useState(false);
  const [rangeSelection, setRangeSelection] = useState<DateRange | undefined>(() => ({
    from: new Date(startDateStr + "T00:00:00"),
    to: new Date(endDateStr + "T00:00:00"),
  }));

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
    cutOffHour: 10,
    cutOffMinute: 0,
    fullDayThreshold: 85,
    halfDayThreshold: 50,
    requireDataSync: true,
  });

  // Expanded Staff Accordion Rows (Set of checklist IDs or row keys)
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());

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

  const utils = trpc.useUtils();

  const showToast = (text: string, type: "success" | "info" | "error" = "success") => {
    setActionMsg({ text, type });
    setTimeout(() => setActionMsg(null), 4500);
  };

  // Fetch Staff List for filter dropdown
  const { data: staffList = [] } = trpc.user.listStaff.useQuery();

  // Query Timesheet / Checklist Data
  const { data: timesheetData, isLoading: loading, refetch } = trpc.checklist.getByDate.useQuery({
    date: viewMode === "daily" ? dateStr : undefined,
    startDate: viewMode === "range" ? startDateStr : undefined,
    endDate: viewMode === "range" ? endDateStr : undefined,
    userId: selectedUserId === "ALL" ? undefined : selectedUserId,
    search: search || undefined,
    scoreFilter: scoreFilter !== "ALL" ? scoreFilter : undefined,
  });

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
        cutOffHour: timesheetData.scoringConfig.cutOffHour ?? 10,
        cutOffMinute: timesheetData.scoringConfig.cutOffMinute ?? 0,
        fullDayThreshold: timesheetData.scoringConfig.fullDayThreshold ?? 85,
        halfDayThreshold: timesheetData.scoringConfig.halfDayThreshold ?? 50,
        requireDataSync: timesheetData.scoringConfig.requireDataSync ?? true,
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

  const handleMassCompleteAll = () => {
    if (confirm("Xác nhận chấm 100% hoàn thành (1.0 Ngày công) cho tất cả nhân sự đang hiển thị?")) {
      massCompleteMutation.mutate({
        date: viewMode === "daily" ? dateStr : undefined,
      });
    }
  };

  const handleAdminCheckComplete = (checklistId: string, fullName: string) => {
    if (!isAdmin) {
      showToast("Chỉ Quản trị viên (Admin) mới có quyền duyệt hoàn thành công thủ công", "error");
      return;
    }
    if (confirm(`Xác nhận duyệt hoàn thành 100% (1.0 Ngày công) cho nhân sự ${fullName}?`)) {
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
    toggleItemMutation.mutate({
      itemId: item.id,
      field,
      value: !item[field],
    });
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
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    setStartDateStr(format(start, "yyyy-MM-dd"));
    setEndDateStr(format(now, "yyyy-MM-dd"));
    setRangeSelection({ from: start, to: now });
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

  const getWorkdayBadge = (scoreNum: number, rateNum: number) => {
    if (scoreNum >= 1.0) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 h-7.5 rounded-xl text-xs font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-2xs">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>1.0 Công (Đạt)</span>
        </span>
      );
    }
    if (scoreNum === 0.5) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 h-7.5 rounded-xl text-xs font-black bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 shadow-2xs">
          <Clock className="w-3.5 h-3.5" />
          <span>0.5 Công (Nửa ngày)</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 h-7.5 rounded-xl text-xs font-black bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 shadow-2xs">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>0 Công (Không đạt)</span>
      </span>
    );
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "ADMIN":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 h-7.5 rounded-xl text-xs font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 shadow-2xs">
            <Shield className="w-3.5 h-3.5" /> ADMIN
          </span>
        );
      case "LEAD":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 h-7.5 rounded-xl text-xs font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 shadow-2xs">
            <ShieldCheck className="w-3.5 h-3.5" /> LEAD
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 h-7.5 rounded-xl text-xs font-bold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20 shadow-2xs">
            <UserCheck className="w-3.5 h-3.5" /> STAFF
          </span>
        );
    }
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

  const cutoffInfo = timesheetData?.cutoffInfo;

  const activeRules = timesheetData?.scoringConfig || {
    cutOffHour: 10,
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
              Theo dõi chấm công hàng ngày, tỷ lệ hoàn thành KPI, tự động chốt công theo mốc 10:00 AM và quản lý lịch sử vận hành.
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
                    Mốc Chốt Công Tự Động: {activeCutoffStr} Sáng (Giờ VN)
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

            {/* Right Side: Cohesive Segmented KPI Stat Bar - Fully responsive 2x2 on mobile, 4 in row on tablet/desktop */}
            <div className="w-full xl:w-auto grid grid-cols-2 sm:grid-cols-4 xl:flex xl:items-center bg-slate-50 dark:bg-slate-950 p-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 gap-1.5 shrink-0">
              <div className="px-2.5 py-1.5 text-center bg-white dark:bg-slate-900/60 rounded-xl border border-slate-200/60 dark:border-slate-800/60 shadow-2xs">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Tổng Nhân Sự</div>
                {loading ? (
                  <div className="w-10 h-4 mx-auto rounded bg-slate-200 dark:bg-slate-800 animate-pulse mt-1" />
                ) : (
                  <div className="text-xs sm:text-sm font-black text-slate-900 dark:text-white mt-0.5">{summary.totalStaff} NV</div>
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
                  <div className="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{summary.fullWorkdayCount}</div>
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
                  <div className="text-xs sm:text-sm font-black text-amber-600 dark:text-amber-400 mt-0.5">{summary.halfWorkdayCount}</div>
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
                  <div className="text-xs sm:text-sm font-black text-rose-600 dark:text-rose-400 mt-0.5">{summary.zeroWorkdayCount}</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Filter & Toolbar Box */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-3.5 sm:p-4 shadow-sm space-y-3.5">
          {/* Row 1: Mode Switcher & Time Presets */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* View Mode Toggle */}
            <div className="w-full sm:w-auto grid grid-cols-2 gap-1.5 bg-slate-100 dark:bg-slate-950 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 self-start">
              <button
                type="button"
                onClick={() => setViewMode("daily")}
                className={`px-3 py-2 sm:px-3.5 sm:py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-center flex items-center justify-center gap-1.5 min-w-0 ${viewMode === "daily"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
              >
                <span className="shrink-0">📅</span>
                <span className="truncate whitespace-nowrap">Theo Ngày (Roll Call)</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("range")}
                className={`px-3 py-2 sm:px-3.5 sm:py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-center flex items-center justify-center gap-1.5 min-w-0 ${viewMode === "range"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
              >
                <span className="shrink-0">📈</span>
                <span className="truncate whitespace-nowrap">Khoảng Ngày (Timesheet)</span>
              </button>
            </div>

            {/* Quick Date Presets */}
            {viewMode === "range" ? (
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto max-w-full scrollbar-none py-1">
                {[
                  { id: "7d", label: "7 Ngày", action: () => applyRangePreset(7, "7d") },
                  { id: "28d", label: "28 Ngày", action: () => applyRangePreset(28, "28d") },
                  { id: "60d", label: "60 Ngày", action: () => applyRangePreset(60, "60d") },
                  { id: "month", label: "Tháng Này", action: applyThisMonth },
                  { id: "365d", label: "365 Ngày", action: () => applyRangePreset(365, "365d") },
                ].map((p) => {
                  const isActive = activeRangePreset === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={p.action}
                      className={`px-3 py-1 rounded-lg text-xs font-normal transition-all cursor-pointer whitespace-nowrap shrink-0 ${isActive
                        ? "bg-amber-500 text-slate-950 shadow-sm font-medium"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-800/60"
                        }`}
                    >
                      {p.label}
                    </button>
                  );
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
                      className={`px-3 py-1 rounded-lg text-xs font-normal transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${activeRangePreset === "custom"
                        ? "bg-amber-500 text-slate-950 shadow-sm font-medium"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-800/60"
                        }`}
                    >
                      <CalendarIcon className="w-3.5 h-3.5" />
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
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        Chọn khoảng ngày chấm công
                      </span>
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
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto max-w-full scrollbar-none py-1">
                <button
                  type="button"
                  onClick={() => setDateStr(todayStr)}
                  className={`px-3 py-1 rounded-lg text-xs font-normal transition-all cursor-pointer whitespace-nowrap shrink-0 ${isDailyToday
                    ? "bg-amber-500 text-slate-950 shadow-sm font-medium"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-800/60"
                    }`}
                >
                  Hôm nay
                </button>
                <button
                  type="button"
                  onClick={() => setDateStr(yesterdayStr)}
                  className={`px-3 py-1 rounded-lg text-xs font-normal transition-all cursor-pointer whitespace-nowrap shrink-0 ${isDailyYesterday
                    ? "bg-amber-500 text-slate-950 shadow-sm font-medium"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-800/60"
                    }`}
                >
                  Hôm qua
                </button>

                {/* Custom Date Popover Tab Button */}
                <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={`px-3 py-1 rounded-lg text-xs font-normal transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${isDailyCustom
                        ? "bg-amber-500 text-slate-950 shadow-sm font-medium"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-800/60"
                        }`}
                    >
                      <CalendarIcon className="w-3.5 h-3.5" />
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
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Chọn ngày chấm công
                      </span>
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

          {/* Row 2: Search, User Selector, Score Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search Input - Compact fixed width for optimal balance */}
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
              {/* Staff / Operator Selector */}
              <div className="w-full sm:w-60 md:w-64">
                <Select
                  value={selectedUserId}
                  onValueChange={(val) => setSelectedUserId(val)}
                >
                  <SelectTrigger className="w-full h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 cursor-pointer [&>span]:truncate whitespace-nowrap">
                    <SelectValue placeholder="Tất cả nhân sự" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl max-h-72">
                    <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">
                      👥 Tất cả nhân sự ({staffList.length} thành viên)
                    </SelectItem>
                    {staffList.map((s: any) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs font-normal cursor-pointer">
                        {s.fullName} (@{s.username}) — {s.role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Score Filter */}
              <div className="w-full sm:w-40 md:w-44">
                <Select
                  value={scoreFilter}
                  onValueChange={(val: any) => setScoreFilter(val)}
                >
                  <SelectTrigger className="w-full h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 cursor-pointer [&>span]:truncate whitespace-nowrap">
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
              </div>

              {/* Quick Reset Filters Button when any filter active */}
              {(search || selectedUserId !== "ALL" || scoreFilter !== "ALL") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setSelectedUserId("ALL");
                    setScoreFilter("ALL");
                  }}
                  className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-900 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer shrink-0 flex items-center justify-center gap-1.5"
                  title="Đặt lại bộ lọc"
                >
                  <X className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Đặt lại</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick Row Expansion control */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              <span>Hiển thị</span>
              {loading ? (
                <span className="inline-block w-8 h-4 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
              ) : (
                <strong>{timesheetData?.checklists?.length || 0}</strong>
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
        </div>
      </div>

      {/* Main Timesheet Table */}
      {loading ? (
        <DataTableSkeleton columnCount={8} rowCount={8} />
      ) : timesheetData?.checklists.length === 0 ? (
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
            <table className="w-full text-left text-xs border-collapse min-w-[980px]">
              <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-slate-600 dark:text-slate-300 font-semibold text-xs border-b border-slate-200 dark:border-slate-800 select-none normal-case">
                <tr>
                  <th className="py-3.5 px-3 w-10 text-center">#</th>
                  {viewMode === "range" && <th className="py-3.5 px-3 w-28">Ngày chấm</th>}
                  <th className="py-3.5 px-4">Nhân sự</th>
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
                {(timesheetData?.checklists || []).map((chk: any, idx: number) => {
                  const isExpanded = expandedRowIds.has(chk.id);
                  const totalAcc = chk.items.length;
                  const postedCount = chk.items.filter((i: any) => i.isPosted).length;
                  const syncedCount = chk.items.filter((i: any) => i.isSynced).length;
                  const rate = Number(chk.completionRate || 0);
                  const score = Number(chk.workdayScore || 0);
                  const dateFormatted = format(new Date(chk.date), "dd/MM/yyyy");

                  return (
                    <tr key={chk.id} className="group hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                      <td colSpan={viewMode === "range" ? 10 : 9} className="p-0">
                        {/* Master Staff Row */}
                        <div className="flex items-center w-full py-3 px-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                          {/* Col 0: Index */}
                          <div className="w-10 text-center text-slate-400 font-mono text-xs shrink-0">
                            {idx + 1}
                          </div>

                          {/* Range Mode: Date */}
                          {viewMode === "range" && (
                            <div className="w-28 px-2 font-mono text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0">
                              {dateFormatted}
                            </div>
                          )}

                          {/* Col 1: Staff Info */}
                          <div className="flex-1 min-w-[200px] px-3 flex items-center gap-2.5">
                            <Link
                              href={`/users/${chk.user.id}`}
                              className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-pink-500 text-white font-bold text-xs flex items-center justify-center uppercase shrink-0 shadow-xs hover:scale-105 transition-transform"
                            >
                              {chk.user.fullName.slice(0, 2)}
                            </Link>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <Link
                                  href={`/users/${chk.user.id}`}
                                  className="font-bold text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline transition-colors truncate"
                                >
                                  {chk.user.fullName}
                                </Link>
                                {getRoleBadge(chk.user.role)}
                              </div>
                              <div className="text-xs font-mono text-slate-400 truncate">
                                @{chk.user.username}
                              </div>
                            </div>
                          </div>

                          {/* Col 2: Total Accounts */}
                          <div className="w-28 text-center px-2 shrink-0">
                            <span className="font-extrabold text-slate-800 dark:text-slate-200">
                              {totalAcc}
                            </span>{" "}
                            <span className="text-slate-400 text-xs">accounts</span>
                          </div>

                          {/* Col 3: Posted Count */}
                          <div className="w-28 text-center px-2 shrink-0">
                            <span
                              className={`inline-flex items-center gap-1 font-bold ${postedCount === totalAcc && totalAcc > 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-slate-700 dark:text-slate-300"
                                }`}
                            >
                              <Video className="w-3.5 h-3.5 text-pink-500" />
                              {postedCount}/{totalAcc}
                            </span>
                          </div>

                          {/* Col 4: Synced GPM Count */}
                          <div className="w-28 text-center px-2 shrink-0">
                            <span
                              className={`inline-flex items-center gap-1 font-bold ${syncedCount === totalAcc && totalAcc > 0
                                ? "text-cyan-600 dark:text-cyan-400"
                                : "text-slate-700 dark:text-slate-300"
                                }`}
                            >
                              <RefreshCw className="w-3.5 h-3.5 text-cyan-500" />
                              {syncedCount}/{totalAcc}
                            </span>
                          </div>

                          {/* Col 5: Completion Progress */}
                          <div className="w-44 px-3 shrink-0">
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
                          </div>

                          {/* Col 6: Workday Score Badge */}
                          <div className="w-40 text-center px-2 shrink-0">
                            {getWorkdayBadge(score, rate)}
                          </div>

                          {/* Col 7: Accordion Expand Chi Tiết Button */}
                          <div className="w-28 text-center px-2 shrink-0">
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
                          </div>

                          {/* Col 8: More Actions Dropdown */}
                          <div className="w-28 text-center px-2 shrink-0 flex justify-center">
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

                                {isAdmin ? (
                                  <DropdownMenuItem
                                    onClick={() => handleAdminCheckComplete(chk.id, chk.user.fullName)}
                                    className="flex items-center gap-2.5 px-3 py-2 text-xs font-normal text-emerald-600 dark:text-emerald-400 cursor-pointer rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                                  >
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                    <span>Check Hoàn Thành (1.0 Công)</span>
                                  </DropdownMenuItem>
                                ) : (
                                  <div className="px-3 py-1.5 text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5 italic">
                                    <Shield className="w-3.5 h-3.5 shrink-0" />
                                    <span>Chỉ Admin mới được duyệt công</span>
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
                        </div>

                        {/* Expandable Inner Sub-Table: Assigned Accounts for this staff */}
                        {isExpanded && (
                          <div className="bg-slate-50/90 dark:bg-slate-950/80 p-4 border-t border-b border-slate-200/80 dark:border-slate-800/80 animate-in slide-in-from-top-2 duration-200">
                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
                              <div className="px-4 py-2.5 bg-slate-100/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                                <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                  <Users className="w-4 h-4 text-pink-500" />
                                  <span>Danh sách {chk.items.length} tài khoản giao việc cho {chk.user.fullName}</span>
                                </div>
                                <div className="text-xs text-slate-400">
                                  Bấm vào các ô Đã đăng / Đã sync để chấm công trực tiếp
                                </div>
                              </div>

                              {chk.items.length === 0 ? (
                                <div className="p-6 text-center text-xs text-slate-400">
                                  Nhân viên này chưa được gán tài khoản TikTok nào. Vui lòng vào trang Quản lý tài khoản để phân công.
                                </div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-xs min-w-[720px]">
                                    <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-slate-600 dark:text-slate-300 font-semibold text-xs border-b border-slate-100 dark:border-slate-800 normal-case">
                                      <tr>
                                        <th className="py-2.5 px-4">Tài khoản TikTok</th>
                                        <th className="py-2.5 px-4 text-center">Đã đăng video</th>
                                        <th className="py-2.5 px-4 text-center">Đã sync GPM</th>
                                        <th className="py-2.5 px-4 text-center">Trạng thái KPI</th>
                                        <th className="py-2.5 px-4">Giờ đăng & tiêu đề video mới nhất</th>
                                        <th className="py-2.5 px-4">Ghi chú vận hành</th>
                                        <th className="py-2.5 px-4 text-right">Thao tác</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                      {chk.items.map((item: any) => {
                                        const isItemCompleted = item.isCompleted || (item.isPosted && item.isSynced);
                                        const lastSyncFormatted = item.account.lastSyncedAt
                                          ? format(new Date(item.account.lastSyncedAt), "HH:mm dd/MM")
                                          : "Chưa sync";

                                        return (
                                          <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                                            {/* Account Name & Link */}
                                            <td className="py-3 px-4">
                                              <div className="flex items-center gap-2">
                                                {getCountryBadge(item.account.country)}
                                                <div>
                                                  <Link
                                                    href={`/accounts/${item.account.id}`}
                                                    className="font-bold text-slate-900 dark:text-white hover:text-pink-600 dark:hover:text-pink-400 hover:underline transition-colors"
                                                  >
                                                    @{item.account.username}
                                                  </Link>
                                                  <div className="text-xs text-slate-400">
                                                    Views: {Number(item.account.totalViews || 0).toLocaleString()} • Rev: ${Number(item.account.totalRevenue || 0).toFixed(2)}
                                                  </div>
                                                </div>
                                              </div>
                                            </td>

                                            {/* Toggle Posted */}
                                            <td className="py-3 px-4 text-center">
                                              <button
                                                onClick={() => handleToggleItemField(item, "isPosted")}
                                                className={`w-7.5 h-7.5 rounded-xl border flex items-center justify-center mx-auto transition-all cursor-pointer shadow-2xs ${item.isPosted
                                                  ? "bg-emerald-500 border-emerald-500 text-white"
                                                  : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-transparent hover:border-emerald-400"
                                                  }`}
                                              >
                                                <Check className="w-4 h-4 stroke-[3]" />
                                              </button>
                                            </td>

                                            {/* Toggle Synced */}
                                            <td className="py-3 px-4 text-center">
                                              <button
                                                onClick={() => handleToggleItemField(item, "isSynced")}
                                                className={`w-7.5 h-7.5 rounded-xl border flex items-center justify-center mx-auto transition-all cursor-pointer shadow-2xs ${item.isSynced
                                                  ? "bg-cyan-500 border-cyan-500 text-white"
                                                  : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-transparent hover:border-cyan-400"
                                                  }`}
                                              >
                                                <RefreshCw className="w-3.5 h-3.5 stroke-[2.5]" />
                                              </button>
                                            </td>

                                            {/* KPI Status */}
                                            <td className="py-3 px-4 text-center">
                                              {isItemCompleted ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 h-7.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shadow-2xs">
                                                  <CheckCircle2 className="w-3.5 h-3.5" /> Đạt KPI
                                                </span>
                                              ) : (
                                                <span className="inline-flex items-center gap-1 px-2.5 h-7.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700 shadow-2xs">
                                                  Chưa đạt
                                                </span>
                                              )}
                                            </td>

                                            {/* Latest Video Time & Title */}
                                            <td className="py-3 px-4 min-w-[220px]">
                                              <div className="space-y-0.5">
                                                <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 font-bold text-xs">
                                                  <Video className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                                                  <span>
                                                    {item.notes?.includes("lúc")
                                                      ? item.notes.split("•")[0].trim()
                                                      : item.isPosted
                                                        ? `Đã đăng video hôm nay`
                                                        : "Chưa phát hiện video mới"}
                                                  </span>
                                                </div>
                                                <div className="text-xs text-slate-400">
                                                  Sync Live gần nhất: <strong>{lastSyncFormatted}</strong>
                                                </div>
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
                        )}
                      </td>
                    </tr>
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
                    "🎬 Video đăng lúc 10:00 AM",
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
    </div>
  );
}
