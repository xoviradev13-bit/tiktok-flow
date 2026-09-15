"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
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

type RevenueSortKey =
  | "accountUsername"
  | "assignedUser"
  | "date"
  | "views"
  | "rpm"
  | "revenue"
  | "sourceType";

export default function RevenueDetailsPage() {
  const [search, setSearch] = useState("");
  const [sourceTypeFilter, setSourceTypeFilter] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isRangePickerOpen, setIsRangePickerOpen] = useState(false);
  const [rangeSelection, setRangeSelection] = useState<DateRange | undefined>(() => {
    const to = new Date();
    const from = subDays(to, 27);
    return { from, to };
  });
  const [minRevenue, setMinRevenue] = useState("");
  const [minViews, setMinViews] = useState("");

  const [sortConfig, setSortConfig] = useState<{ key: RevenueSortKey; desc: boolean }>({
    key: "date",
    desc: true,
  });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

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

  const visibleColumnCount = useMemo(() => {
    return 1 /* checkbox */ + Object.values(visibleColumns).filter(Boolean).length;
  }, [visibleColumns]);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

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
            {/* File Upload Button */}
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
                ${filteredTotalRevenue.toFixed(2)}
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

        {/* Filter & Toolbar */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-sm">
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
                  className="w-full h-9 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-500"
                />
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
              <Select
                value={sourceTypeFilter}
                onValueChange={(val) => {
                  setSourceTypeFilter(val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-36 sm:w-40 h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer">
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
                      <span className="w-4 h-4 rounded-full bg-purple-600 text-white text-xs font-bold flex items-center justify-center">
                        {advancedFiltersCount}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl space-y-3.5">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">Bộ lọc chi tiết</h4>
                    {advancedFiltersCount > 0 && (
                      <button
                        onClick={clearAdvancedFilters}
                        className="text-xs font-semibold text-pink-600 hover:underline cursor-pointer"
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

              {/* Sort Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl text-xs font-normal bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 transition-all cursor-pointer whitespace-nowrap"
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
                    { key: "date", label: "Ngày ghi nhận" },
                    { key: "revenue", label: "Doanh thu ($)" },
                    { key: "views", label: "Lượt xem (Views)" },
                    { key: "rpm", label: "RPM ($)" },
                    { key: "accountUsername", label: "Tài khoản" },
                    { key: "assignedUser", label: "Người phụ trách" },
                    { key: "sourceType", label: "Nguồn thu" },
                  ].map((item) => (
                    <button
                      key={item.key}
                      onClick={() => handleSort(item.key as RevenueSortKey)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-normal text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <span>{item.label}</span>
                      {sortConfig.key === item.key && (
                        <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
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
            </div>
          </div>

          {/* Active Filter Chips */}
          {activeFiltersCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
              {search && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  <span>Tìm: {search}</span>
                  <button onClick={() => setSearch("")} className="hover:text-rose-500 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {sourceTypeFilter !== "ALL" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                  <span>Nguồn: {sourceTypeFilter}</span>
                  <button onClick={() => setSourceTypeFilter("ALL")} className="hover:text-rose-500 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {startDate && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300">
                  <span>Từ: {format(new Date(startDate + "T00:00:00"), "dd/MM/yyyy")}</span>
                  <button onClick={() => setStartDate("")} className="hover:text-rose-500 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {endDate && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300">
                  <span>Đến: {format(new Date(endDate + "T00:00:00"), "dd/MM/yyyy")}</span>
                  <button onClick={() => setEndDate("")} className="hover:text-rose-500 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {minRevenue && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                  <span>Doanh thu ≥ ${minRevenue}</span>
                  <button onClick={() => setMinRevenue("")} className="hover:text-rose-500 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {minViews && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300">
                  <span>Views ≥ {Number(minViews).toLocaleString()}</span>
                  <button onClick={() => setMinViews("")} className="hover:text-rose-500 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              <button
                onClick={clearAllFilters}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white underline cursor-pointer ml-1"
              >
                Xóa tất cả
              </button>
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
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300 min-w-[900px]">
              <thead className="bg-slate-50/95 dark:bg-slate-950/95 text-slate-600 dark:text-slate-300 font-semibold text-xs border-b border-slate-200 dark:border-slate-800 select-none normal-case">
                <tr>
                  {/* Checkbox All */}
                  <th className="py-3.5 px-4 w-10">
                    <Checkbox
                      checked={isAllPageSelected}
                      onCheckedChange={(val) => toggleSelectAll(!!val)}
                      aria-label="Chọn tất cả trên trang"
                    />
                  </th>

                  {visibleColumns.accountUsername && (
                    <th
                      onClick={() => handleSort("accountUsername")}
                      className="px-5 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
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

                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors ${isSelected
                          ? "bg-amber-50/40 dark:bg-amber-950/20"
                          : "hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                          }`}
                      >
                        {/* Checkbox */}
                        <td className="py-3.5 px-4">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelectRow(item.id)}
                            aria-label={`Chọn bản ghi ${item.id}`}
                          />
                        </td>

                        {/* Account */}
                        {visibleColumns.accountUsername && (
                          <td className="px-5 py-3.5 font-bold text-slate-900 dark:text-slate-200">
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
                            ${Number(item.rpm || 0).toFixed(3)}
                          </td>
                        )}

                        {/* Revenue */}
                        {visibleColumns.revenue && (
                          <td className="px-4 py-3.5 font-black text-amber-600 dark:text-amber-300">
                            ${Number(item.revenue || 0).toFixed(2)}
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
        </div>
      )}
    </div>
  );
}
