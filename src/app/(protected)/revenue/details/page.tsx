"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import Link from "next/link";
import { useUrlParams } from "@/hooks/useUrlState";
import { useSession } from "next-auth/react";
import {
  DollarSign,
  Search,
  Filter,
  ArrowLeft,
  Download,
  Upload,
  Calendar,
  X,
  SlidersHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  FileSpreadsheet,
  Check,
  Columns3,
  Edit2,
  Trash2,
  Loader2,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Pagination } from "@/components/ui/pagination";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { format, subDays } from "date-fns";
import { DateRange } from "react-day-picker";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { useCurrency } from "@/contexts/CurrencyContext";

type RevenueSortKey =
  | "accountUsername"
  | "assignedUser"
  | "date"
  | "views"
  | "rpm"
  | "revenue"
  | "sourceType";

const REVENUE_SORT_OPTIONS: Array<{ key: RevenueSortKey; label: string }> = [
  { key: "date", label: "Ngày ghi nhận" },
  { key: "revenue", label: "Doanh thu ($)" },
  { key: "views", label: "Lượt xem (Views)" },
  { key: "rpm", label: "RPM ($)" },
  { key: "accountUsername", label: "Tài khoản" },
  { key: "assignedUser", label: "Người phụ trách" },
  { key: "sourceType", label: "Nguồn thu" },
];

function RevenueDetailsPageContent() {
  const { currency, formatAmount } = useCurrency();
  // SaaS URL Query State Synchronization
  const { searchParams, updateUrlParams } = useUrlParams();

  const initialSearch = searchParams?.get("q") || searchParams?.get("search") || "";
  const [search, setSearch] = useState(initialSearch);

  const initialSource = searchParams?.get("source") || "ALL";
  const [sourceTypeFilter, setSourceTypeFilter] = useState(initialSource);

  const initialFrom = searchParams?.get("from") || "";
  const initialTo = searchParams?.get("to") || "";
  const [startDate, setStartDate] = useState(initialFrom);
  const [endDate, setEndDate] = useState(initialTo);

  const [isRangePickerOpen, setIsRangePickerOpen] = useState(false);
  const [rangeSelection, setRangeSelection] = useState<DateRange | undefined>(() => {
    if (initialFrom && initialTo) {
      return { from: new Date(initialFrom + "T00:00:00"), to: new Date(initialTo + "T00:00:00") };
    }
    const to = new Date();
    const from = subDays(to, 27);
    return { from, to };
  });

  const initialMinRev = searchParams?.get("minRev") || searchParams?.get("minRevenue") || "";
  const [minRevenue, setMinRevenue] = useState(initialMinRev);

  const initialMinV = searchParams?.get("minV") || searchParams?.get("minViews") || "";
  const [minViews, setMinViews] = useState(initialMinV);

  const initialSortKey = (searchParams?.get("sort") || searchParams?.get("sortBy") || "date") as RevenueSortKey;
  const initialSortDesc = (searchParams?.get("dir") || searchParams?.get("sortOrder")) === "asc" ? false : true;
  const [sortConfig, setSortConfig] = useState<{ key: RevenueSortKey; desc: boolean }>({
    key: initialSortKey,
    desc: initialSortDesc,
  });

  const currentSortOption = useMemo(() => {
    return REVENUE_SORT_OPTIONS.find((opt) => opt.key === sortConfig.key) || { key: sortConfig.key, label: "Mặc định" };
  }, [sortConfig.key]);

  const sortDirectionText = sortConfig.desc ? "Giảm dần" : "Tăng dần";

  const initialPage = Number(searchParams?.get("p") || searchParams?.get("page")) || 1;
  const initialPageSize = Number(searchParams?.get("ps") || searchParams?.get("pageSize")) || 15;
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // Auto sync active state to URL
  useEffect(() => {
    updateUrlParams(
      {
        q: search,
        source: sourceTypeFilter,
        from: startDate,
        to: endDate,
        minRev: minRevenue,
        minV: minViews,
        sort: sortConfig.key,
        dir: sortConfig.desc ? "desc" : "asc",
        p: page,
        ps: pageSize,
      },
      {
        q: "",
        source: "ALL",
        from: "",
        to: "",
        minRev: "",
        minV: "",
        sort: "date",
        dir: "desc",
        p: 1,
        ps: 15,
      }
    );
  }, [
    search,
    sourceTypeFilter,
    startDate,
    endDate,
    minRevenue,
    minViews,
    sortConfig,
    page,
    pageSize,
    updateUrlParams,
  ]);

  // Column visibility state (accountUsername is locked and cannot be unchecked)
  const [visibleColumns, setVisibleColumns] = useState({
    accountUsername: true,
    assignedUser: true,
    date: true,
    views: true,
    rpm: true,
    revenue: true,
    sourceType: true,
  });

  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN" || (session?.user as any)?.userType === "ADMIN";
  const isLeadOrAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "LEAD";

  const visibleColumnCount = useMemo(() => {
    return 1 /* checkbox */ + Object.values(visibleColumns).filter(Boolean).length + 1 /* Thao tác */;
  }, [visibleColumns]);

  // Selection & Actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Edit / Delete states
  const [editingRecord, setEditingRecord] = useState<any | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editViews, setEditViews] = useState<number | string>(0);
  const [editRpm, setEditRpm] = useState<number | string>(0);
  const [editRevenue, setEditRevenue] = useState<number | string>(0);
  const [editSourceType, setEditSourceType] = useState("CREATOR_REWARDS");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const bulkDeleteMutation = trpc.revenue.bulkDelete.useMutation();
  const updateRecordMutation = trpc.revenue.updateRecord.useMutation();

  const applyPresetRange = (days: number) => {
    if (days === 0) {
      setStartDate("");
      setEndDate("");
    } else {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - days);
      setStartDate(format(start, "yyyy-MM-dd"));
      setEndDate(format(end, "yyyy-MM-dd"));
    }
    setPage(1);
  };

  const getActivePreset = () => {
    if (!startDate && !endDate) return 0;
    const todayStr = format(new Date(), "yyyy-MM-dd");
    if (endDate === todayStr) {
      const end = new Date();
      const start = new Date(startDate + "T00:00:00");
      const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (Math.abs(diffDays - 7) <= 1) return 7;
      if (Math.abs(diffDays - 28) <= 1) return 28;
      if (Math.abs(diffDays - 60) <= 1) return 60;
      if (Math.abs(diffDays - 365) <= 2) return 365;
    }
    return -1;
  };

  const utils = trpc.useUtils();

  const { data: records = [], isLoading: loading } = trpc.revenue.listDetails.useQuery({
    search: search || undefined,
    sourceType: sourceTypeFilter !== "ALL" ? sourceTypeFilter : undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  // Handle Excel/CSV file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setActionMsg("⏳ Đang xử lý file dữ liệu...");

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        // Map records
        const fileRecords = data.map((row) => ({
          username:
            row.Username ||
            row.username ||
            row["Tài khoản"] ||
            row["Account Name"] ||
            "",
          date:
            row.Date ||
            row.date ||
            row["Ngày"] ||
            new Date().toISOString().split("T")[0],
          views: parseInt(row.Views || row.views || row["Lượt xem"] || "0", 10),
          rpm: parseFloat(row.RPM || row.rpm || "0"),
          revenue: parseFloat(
            row.Revenue || row.revenue || row["Doanh thu ($)"] || row["Tiền"] || "0"
          ),
          sourceType: row.Source || "CREATOR_REWARDS",
        }));

        const res = await fetch("/api/revenue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ records: fileRecords }),
        });

        const resJson = await res.json();
        if (resJson.success) {
          setActionMsg(`✅ ${resJson.message}`);
          utils.revenue.listDetails.invalidate();
          utils.revenue.getOverview.invalidate();
        } else {
          setActionMsg(`❌ ${resJson.error || "Lỗi import"}`);
        }
      } catch (err: any) {
        setActionMsg(`❌ Lỗi đọc file: ${err.message}`);
      } finally {
        setImporting(false);
        setTimeout(() => setActionMsg(null), 5000);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleSort = (key: RevenueSortKey) => {
    setSortConfig((prev) => ({
      key,
      desc: prev.key === key ? !prev.desc : false,
    }));
  };

  // Filtered and sorted
  const filteredAndSortedRecords = useMemo(() => {
    const s = search.toLowerCase().trim();

    const filtered = records.filter((r: any) => {
      const username = (r.account?.username || "").toLowerCase();
      const staffName = (r.account?.assignedUser?.fullName || r.account?.assignedUser?.name || "").toLowerCase();
      const matchSearch = !s || username.includes(s) || staffName.includes(s);

      const matchSource = sourceTypeFilter === "ALL" || r.sourceType === sourceTypeFilter;

      const rev = Number(r.revenue || 0);
      const matchMinRev = !minRevenue || rev >= Number(minRevenue);

      const v = Number(r.views || 0);
      const matchMinViews = !minViews || v >= Number(minViews);

      return matchSearch && matchSource && matchMinRev && matchMinViews;
    });

    filtered.sort((a: any, b: any) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      if (sortConfig.key === "accountUsername") {
        aVal = (a.account?.username || "").toLowerCase();
        bVal = (b.account?.username || "").toLowerCase();
      } else if (sortConfig.key === "assignedUser") {
        aVal = (a.account?.assignedUser?.fullName || a.account?.assignedUser?.name || "").toLowerCase();
        bVal = (b.account?.assignedUser?.fullName || b.account?.assignedUser?.name || "").toLowerCase();
      } else if (sortConfig.key === "date") {
        aVal = new Date(a.date).getTime();
        bVal = new Date(b.date).getTime();
      } else if (sortConfig.key === "views" || sortConfig.key === "revenue" || sortConfig.key === "rpm") {
        aVal = Number(aVal || 0);
        bVal = Number(bVal || 0);
      } else {
        aVal = (aVal || "").toString().toLowerCase();
        bVal = (bVal || "").toString().toLowerCase();
      }

      if (aVal < bVal) return sortConfig.desc ? 1 : -1;
      if (aVal > bVal) return sortConfig.desc ? -1 : 1;
      return 0;
    });

    return filtered;
  }, [records, search, sourceTypeFilter, minRevenue, minViews, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedRecords.length / pageSize));
  const paginatedRecords = useMemo(() => {
    return filteredAndSortedRecords.slice(
      (page - 1) * pageSize,
      page * pageSize
    );
  }, [filteredAndSortedRecords, page, pageSize]);

  // Bulk selection helpers
  const isAllPageSelected =
    paginatedRecords.length > 0 &&
    paginatedRecords.every((r: any) => selectedIds.has(r.id));

  const toggleSelectAll = (checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) {
      paginatedRecords.forEach((r: any) => next.add(r.id));
    } else {
      paginatedRecords.forEach((r: any) => next.delete(r.id));
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

  // Export to Excel
  const handleExportExcel = (onlySelected = false) => {
    const dataToExport = onlySelected
      ? records.filter((r: any) => selectedIds.has(r.id))
      : filteredAndSortedRecords;

    if (dataToExport.length === 0) {
      alert("Không có dữ liệu để xuất file!");
      return;
    }

    const rows = dataToExport.map((r: any) => ({
      "Tài khoản": `@${r.account?.username || ""}`,
      "Người phụ trách": r.account?.assignedUser?.fullName || r.account?.assignedUser?.name || "Chưa gán",
      "Ngày": r.date ? r.date.slice(0, 10) : "",
      "Lượt xem (Views)": Number(r.views || 0),
      "RPM ($)": Number(r.rpm || 0),
      "Doanh thu ($)": Number(r.revenue || 0),
      "Nguồn thu": r.sourceType || "CREATOR_REWARDS",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ChiTietDoanhThu");
    XLSX.writeFile(wb, `DoanhThu_TikTok_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Action handlers
  const openEditModal = (item: any) => {
    setEditingRecord(item);
    setEditDate(item.date ? item.date.slice(0, 10) : "");
    setEditViews(Number(item.views || 0));
    setEditRpm(Number(item.rpm || 0));
    setEditRevenue(Number(item.revenue || 0));
    setEditSourceType(item.sourceType || "CREATOR_REWARDS");
  };

  const handleSaveEdit = async () => {
    if (!editingRecord) return;
    try {
      setIsSavingEdit(true);
      await updateRecordMutation.mutateAsync({
        id: editingRecord.id,
        date: editDate || undefined,
        views: Number(editViews) || 0,
        rpm: Number(editRpm) || 0,
        revenue: Number(editRevenue) || 0,
        sourceType: editSourceType,
      });
      setActionMsg("✅ Cập nhật bản ghi doanh thu thành công!");
      utils.revenue.listDetails.invalidate();
      utils.revenue.getOverview.invalidate();
      setEditingRecord(null);
    } catch (err: any) {
      setActionMsg(`❌ Lỗi cập nhật: ${err.message}`);
    } finally {
      setIsSavingEdit(false);
      setTimeout(() => setActionMsg(null), 4000);
    }
  };

  const handleDeleteSingle = async (item: any) => {
    if (item.id.startsWith("auto-")) {
      alert("Bản ghi này được đồng bộ tự động từ Analytics, không thể xóa trực tiếp.");
      return;
    }
    if (!confirm(`Bạn có chắc chắn muốn xóa bản ghi doanh thu ngày ${item.date ? item.date.slice(0, 10) : ""} của @${item.account?.username}?`)) return;
    try {
      setDeletingId(item.id);
      await bulkDeleteMutation.mutateAsync({ ids: [item.id] });
      setActionMsg("✅ Đã xóa bản ghi doanh thu!");
      selectedIds.delete(item.id);
      setSelectedIds(new Set(selectedIds));
      utils.revenue.listDetails.invalidate();
      utils.revenue.getOverview.invalidate();
    } catch (err: any) {
      setActionMsg(`❌ Lỗi xóa: ${err.message}`);
    } finally {
      setDeletingId(null);
      setTimeout(() => setActionMsg(null), 4000);
    }
  };

  const handleBulkDelete = async () => {
    const realIds = Array.from(selectedIds).filter((id) => !id.startsWith("auto-"));
    if (realIds.length === 0) {
      alert("Các bản ghi đã chọn đều là bản ghi tự động từ Analytics, không thể xóa thủ công.");
      return;
    }
    if (!confirm(`Bạn có chắc chắn muốn xóa ${realIds.length} bản ghi doanh thu đã chọn?`)) return;
    try {
      setIsDeletingBulk(true);
      await bulkDeleteMutation.mutateAsync({ ids: realIds });
      setActionMsg(`✅ Đã xóa thành công ${realIds.length} bản ghi!`);
      setSelectedIds(new Set());
      utils.revenue.listDetails.invalidate();
      utils.revenue.getOverview.invalidate();
    } catch (err: any) {
      setActionMsg(`❌ Lỗi xóa hàng loạt: ${err.message}`);
    } finally {
      setIsDeletingBulk(false);
      setTimeout(() => setActionMsg(null), 4000);
    }
  };

  // Total active filters count across all inputs
  const activeFiltersCount =
    (search ? 1 : 0) +
    (sourceTypeFilter !== "ALL" ? 1 : 0) +
    (startDate ? 1 : 0) +
    (endDate ? 1 : 0) +
    (minRevenue ? 1 : 0) +
    (minViews ? 1 : 0);

  // Filters count for Advanced Filter Popover (minRevenue, minViews)
  const advancedFiltersCount = (minRevenue ? 1 : 0) + (minViews ? 1 : 0);

  const clearAdvancedFilters = () => {
    setMinRevenue("");
    setMinViews("");
    setPage(1);
  };

  const clearAllFilters = () => {
    setSearch("");
    setSourceTypeFilter("ALL");
    setStartDate("");
    setEndDate("");
    setMinRevenue("");
    setMinViews("");
    setPage(1);
  };

  const renderSortIndicator = (key: RevenueSortKey) => {
    if (sortConfig.key !== key) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60 group-hover:opacity-100 transition-opacity" />;
    }
    return sortConfig.desc ? (
      <ArrowDown className="w-3.5 h-3.5 text-amber-500" />
    ) : (
      <ArrowUp className="w-3.5 h-3.5 text-amber-500" />
    );
  };

  // Total summary of current filtered
  const filteredTotalRevenue = useMemo(() => {
    return filteredAndSortedRecords.reduce((sum: number, r: any) => sum + Number(r.revenue || 0), 0);
  }, [filteredAndSortedRecords]);
  const filteredTotalViews = useMemo(() => {
    return filteredAndSortedRecords.reduce((sum: number, r: any) => sum + Number(r.views || 0), 0);
  }, [filteredAndSortedRecords]);

  return (
    <div className="space-y-6 w-full pb-20">
      {/* Header & Controls Section */}
      <div className="space-y-4">
        {/* Top Header */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/revenue"
                  className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer shadow-xs shrink-0"
                  aria-label="Quay lại Tổng Quan Doanh Thu"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs font-semibold">
                Quay lại Tổng Quan Doanh Thu
              </TooltipContent>
            </Tooltip>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2 min-w-0">
                <DollarSign className="w-6 h-6 text-amber-500 shrink-0" />
                <span className="truncate" title={`Chi Tiết Bản Ghi Doanh Thu Từng Account (${records.length})`}>
                  Chi Tiết Bản Ghi Doanh Thu Từng Account{" "}
                  {loading ? (
                    <span className="inline-block w-10 h-6 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse align-middle" />
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400 font-bold">({records.length})</span>
                  )}
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                Bảng tra cứu chi tiết từng ngày, hỗ trợ lọc nguồn thu, khoảng ngày, sắp xếp và thao tác hàng loạt.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-nowrap self-start xl:self-auto">
            {/* File Upload Button - Admin Only */}
            {isAdmin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <label className="h-10 flex items-center gap-1.5 px-4 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-cyan-600 dark:text-cyan-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer shadow-xs active:scale-95 whitespace-nowrap shrink-0">
                    <Upload className="w-4 h-4 shrink-0" />
                    <span className="truncate">{importing ? "Đang Import..." : "Import File Excel/CSV"}</span>
                    <input
                      type="file"
                      accept=".csv, .xlsx, .xls"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs font-normal">
                  Nhập file dữ liệu doanh thu (.xlsx, .xls, .csv)
                </TooltipContent>
              </Tooltip>
            )}

            {/* Export Excel Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => handleExportExcel(false)}
                  className="h-10 flex items-center gap-1.5 px-4 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-emerald-600 dark:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer shadow-xs active:scale-95 whitespace-nowrap shrink-0"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span className="truncate">Xuất Excel {loading ? "(...)" : `(${filteredAndSortedRecords.length})`}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-normal">
                Xuất các bản ghi đang lọc ra file Excel (.xlsx)
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {actionMsg && (
          <div className="p-3.5 rounded-xl bg-cyan-50 dark:bg-slate-900 border border-cyan-200 dark:border-slate-800 text-xs font-bold text-center text-cyan-800 dark:text-cyan-300 shadow-sm animate-in fade-in">
            {actionMsg}
          </div>
        )}

        {/* Quick Summary Chips */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase truncate whitespace-nowrap" title="Tổng Doanh Thu (Bộ lọc hiện tại)">
              Tổng Doanh Thu (Bộ lọc hiện tại)
            </div>
            {loading ? (
              <div className="h-8 w-24 bg-amber-100 dark:bg-amber-950/60 rounded-lg animate-pulse mt-1" />
            ) : (
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 truncate">
                {formatAmount(filteredTotalRevenue, "USD")}
              </div>
            )}
          </div>
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase truncate whitespace-nowrap" title="Tổng Views Đủ ĐK">
              Tổng Views Đủ ĐK
            </div>
            {loading ? (
              <div className="h-8 w-24 bg-cyan-100 dark:bg-cyan-950/60 rounded-lg animate-pulse mt-1" />
            ) : (
              <div className="text-2xl font-black text-cyan-600 dark:text-cyan-400 mt-1 truncate">
                {filteredTotalViews.toLocaleString()}
              </div>
            )}
          </div>
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm min-w-0">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase truncate whitespace-nowrap" title="Số Bản Ghi Phù Hợp">
              Số Bản Ghi Phù Hợp
            </div>
            {loading ? (
              <div className="h-8 w-16 bg-pink-100 dark:bg-pink-950/60 rounded-lg animate-pulse mt-1" />
            ) : (
              <div className="text-2xl font-black text-pink-600 dark:text-pink-400 mt-1 truncate">
                {filteredAndSortedRecords.length}
              </div>
            )}
          </div>
        </div>

        {/* Filter & Toolbar Area (Sticky only on desktop) */}
        <div className="lg:sticky lg:top-[72px] z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 w-full">
            {/* Left: Search input & Date presets with Tùy chọn */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
              <div className="relative w-full sm:w-48 lg:w-56 shrink-0">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm username, nhân sự..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="w-full h-9 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-8 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-500 transition-colors"
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

              {/* Quick Presets Chips + Tùy chọn */}
              <div className="flex items-center gap-0.5 sm:gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0">
                {[
                  { value: 7, label: "7 Ngày" },
                  { value: 28, label: "28 Ngày" },
                  { value: 60, label: "60 Ngày" },
                  { value: 365, label: "365 Ngày" },
                  { value: 0, label: "Toàn Bộ" },
                ].map((p) => {
                  const active = getActivePreset() === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => applyPresetRange(p.value)}
                      className={`px-2 sm:px-2.5 py-1 rounded-lg text-xs font-normal transition-all cursor-pointer whitespace-nowrap shrink-0 ${active
                        ? "bg-amber-500 text-slate-950 shadow-xs font-medium"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                    >
                      {p.label}
                    </button>
                  );
                })}

                {/* Tùy chọn Popover */}
                <Popover open={isRangePickerOpen} onOpenChange={setIsRangePickerOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={`px-2 sm:px-2.5 py-1 rounded-lg text-xs font-normal transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${getActivePreset() === -1
                        ? "bg-amber-500 text-slate-950 shadow-xs font-medium"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>
                        {getActivePreset() === -1 && startDate && endDate
                          ? `${format(new Date(startDate + "T00:00:00"), "dd/MM")} - ${format(new Date(endDate + "T00:00:00"), "dd/MM")}`
                          : "Tùy chọn"}
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="bottom"
                    sideOffset={6}
                    align="start"
                    avoidCollisions={false}
                    className="w-[325px] p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50"
                  >
                    <div className="flex items-center justify-between gap-2 pb-2 mb-1 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        Chọn khoảng ngày thống kê
                      </span>
                      {rangeSelection?.from && (
                        <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800 whitespace-nowrap shrink-0">
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
                            setStartDate(s);
                            setEndDate(e);
                            setPage(1);
                          }
                          setIsRangePickerOpen(false);
                        }}
                        className="px-4 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg shadow-sm cursor-pointer transition-all disabled:opacity-50"
                      >
                        Áp dụng
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Right: Tất cả nguồn thu + Bộ lọc nâng cao + Sắp xếp + Cột hiển thị */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap justify-start">
              {/* Source Type Filter */}
              <div className="relative shrink-0">
                <Select
                  value={sourceTypeFilter}
                  onValueChange={(val) => {
                    setSourceTypeFilter(val);
                    setPage(1);
                  }}
                >
                  <SelectTrigger
                    className={`w-36 sm:w-40 h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer whitespace-nowrap [&>span]:truncate transition-colors ${sourceTypeFilter !== "ALL"
                        ? "pr-8 border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/25 text-amber-700 dark:text-amber-300 [&_svg]:hidden"
                        : ""
                      }`}
                  >
                    <SelectValue placeholder="Tất cả nguồn thu" />
                  </SelectTrigger>
                  <SelectContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
                    <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">Tất cả nguồn thu</SelectItem>
                    <SelectItem value="CREATOR_REWARDS" className="text-xs font-normal cursor-pointer">CREATOR_REWARDS</SelectItem>
                    <SelectItem value="AFFILIATE" className="text-xs font-normal cursor-pointer">AFFILIATE</SelectItem>
                    <SelectItem value="SHOP" className="text-xs font-normal cursor-pointer">TIKTOK SHOP</SelectItem>
                    <SelectItem value="OTHER" className="text-xs font-normal cursor-pointer">KHÁC</SelectItem>
                  </SelectContent>
                </Select>
                {sourceTypeFilter !== "ALL" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setSourceTypeFilter("ALL");
                          setPage(1);
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200/90 hover:bg-rose-500 hover:text-white dark:bg-slate-800 dark:hover:bg-rose-500 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all z-10 cursor-pointer shadow-2xs hover:scale-110"
                        aria-label="Xóa chọn nguồn thu"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Xóa chọn nguồn thu</TooltipContent>
                  </Tooltip>
                )}
              </div>

              {/* Advanced Filter Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={`h-9 inline-flex items-center gap-1.5 px-3 rounded-xl text-xs font-normal border transition-all cursor-pointer whitespace-nowrap ${advancedFiltersCount > 0
                      ? "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800"
                      : "bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900"
                      }`}
                  >
                    <Filter className="w-3.5 h-3.5" />
                    <span>Bộ lọc nâng cao</span>
                    {advancedFiltersCount > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              clearAdvancedFilters();
                            }}
                            className="group/badge relative ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-purple-600 hover:bg-rose-600 text-white text-[10px] font-bold transition-colors cursor-pointer shadow-2xs"
                            aria-label="Xóa tất cả bộ lọc nâng cao"
                          >
                            <span className="group-hover/badge:hidden">{advancedFiltersCount}</span>
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
                    {advancedFiltersCount > 0 && (
                      <button
                        onClick={clearAdvancedFilters}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/50 transition-colors cursor-pointer"
                      >
                        Đặt lại
                      </button>
                    )}
                  </div>

                  {/* Doanh thu & Views tối thiểu */}
                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Doanh thu ($) ≥
                      </label>
                      <Input
                        type="number"
                        placeholder="e.g. 10"
                        value={minRevenue}
                        onChange={(e) => {
                          setMinRevenue(e.target.value);
                          setPage(1);
                        }}
                        className="h-8.5 text-xs font-normal bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Views ≥
                      </label>
                      <Input
                        type="number"
                        placeholder="e.g. 5000"
                        value={minViews}
                        onChange={(e) => {
                          setMinViews(e.target.value);
                          setPage(1);
                        }}
                        className="h-8.5 text-xs font-normal bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Sort Popover with background effect & hover tooltip */}
              <Popover>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={`h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl text-xs transition-all cursor-pointer whitespace-nowrap ${sortConfig.key
                            ? "bg-amber-50/80 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/80 hover:bg-amber-100 dark:hover:bg-amber-900/50 shadow-2xs font-medium"
                            : "bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 font-normal"
                          }`}
                      >
                        <SlidersHorizontal className={`w-3.5 h-3.5 ${sortConfig.key ? "text-amber-600 dark:text-amber-400" : "text-slate-500"}`} />
                        <span>Sắp xếp</span>
                        {currentSortOption && (
                          <span className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100/90 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60">
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
                  {REVENUE_SORT_OPTIONS.map((item) => {
                    const isSelected = sortConfig.key === item.key;
                    return (
                      <button
                        key={item.key}
                        onClick={() => handleSort(item.key as RevenueSortKey)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${isSelected
                            ? "bg-amber-50/80 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 font-semibold border border-amber-200/80 dark:border-amber-900/60"
                            : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent font-normal"
                          }`}
                      >
                        <span>{item.label}</span>
                        {isSelected && (
                          <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                            {sortConfig.desc ? "Giảm dần ↓" : "Tăng dần ↑"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </PopoverContent>
              </Popover>

              {/* Column Visibility Popover */}
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
                          accountUsername: true,
                          assignedUser: true,
                          date: true,
                          views: true,
                          rpm: true,
                          revenue: true,
                          sourceType: true,
                        })
                      }
                      className="text-xs text-pink-500 hover:underline font-normal cursor-pointer"
                    >
                      Mặc định
                    </button>
                  </div>
                  <div className="space-y-1 pt-1 max-h-64 overflow-y-auto pr-1">
                    {[
                      { key: "accountUsername", label: "Tài khoản", locked: true },
                      { key: "assignedUser", label: "Người phụ trách" },
                      { key: "date", label: "Ngày" },
                      { key: "views", label: "Lượt views" },
                      { key: "rpm", label: "RPM ($)" },
                      { key: "revenue", label: "Doanh thu ($)" },
                      { key: "sourceType", label: "Nguồn thu" },
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
              {sourceTypeFilter !== "ALL" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                  <span>Nguồn: {sourceTypeFilter}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => setSourceTypeFilter("ALL")} className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/15 hover:text-rose-500 transition-colors cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Xóa bộ lọc</TooltipContent>
                  </Tooltip>
                </span>
              )}
              {startDate && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300">
                  <span>Từ: {format(new Date(startDate + "T00:00:00"), "dd/MM/yyyy")}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => setStartDate("")} className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/15 hover:text-rose-500 transition-colors cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Xóa bộ lọc</TooltipContent>
                  </Tooltip>
                </span>
              )}
              {endDate && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300">
                  <span>Đến: {format(new Date(endDate + "T00:00:00"), "dd/MM/yyyy")}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => setEndDate("")} className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/15 hover:text-rose-500 transition-colors cursor-pointer">
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
              {minViews && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300">
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

      {/* Detailed Table Container */}
      {loading ? (
        <DataTableSkeleton columnCount={visibleColumnCount} rowCount={pageSize} />
      ) : (
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden relative z-0 isolate">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300 min-w-[950px]">
              <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-slate-600 dark:text-slate-300 font-semibold text-xs border-b border-slate-200 dark:border-slate-800 select-none normal-case">
                <tr>
                  {/* Checkbox All - Sticky Left 0 */}
                  <th className="sticky left-0 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs py-3.5 px-4 w-10 after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-slate-200 dark:after:bg-slate-800">
                    <Checkbox
                      checked={isAllPageSelected}
                      onCheckedChange={(val) => toggleSelectAll(!!val)}
                      aria-label="Chọn tất cả trên trang"
                    />
                  </th>

                  {/* Account - Sticky Left 10 */}
                  {visibleColumns.accountUsername && (
                    <th
                      onClick={() => handleSort("accountUsername")}
                      className="sticky left-10 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs px-5 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white border-r border-slate-200 dark:border-slate-800 after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-slate-200 dark:after:bg-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.03)] min-w-[170px]"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Tài khoản</span>
                        {renderSortIndicator("accountUsername")}
                      </div>
                    </th>
                  )}

                  {visibleColumns.assignedUser && (
                    <th
                      onClick={() => handleSort("assignedUser")}
                      className="px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Người phụ trách</span>
                        {renderSortIndicator("assignedUser")}
                      </div>
                    </th>
                  )}

                  {visibleColumns.date && (
                    <th
                      onClick={() => handleSort("date")}
                      className="px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Ngày</span>
                        {renderSortIndicator("date")}
                      </div>
                    </th>
                  )}

                  {visibleColumns.views && (
                    <th
                      onClick={() => handleSort("views")}
                      className="px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Lượt views</span>
                        {renderSortIndicator("views")}
                      </div>
                    </th>
                  )}

                  {visibleColumns.rpm && (
                    <th
                      onClick={() => handleSort("rpm")}
                      className="px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>RPM ($)</span>
                        {renderSortIndicator("rpm")}
                      </div>
                    </th>
                  )}

                  {visibleColumns.revenue && (
                    <th
                      onClick={() => handleSort("revenue")}
                      className="px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Doanh thu ($)</span>
                        {renderSortIndicator("revenue")}
                      </div>
                    </th>
                  )}

                  {visibleColumns.sourceType && (
                    <th
                      onClick={() => handleSort("sourceType")}
                      className="px-5 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Nguồn thu</span>
                        {renderSortIndicator("sourceType")}
                      </div>
                    </th>
                  )}

                  {/* Actions Column - Sticky Right 0 */}
                  <th className="sticky right-0 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs border-l border-slate-200 dark:border-slate-800 after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-slate-200 dark:after:bg-slate-800 shadow-[-2px_0_5px_rgba(0,0,0,0.03)] px-4 py-3.5 text-center min-w-[100px]">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {paginatedRecords.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumnCount} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                      Không tìm thấy bản ghi doanh thu nào phù hợp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  paginatedRecords.map((item: any) => {
                    const isSelected = selectedIds.has(item.id);
                    const isAuto = item.id.startsWith("auto-");

                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors ${isSelected
                          ? "bg-amber-50/40 dark:bg-amber-950/20"
                          : "hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                          }`}
                      >
                        {/* Checkbox - Sticky Left 0 */}
                        <td className={`sticky left-0 z-10 py-3.5 px-4 backdrop-blur-xs ${isSelected ? "bg-amber-50/95 dark:bg-amber-950/90" : "bg-white/95 dark:bg-slate-900/95"}`}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelectRow(item.id)}
                            aria-label={`Chọn bản ghi ${item.id}`}
                          />
                        </td>

                        {/* Account - Sticky Left 10 */}
                        {visibleColumns.accountUsername && (
                          <td className={`sticky left-10 z-10 px-5 py-3.5 font-bold text-slate-900 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.03)] backdrop-blur-xs ${isSelected ? "bg-amber-50/95 dark:bg-amber-950/90" : "bg-white/95 dark:bg-slate-900/95"}`}>
                            @{item.account?.username}
                          </td>
                        )}

                        {/* Staff */}
                        {visibleColumns.assignedUser && (
                          <td className="px-4 py-3.5 text-slate-600 dark:text-slate-400">
                            {item.account?.assignedUser?.fullName ||
                              item.account?.assignedUser?.name ||
                              item.account?.assignedUser?.username ||
                              "Chưa gán"}
                          </td>
                        )}

                        {/* Date */}
                        {visibleColumns.date && (
                          <td className="px-4 py-3.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {item.date ? item.date.slice(0, 10) : "-"}
                          </td>
                        )}

                        {/* Views */}
                        {visibleColumns.views && (
                          <td className="px-4 py-3.5 font-semibold text-slate-800 dark:text-slate-300">
                            {Number(item.views || 0).toLocaleString()}
                          </td>
                        )}

                        {/* RPM */}
                        {visibleColumns.rpm && (
                          <td className="px-4 py-3.5 font-bold text-emerald-600 dark:text-emerald-400">
                            {formatAmount(Number(item.rpm || 0), (item.account as any)?.country || "USD")}
                          </td>
                        )}

                        {/* Revenue */}
                        {visibleColumns.revenue && (
                          <td className="px-4 py-3.5 font-black text-amber-600 dark:text-amber-300">
                            {formatAmount(Number(item.revenue || 0), (item.account as any)?.country || "USD")}
                          </td>
                        )}

                        {/* Source */}
                        {visibleColumns.sourceType && (
                          <td className="px-5 py-3.5">
                            <span className="inline-flex items-center px-2.5 h-7.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-2xs">
                              {item.sourceType}
                            </span>
                          </td>
                        )}

                        {/* Thao tác - Sticky Right 0 */}
                        <td className={`sticky right-0 z-10 px-4 py-3.5 text-center border-l border-slate-200 dark:border-slate-800 shadow-[-2px_0_5px_rgba(0,0,0,0.03)] backdrop-blur-xs ${isSelected ? "bg-amber-50/95 dark:bg-amber-950/90" : "bg-white/95 dark:bg-slate-900/95"}`}>
                          {isAuto ? (
                            <span className="text-[11px] text-slate-400 italic" title="Bản ghi đồng bộ tự động từ Analytics">
                              Tự động
                            </span>
                          ) : isLeadOrAdmin ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => openEditModal(item)}
                                    className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 transition-colors cursor-pointer"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">Sửa bản ghi</TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => handleDeleteSingle(item)}
                                    disabled={deletingId === item.id}
                                    className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer disabled:opacity-50"
                                  >
                                    {deletingId === item.id ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-500" />
                                    ) : (
                                      <Trash2 className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">Xóa bản ghi</TooltipContent>
                              </Tooltip>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
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
              totalItems={filteredAndSortedRecords.length}
              onPageChange={setPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setPage(1);
              }}
              itemLabel="bản ghi"
            />
          </div>
        </div>
      )}

      {/* Floating Bottom Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 px-5 py-3 shadow-2xl shadow-slate-900/10 dark:shadow-black/60 backdrop-blur-md ring-1 ring-slate-100 dark:ring-slate-800 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <span className="text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">
            Đã chọn {selectedIds.size} bản ghi
          </span>
          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            Bỏ chọn
          </button>
          <button
            onClick={() => handleExportExcel(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất đã chọn ({selectedIds.size})</span>
          </button>
          {isLeadOrAdmin && (
            <button
              onClick={handleBulkDelete}
              disabled={isDeletingBulk}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 transition-all cursor-pointer disabled:opacity-50"
            >
              {isDeletingBulk ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              <span>Xóa đã chọn</span>
            </button>
          )}
        </div>
      )}

      {/* Edit Record Modal */}
      {editingRecord && (
        <Dialog open={!!editingRecord} onOpenChange={(open) => !open && setEditingRecord(null)}>
          <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-amber-500" />
                Cập nhật bản ghi doanh thu
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Tài khoản TikTok
                </label>
                <Input
                  value={`@${editingRecord.account?.username || ""}`}
                  readOnly
                  className="bg-slate-100 dark:bg-slate-800 text-slate-500 font-semibold cursor-not-allowed"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Ngày ghi nhận
                  </label>
                  <Input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Nguồn thu
                  </label>
                  <Select value={editSourceType} onValueChange={setEditSourceType}>
                    <SelectTrigger className="w-full h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CREATOR_REWARDS" className="text-xs">CREATOR_REWARDS</SelectItem>
                      <SelectItem value="AFFILIATE" className="text-xs">AFFILIATE</SelectItem>
                      <SelectItem value="SHOP" className="text-xs">TIKTOK SHOP</SelectItem>
                      <SelectItem value="OTHER" className="text-xs">KHÁC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Lượt xem (Views)
                  </label>
                  <Input
                    type="number"
                    value={editViews}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditViews(val);
                      if (editRpm && Number(editRpm) > 0) {
                        setEditRevenue(Math.round(((Number(val) / 1000) * Number(editRpm)) * 100) / 100);
                      }
                    }}
                    className="h-9 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    RPM ($)
                  </label>
                  <Input
                    type="number"
                    step="0.001"
                    value={editRpm}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditRpm(val);
                      if (editViews && Number(editViews) > 0) {
                        setEditRevenue(Math.round(((Number(editViews) / 1000) * Number(val)) * 100) / 100);
                      }
                    }}
                    className="h-9 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Doanh thu ($)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editRevenue}
                    onChange={(e) => setEditRevenue(e.target.value)}
                    className="h-9 text-xs font-bold text-amber-600 dark:text-amber-400"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                className="px-4 py-2 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                {isSavingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Lưu thay đổi
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default function RevenueDetailsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400 text-xs">Đang tải chi tiết doanh thu...</div>}>
      <RevenueDetailsPageContent />
    </Suspense>
  );
}
