"use client";

import { useState, useMemo, useEffect, useRef, Suspense } from "react";
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
  MoreHorizontal,
  Plus,
  FileDown,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Pagination } from "@/components/ui/pagination";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { format, subDays, addDays, differenceInCalendarDays, startOfDay } from "date-fns";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useTableColumnResize } from "@/hooks/useTableColumnResize";
import {
  formatRevenueSourceLabel,
  getRevenueSourceSelectOptions,
  matchesRevenueSourceFilter,
  resolveRevenueSourceKey,
} from "@/lib/m10n-programs";
import { useConfirmDialog } from "@/components/ui/confirm-modal";

const REVENUE_SOURCE_OPTIONS = getRevenueSourceSelectOptions();
/** Studio daily nguồn thu only covers ~60 days — keep custom range in sync. */
const MAX_CUSTOM_RANGE_DAYS = 60;

const REVENUE_DETAILS_COLUMN_RESIZE_CONFIG = {
  accountUsername: { minWidth: 180, maxWidth: 400, defaultWidth: 220 },
  assignedUser: { minWidth: 180, maxWidth: 320, defaultWidth: 210 },
  date: { minWidth: 120, maxWidth: 220, defaultWidth: 140 },
  views: { minWidth: 120, maxWidth: 250, defaultWidth: 140 },
  rpm: { minWidth: 100, maxWidth: 220, defaultWidth: 120 },
  revenue: { minWidth: 120, maxWidth: 260, defaultWidth: 140 },
  sourceType: { minWidth: 260, maxWidth: 420, defaultWidth: 280 },
  actions: { minWidth: 90, maxWidth: 200, defaultWidth: 110 },
} as const;

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
  const { confirm, confirmDialog } = useConfirmDialog();
  // SaaS URL Query State Synchronization
  const { searchParams, updateUrlParams } = useUrlParams();

  const initialSearch = searchParams?.get("q") || searchParams?.get("search") || "";
  const [search, setSearch] = useState(initialSearch);

  const initialSourceRaw = searchParams?.get("source") || "ALL";
  const initialSource =
    initialSourceRaw === "ALL" ? "ALL" : resolveRevenueSourceKey(initialSourceRaw);
  const [sourceTypeFilter, setSourceTypeFilter] = useState(initialSource);

  const initialFrom =
    searchParams?.get("from") ||
    format(subDays(new Date(), 60), "yyyy-MM-dd");
  const initialTo = searchParams?.get("to") || format(new Date(), "yyyy-MM-dd");
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

  const initialIncludeArchived = searchParams?.get("archived") === "true";
  const [includeArchived, setIncludeArchived] = useState(initialIncludeArchived);

  const initialMinViews = searchParams?.get("minV") || searchParams?.get("minViews") || "";
  const [minViews, setMinViews] = useState(initialMinViews);

  const initialOrigin = searchParams?.get("origin") || "ALL";
  const [originFilter, setOriginFilter] = useState<"ALL" | "MANUAL" | "AUTO">(
    initialOrigin === "MANUAL" || initialOrigin === "AUTO" ? initialOrigin : "ALL"
  );

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
        origin: originFilter,
        archived: includeArchived ? "true" : "",
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
        origin: "ALL",
        archived: "",
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
    originFilter,
    includeArchived,
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

  const visibleResizeKeys = useMemo(
    () =>
      (Object.keys(REVENUE_DETAILS_COLUMN_RESIZE_CONFIG) as Array<
        keyof typeof REVENUE_DETAILS_COLUMN_RESIZE_CONFIG
      >).filter((key) => key === "actions" || visibleColumns[key as keyof typeof visibleColumns]),
    [visibleColumns]
  );

  const tableRef = useRef<HTMLDivElement>(null);
  const { getColumnStyle, getTableVars, renderResizeHandle } = useTableColumnResize({
    tableId: "revenue_details_v3",
    columns: REVENUE_DETAILS_COLUMN_RESIZE_CONFIG,
    tableRef,
    visibleKeys: visibleResizeKeys,
    extraWidth: 40,
  });

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
  const [editSourceType, setEditSourceType] = useState("M10N_PROGRAM_CREATOR_INCENTIVES");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [isAddRevenueOpen, setIsAddRevenueOpen] = useState(false);
  const [newRevAccountId, setNewRevAccountId] = useState("");
  const [newRevDate, setNewRevDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [newRevViews, setNewRevViews] = useState("");
  const [newRevRpm, setNewRevRpm] = useState("");
  const [newRevAmount, setNewRevAmount] = useState("");
  const [newRevSource, setNewRevSource] = useState("M10N_PROGRAM_CREATOR_INCENTIVES");
  const importFileRef = useRef<HTMLInputElement>(null);

  const bulkDeleteMutation = trpc.revenue.bulkDelete.useMutation();
  const updateRecordMutation = trpc.revenue.updateRecord.useMutation();
  const upsertRevenueMutation = trpc.revenue.upsert.useMutation();
  const bulkImportMutation = trpc.revenue.bulkImport.useMutation();

  const { data: accountsData } = trpc.accounts.list.useQuery(
    {},
    { enabled: isAddRevenueOpen || isLeadOrAdmin || isAdmin }
  );
  const accountOptions = useMemo(() => {
    const list = (accountsData as any)?.items || [];
    if (!Array.isArray(list)) return [] as Array<{ id: string; username: string }>;
    return list
      .map((a: any) => ({ id: a.id, username: a.username }))
      .filter((a: any) => a.id && a.username)
      .sort((a: any, b: any) => String(a.username).localeCompare(String(b.username)));
  }, [accountsData]);

  const applyPresetRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setStartDate(format(start, "yyyy-MM-dd"));
    setEndDate(format(end, "yyyy-MM-dd"));
    setPage(1);
  };

  const getActivePreset = () => {
    if (!startDate || !endDate) return -1;
    const todayStr = format(new Date(), "yyyy-MM-dd");
    if (endDate === todayStr) {
      const end = new Date();
      const start = new Date(startDate + "T00:00:00");
      const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (Math.abs(diffDays - 7) <= 1) return 7;
      if (Math.abs(diffDays - 28) <= 1) return 28;
      if (Math.abs(diffDays - 60) <= 1) return 60;
    }
    return -1;
  };

  const utils = trpc.useUtils();

  const { data: records = [], isLoading: loading } = trpc.revenue.listDetails.useQuery({
    search: search || undefined,
    sourceType: sourceTypeFilter !== "ALL" ? sourceTypeFilter : undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    includeArchived: includeArchived || undefined,
  });

  // Handle Excel/CSV file upload
  const parseImportRows = (data: any[]) => {
    return data
      .map((row) => {
        const username = String(
          row.Username ||
          row.username ||
          row["Tài khoản"] ||
          row["Account Name"] ||
          row["Account"] ||
          ""
        )
          .trim()
          .replace(/^@+/, "");
        const rawDate =
          row.Date || row.date || row["Ngày"] || row["Ngay"] || "";
        let date = "";
        if (typeof rawDate === "number" && Number.isFinite(rawDate)) {
          // Excel serial date
          const parsed = XLSX.SSF.parse_date_code(rawDate);
          if (parsed) {
            date = `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
          }
        } else if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
          date = format(rawDate, "yyyy-MM-dd");
        } else {
          date = String(rawDate || "").trim().slice(0, 10);
        }
        const views = Number(
          row.Views || row.views || row["Lượt xem"] || row["Lượt xem (Views)"] || 0
        );
        const rpm = Number(row.RPM || row.rpm || row["RPM ($)"] || 0);
        const revenue = Number(
          row.Revenue ||
          row.revenue ||
          row["Doanh thu ($)"] ||
          row["Doanh thu"] ||
          row["Tiền"] ||
          0
        );
        const sourceRaw =
          row.Source ||
          row.sourceType ||
          row["Nguồn thu"] ||
          row["Nguồn"] ||
          "M10N_PROGRAM_CREATOR_INCENTIVES";
        return {
          username,
          date,
          views: Number.isFinite(views) ? views : 0,
          rpm: Number.isFinite(rpm) ? rpm : 0,
          revenue: Number.isFinite(revenue) ? revenue : 0,
          sourceType: resolveRevenueSourceKey(String(sourceRaw)),
        };
      })
      .filter((r) => r.username && r.date);
  };

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
        const fileRecords = parseImportRows(data);

        if (fileRecords.length === 0) {
          setActionMsg("❌ Không tìm thấy dòng hợp lệ trong file (cần cột Tài khoản + Ngày).");
          return;
        }

        const resJson = await bulkImportMutation.mutateAsync({ records: fileRecords });
        setActionMsg(
          resJson.errors?.length
            ? `✅ ${resJson.message} — ${resJson.errors.slice(0, 3).join("; ")}`
            : `✅ ${resJson.message}`
        );
        utils.revenue.listDetails.invalidate();
        utils.revenue.getOverview.invalidate();
      } catch (err: any) {
        setActionMsg(`❌ Lỗi import: ${err.message || "không xác định"}`);
      } finally {
        setImporting(false);
        if (importFileRef.current) importFileRef.current.value = "";
        setTimeout(() => setActionMsg(null), 6000);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDownloadTemplate = () => {
    const sampleAccount = accountOptions[0]?.username || "username_mau";
    const today = format(new Date(), "yyyy-MM-dd");
    const rows = [
      {
        "Tài khoản": sampleAccount,
        Ngày: today,
        "Lượt xem (Views)": 10000,
        "RPM ($)": 0.85,
        "Doanh thu ($)": 8.5,
        "Nguồn thu": "M10N_PROGRAM_CREATOR_INCENTIVES",
      },
      {
        "Tài khoản": sampleAccount,
        Ngày: format(subDays(new Date(), 1), "yyyy-MM-dd"),
        "Lượt xem (Views)": 5000,
        "RPM ($)": 0.5,
        "Doanh thu ($)": "",
        "Nguồn thu": "M10N_PROGRAM_TIKTOK_SHOP",
      },
      {
        "Tài khoản": "",
        Ngày: "",
        "Lượt xem (Views)": "",
        "RPM ($)": "",
        "Doanh thu ($)": "",
        "Nguồn thu": "",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 22 },
      { wch: 12 },
      { wch: 16 },
      { wch: 10 },
      { wch: 14 },
      { wch: 32 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Doanh thu");
    XLSX.writeFile(wb, `mau-import-doanh-thu-${today}.xlsx`);
    setActionMsg("✅ Đã tải file mẫu Excel. Điền thêm dòng rồi dùng Import Excel.");
    setTimeout(() => setActionMsg(null), 4000);
  };

  const handleCreateRevenue = () => {
    if (!newRevAccountId) {
      setActionMsg("❌ Vui lòng chọn tài khoản.");
      setTimeout(() => setActionMsg(null), 3000);
      return;
    }
    const viewsNum = Number(newRevViews) || 0;
    const rpmNum = Number(newRevRpm) || 0;
    let revNum = Number(newRevAmount) || 0;
    if (!revNum && viewsNum > 0 && rpmNum > 0) {
      revNum = (viewsNum / 1000) * rpmNum;
    }
    upsertRevenueMutation.mutate(
      {
        accountId: newRevAccountId,
        date: newRevDate,
        views: viewsNum,
        rpm: rpmNum,
        revenue: revNum,
        sourceType: newRevSource,
      },
      {
        onSuccess: () => {
          setActionMsg("✅ Đã tạo bản ghi doanh thu thủ công.");
          setIsAddRevenueOpen(false);
          setNewRevViews("");
          setNewRevRpm("");
          setNewRevAmount("");
          utils.revenue.listDetails.invalidate();
          utils.revenue.getOverview.invalidate();
          setTimeout(() => setActionMsg(null), 4000);
        },
        onError: (err) => {
          setActionMsg(`❌ ${err.message || "Lỗi tạo bản ghi"}`);
          setTimeout(() => setActionMsg(null), 4000);
        },
      }
    );
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

      const matchSource =
        sourceTypeFilter === "ALL" ||
        matchesRevenueSourceFilter(r.sourceType, sourceTypeFilter);

      const rev = Number(r.revenue || 0);
      const matchMinRev = !minRevenue || rev >= Number(minRevenue);

      const v = Number(r.views || 0);
      const matchMinViews = !minViews || v >= Number(minViews);

      const isAuto = String(r.id || "").startsWith("auto-");
      const matchOrigin =
        originFilter === "ALL" ||
        (originFilter === "AUTO" && isAuto) ||
        (originFilter === "MANUAL" && !isAuto);

      return matchSearch && matchSource && matchMinRev && matchMinViews && matchOrigin;
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
  }, [records, search, sourceTypeFilter, minRevenue, minViews, originFilter, sortConfig]);

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
      toast.warning("Không có dữ liệu để xuất file!");
      return;
    }

    const rows = dataToExport.map((r: any) => ({
      "Tài khoản": `@${r.account?.username || ""}`,
      "Người phụ trách": r.account?.assignedUser?.fullName || r.account?.assignedUser?.name || "Chưa gán",
      "Ngày": r.date ? r.date.slice(0, 10) : "",
      "Lượt xem (Views)": Number(r.views || 0),
      "RPM ($)": Number(r.rpm || 0),
      "Doanh thu ($)": Number(r.revenue || 0),
      "Nguồn thu": formatRevenueSourceLabel(r.sourceType),
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
    setEditSourceType(resolveRevenueSourceKey(item.sourceType));
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
      toast.warning("Bản ghi này được đồng bộ tự động từ Analytics, không thể xóa trực tiếp.");
      return;
    }
    const ok = await confirm({
      title: "Xác nhận xóa bản ghi",
      description: `Xóa bản ghi doanh thu ngày ${item.date ? item.date.slice(0, 10) : ""} của @${item.account?.username}?`,
      confirmLabel: "Xác nhận xóa",
      variant: "danger",
    });
    if (!ok) return;
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
      toast.warning("Các bản ghi đã chọn đều là bản ghi tự động từ Analytics, không thể xóa thủ công.");
      return;
    }
    const autoCount = selectedIds.size - realIds.length;
    const ok = await confirm({
      title: "Xác nhận xóa hàng loạt",
      description:
        autoCount > 0
          ? `Bạn đã chọn ${selectedIds.size} bản ghi (${autoCount} tự động, ${realIds.length} thủ công). Hệ thống chỉ xóa ${realIds.length} bản ghi thủ công.`
          : `Bạn có chắc chắn muốn xóa ${realIds.length} bản ghi doanh thu thủ công đã chọn?`,
      confirmLabel: `Xác nhận xóa (${realIds.length})`,
      variant: "danger",
    });
    if (!ok) return;
    try {
      setIsDeletingBulk(true);
      await bulkDeleteMutation.mutateAsync({ ids: realIds });
      setActionMsg(`✅ Đã xóa thành công ${realIds.length} bản ghi thủ công!`);
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
    (minRevenue ? 1 : 0) +
    (minViews ? 1 : 0) +
    (originFilter !== "ALL" ? 1 : 0) +
    (includeArchived ? 1 : 0);

  // Filters count for Advanced Filter Popover
  const advancedFiltersCount =
    (minRevenue ? 1 : 0) +
    (minViews ? 1 : 0) +
    (originFilter !== "ALL" ? 1 : 0) +
    (includeArchived ? 1 : 0);

  const clearAdvancedFilters = () => {
    setMinRevenue("");
    setMinViews("");
    setOriginFilter("ALL");
    setIncludeArchived(false);
    setPage(1);
  };

  const clearAllFilters = () => {
    setSearch("");
    setSourceTypeFilter("ALL");
    setStartDate(format(subDays(new Date(), 60), "yyyy-MM-dd"));
    setEndDate(format(new Date(), "yyyy-MM-dd"));
    setMinRevenue("");
    setMinViews("");
    setOriginFilter("ALL");
    setIncludeArchived(false);
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

  // Total summary of current filtered (split active vs archived)
  const {
    filteredTotalRevenue,
    filteredActiveRevenue,
    filteredArchivedRevenue,
    filteredTotalViews,
    filteredActiveViews,
    filteredArchivedViews,
    archivedCount,
  } = useMemo(() => {
    let totalRev = 0;
    let activeRev = 0;
    let archRev = 0;
    let totalV = 0;
    let activeV = 0;
    let archV = 0;
    let archC = 0;

    for (const r of filteredAndSortedRecords) {
      const rev = Number(r.revenue || 0);
      const v = Number(r.views || 0);
      const isArchived = Boolean(r.account?.deletedAt);

      totalRev += rev;
      totalV += v;

      if (isArchived) {
        archRev += rev;
        archV += v;
        archC++;
      } else {
        activeRev += rev;
        activeV += v;
      }
    }

    return {
      filteredTotalRevenue: totalRev,
      filteredActiveRevenue: activeRev,
      filteredArchivedRevenue: archRev,
      filteredTotalViews: totalV,
      filteredActiveViews: activeV,
      filteredArchivedViews: archV,
      archivedCount: archC,
    };
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

            {/* More actions: create / template / import */}
            {(isLeadOrAdmin || isAdmin) && (
              <>
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="h-10 w-10 flex items-center justify-center rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer shadow-xs active:scale-95 shrink-0"
                          aria-label="Thêm"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      Tùy chọn thêm bản ghi / import
                    </TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent
                    align="end"
                    className="w-52 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl p-1.5 shadow-xl"
                  >
                    <DropdownMenuItem
                      className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                      onClick={() => {
                        setIsAddRevenueOpen(true);
                        if (!newRevAccountId && accountOptions[0]?.id) {
                          setNewRevAccountId(accountOptions[0].id);
                        }
                      }}
                    >
                      <Plus className="w-3.5 h-3.5 text-pink-500" />
                      <span>Tạo bản ghi mới</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                      onClick={handleDownloadTemplate}
                    >
                      <FileDown className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Tải mẫu Excel</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="my-1 bg-slate-100 dark:bg-slate-800" />
                    <DropdownMenuItem
                      className="flex items-center gap-2 px-2.5 py-2 text-xs font-normal text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                      disabled={importing || bulkImportMutation.isPending}
                      onClick={() => importFileRef.current?.click()}
                    >
                      <Upload className="w-3.5 h-3.5 text-cyan-500" />
                      <span>
                        {importing || bulkImportMutation.isPending
                          ? "Đang import..."
                          : "Import Excel"}
                      </span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
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
              <div>
                <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 truncate">
                  {formatAmount(filteredTotalRevenue, "USD")}
                </div>
                {includeArchived && archivedCount > 0 && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      Hiện hành: {formatAmount(filteredActiveRevenue, "USD")}
                    </span>
                    <span>•</span>
                    <span className="text-rose-500 dark:text-rose-400 font-semibold">
                      Lưu trữ: {formatAmount(filteredArchivedRevenue, "USD")}
                    </span>
                  </div>
                )}
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
              <div>
                <div className="text-2xl font-black text-cyan-600 dark:text-cyan-400 mt-1 truncate">
                  {filteredTotalViews.toLocaleString()}
                </div>
                {includeArchived && archivedCount > 0 && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
                    <span>Hiện hành: {filteredActiveViews.toLocaleString()}</span>
                    <span>•</span>
                    <span className="text-rose-500 dark:text-rose-400 font-semibold">
                      Lưu trữ: {filteredArchivedViews.toLocaleString()}
                    </span>
                  </div>
                )}
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
              <div>
                <div className="text-2xl font-black text-pink-600 dark:text-pink-400 mt-1 truncate">
                  {filteredAndSortedRecords.length}
                </div>
                {includeArchived && archivedCount > 0 && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Gồm <span className="font-bold text-rose-500">{archivedCount}</span> bản ghi tài khoản đã xóa
                  </div>
                )}
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
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          Chọn khoảng ngày thống kê
                        </span>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Tối đa {MAX_CUSTOM_RANGE_DAYS} ngày
                        </p>
                      </div>
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
                          if (!range?.from) {
                            setRangeSelection(range);
                            return;
                          }
                          if (!range.to) {
                            setRangeSelection({ from: range.from, to: undefined });
                            return;
                          }
                          const span = Math.abs(
                            differenceInCalendarDays(range.to, range.from)
                          );
                          if (span > MAX_CUSTOM_RANGE_DAYS) {
                            const fromFirst =
                              range.from.getTime() <= range.to.getTime()
                                ? range.from
                                : range.to;
                            const toClamped = addDays(fromFirst, MAX_CUSTOM_RANGE_DAYS);
                            setRangeSelection({ from: fromFirst, to: toClamped });
                            return;
                          }
                          setRangeSelection(range);
                        }}
                        disabled={(date) => {
                          // While picking the end date, block days outside ±60 from start.
                          if (!rangeSelection?.from || rangeSelection.to) return false;
                          const from = rangeSelection.from;
                          return (
                            differenceInCalendarDays(date, from) > MAX_CUSTOM_RANGE_DAYS ||
                            differenceInCalendarDays(from, date) > MAX_CUSTOM_RANGE_DAYS
                          );
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
                            let from = rangeSelection.from;
                            let to = rangeSelection.to || from;
                            if (to.getTime() < from.getTime()) {
                              const tmp = from;
                              from = to;
                              to = tmp;
                            }
                            if (differenceInCalendarDays(to, from) > MAX_CUSTOM_RANGE_DAYS) {
                              to = addDays(from, MAX_CUSTOM_RANGE_DAYS);
                            }
                            setStartDate(format(from, "yyyy-MM-dd"));
                            setEndDate(format(to, "yyyy-MM-dd"));
                            setRangeSelection({ from, to });
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
                    setSourceTypeFilter(val === "ALL" ? "ALL" : resolveRevenueSourceKey(val));
                    setPage(1);
                  }}
                >
                  <SelectTrigger
                    className={`w-44 sm:w-56 h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-none cursor-pointer whitespace-nowrap [&>span]:truncate transition-colors ${sourceTypeFilter !== "ALL"
                      ? "pr-8 border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/25 text-amber-700 dark:text-amber-300 [&_svg]:hidden"
                      : ""
                      }`}
                  >
                    <SelectValue placeholder="Tất cả nguồn thu" />
                  </SelectTrigger>
                  <SelectContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-80">
                    <SelectItem value="ALL" className="text-xs font-normal cursor-pointer">Tất cả nguồn thu</SelectItem>
                    {REVENUE_SOURCE_OPTIONS.map((opt) => (
                      <SelectItem
                        key={opt.value}
                        value={opt.value}
                        className="text-xs font-normal cursor-pointer"
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
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
                        Cách thêm bản ghi
                      </label>
                      <Select
                        value={originFilter}
                        onValueChange={(val) => {
                          setOriginFilter(val as "ALL" | "MANUAL" | "AUTO");
                          setPage(1);
                        }}
                      >
                        <SelectTrigger className="w-full h-8.5 text-xs font-normal bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 cursor-pointer">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">
                          <SelectItem value="ALL" className="text-xs cursor-pointer">Tất cả</SelectItem>
                          <SelectItem value="MANUAL" className="text-xs cursor-pointer">Thêm thủ công</SelectItem>
                          <SelectItem value="AUTO" className="text-xs cursor-pointer">Đồng bộ tự động</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
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
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                      <label className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer select-none">
                        <div className="flex items-center gap-2 min-w-0">
                          <Trash2 className={`w-3.5 h-3.5 shrink-0 ${includeArchived ? "text-rose-600 dark:text-rose-400" : "text-slate-400"}`} />
                          <div className="min-w-0">
                            <span className="block text-xs font-medium text-slate-800 dark:text-slate-200 leading-tight">
                              Tài khoản đã xóa
                            </span>
                            <span className="block text-[10px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                              Bao gồm doanh thu từ account đã xóa
                            </span>
                          </div>
                        </div>
                        <Checkbox
                          checked={includeArchived}
                          onCheckedChange={(checked) => {
                            setIncludeArchived(!!checked);
                            setPage(1);
                          }}
                        />
                      </label>
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
                  <span>Nguồn: {formatRevenueSourceLabel(sourceTypeFilter)}</span>
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

              {originFilter !== "ALL" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300">
                  <span>
                    {originFilter === "MANUAL" ? "Thêm thủ công" : "Đồng bộ tự động"}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => setOriginFilter("ALL")} className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/15 hover:text-rose-500 transition-colors cursor-pointer">
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
              {includeArchived && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300">
                  <span>Bao gồm tài khoản đã xóa</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => setIncludeArchived(false)} className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/15 hover:text-rose-500 transition-colors cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Ẩn tài khoản đã xóa</TooltipContent>
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
          <div className="overflow-x-auto" ref={tableRef} style={getTableVars()}>
            <table
              className="text-left text-xs text-slate-700 dark:text-slate-300 table-fixed border-collapse"
              style={{
                width: "max(100%, var(--resize-table-min-width))",
                minWidth: "var(--resize-table-min-width)",
              }}
            >
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
                      style={getColumnStyle("accountUsername")}
                      onClick={() => handleSort("accountUsername")}
                      className="relative group/th sticky left-10 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs px-5 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white border-r border-slate-200 dark:border-slate-800 after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-slate-200 dark:after:bg-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.03)]"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate">Tài khoản</span>
                        {renderSortIndicator("accountUsername")}
                      </div>
                      {renderResizeHandle("accountUsername")}
                    </th>
                  )}

                  {visibleColumns.assignedUser && (
                    <th
                      style={getColumnStyle("assignedUser")}
                      onClick={() => handleSort("assignedUser")}
                      className="relative group/th px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate">Người phụ trách</span>
                        {renderSortIndicator("assignedUser")}
                      </div>
                      {renderResizeHandle("assignedUser")}
                    </th>
                  )}

                  {visibleColumns.date && (
                    <th
                      style={getColumnStyle("date")}
                      onClick={() => handleSort("date")}
                      className="relative group/th px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate">Ngày</span>
                        {renderSortIndicator("date")}
                      </div>
                      {renderResizeHandle("date")}
                    </th>
                  )}

                  {visibleColumns.views && (
                    <th
                      style={getColumnStyle("views")}
                      onClick={() => handleSort("views")}
                      className="relative group/th px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate">Lượt views</span>
                        {renderSortIndicator("views")}
                      </div>
                      {renderResizeHandle("views")}
                    </th>
                  )}

                  {visibleColumns.rpm && (
                    <th
                      style={getColumnStyle("rpm")}
                      onClick={() => handleSort("rpm")}
                      className="relative group/th px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate">RPM ($)</span>
                        {renderSortIndicator("rpm")}
                      </div>
                      {renderResizeHandle("rpm")}
                    </th>
                  )}

                  {visibleColumns.revenue && (
                    <th
                      style={getColumnStyle("revenue")}
                      onClick={() => handleSort("revenue")}
                      className="relative group/th px-4 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate">Doanh thu ($)</span>
                        {renderSortIndicator("revenue")}
                      </div>
                      {renderResizeHandle("revenue")}
                    </th>
                  )}

                  {visibleColumns.sourceType && (
                    <th
                      style={getColumnStyle("sourceType")}
                      onClick={() => handleSort("sourceType")}
                      className="relative group/th px-5 py-3.5 cursor-pointer group hover:text-slate-900 dark:hover:text-white"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate">Nguồn thu</span>
                        {renderSortIndicator("sourceType")}
                      </div>
                      {renderResizeHandle("sourceType")}
                    </th>
                  )}

                  {/* Actions Column - Sticky Right 0 */}
                  <th
                    style={getColumnStyle("actions")}
                    className="relative group/th sticky right-0 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs border-l border-slate-200 dark:border-slate-800 after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-slate-200 dark:after:bg-slate-800 shadow-[-2px_0_5px_rgba(0,0,0,0.03)] px-4 py-3.5 text-center"
                  >
                    Thao tác
                    {renderResizeHandle("actions", "left")}
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
                          <td
                            style={getColumnStyle("accountUsername")}
                            className={`sticky left-10 z-10 px-5 py-3.5 font-bold text-slate-900 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.03)] backdrop-blur-xs overflow-hidden ${isSelected ? "bg-amber-50/95 dark:bg-amber-950/90" : "bg-white/95 dark:bg-slate-900/95"}`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0 w-full">
                              <span className="truncate min-w-0" title={`@${item.account?.username}`}>@{item.account?.username}</span>
                              {item.account?.deletedAt && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 shrink-0">
                                  Đã xóa
                                </span>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Staff */}
                        {visibleColumns.assignedUser && (
                          <td style={getColumnStyle("assignedUser")} className="px-4 py-3.5 text-slate-600 dark:text-slate-400 overflow-hidden">
                            <span className="truncate block" title={item.account?.assignedUser?.fullName || item.account?.assignedUser?.name || item.account?.assignedUser?.username || undefined}>
                              {item.account?.assignedUser?.fullName ||
                                item.account?.assignedUser?.name ||
                                item.account?.assignedUser?.username ||
                                "Chưa gán"}
                            </span>
                          </td>
                        )}

                        {/* Date */}
                        {visibleColumns.date && (
                          <td style={getColumnStyle("date")} className="px-4 py-3.5 text-slate-600 dark:text-slate-400 overflow-hidden">
                            <span className="truncate block">{item.date ? item.date.slice(0, 10) : "-"}</span>
                          </td>
                        )}

                        {/* Views */}
                        {visibleColumns.views && (
                          <td style={getColumnStyle("views")} className="px-4 py-3.5 font-semibold text-slate-800 dark:text-slate-300 overflow-hidden">
                            <span className="truncate block">{Number(item.views || 0).toLocaleString()}</span>
                          </td>
                        )}

                        {/* RPM */}
                        {visibleColumns.rpm && (
                          <td style={getColumnStyle("rpm")} className="px-4 py-3.5 font-bold text-emerald-600 dark:text-emerald-400 overflow-hidden">
                            <span className="truncate block">{formatAmount(Number(item.rpm || 0), "USD")}</span>
                          </td>
                        )}

                        {/* Revenue */}
                        {visibleColumns.revenue && (
                          <td style={getColumnStyle("revenue")} className="px-4 py-3.5 font-black text-amber-600 dark:text-amber-300 overflow-hidden">
                            <span className="truncate block">{formatAmount(Number(item.revenue || 0), "USD")}</span>
                          </td>
                        )}

                        {/* Source */}
                        {visibleColumns.sourceType && (
                          <td style={getColumnStyle("sourceType")} className="px-5 py-3.5 overflow-hidden">
                            <span
                              className="inline-flex items-center px-2.5 h-7.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-2xs max-w-full min-w-0 whitespace-nowrap truncate"
                              title={formatRevenueSourceLabel(item.sourceType)}
                            >
                              {formatRevenueSourceLabel(item.sourceType)}
                            </span>
                          </td>
                        )}

                        {/* Thao tác - Sticky Right 0 */}
                        <td
                          style={getColumnStyle("actions")}
                          className={`sticky right-0 z-10 px-4 py-3.5 text-center border-l border-slate-200 dark:border-slate-800 shadow-[-2px_0_5px_rgba(0,0,0,0.03)] backdrop-blur-xs ${isSelected ? "bg-amber-50/95 dark:bg-amber-950/90" : "bg-white/95 dark:bg-slate-900/95"}`}
                        >
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
            (() => {
              const manualCount = Array.from(selectedIds).filter((id) => !id.startsWith("auto-")).length;
              return (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <button
                        onClick={handleBulkDelete}
                        disabled={isDeletingBulk || manualCount === 0}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isDeletingBulk ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        <span>
                          {manualCount === 0
                            ? "Không thể xóa (bản ghi tự động)"
                            : manualCount === selectedIds.size
                              ? `Xóa đã chọn (${manualCount})`
                              : `Xóa ${manualCount} bản ghi thủ công`}
                        </span>
                      </button>
                    </span>
                  </TooltipTrigger>
                  {manualCount === 0 ? (
                    <TooltipContent side="top" className="text-xs">
                      Tất cả bản ghi đang chọn đều là tự động từ Analytics, không thể xóa thủ công.
                    </TooltipContent>
                  ) : manualCount < selectedIds.size ? (
                    <TooltipContent side="top" className="text-xs">
                      {selectedIds.size - manualCount} bản ghi tự động sẽ được giữ nguyên, chỉ xóa {manualCount} bản ghi thủ công.
                    </TooltipContent>
                  ) : null}
                </Tooltip>
              );
            })()
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
                    <SelectContent className="max-h-80">
                      {REVENUE_SOURCE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                          {opt.label}
                        </SelectItem>
                      ))}
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

      {/* Create manual revenue record */}
      <Dialog open={isAddRevenueOpen} onOpenChange={setIsAddRevenueOpen}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-pink-500" />
              Tạo bản ghi doanh thu mới
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="block mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                Tài khoản
              </label>
              <Select value={newRevAccountId} onValueChange={setNewRevAccountId}>
                <SelectTrigger className="w-full h-9 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-xs font-normal cursor-pointer">
                  <SelectValue placeholder="Chọn tài khoản TikTok" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-72">
                  {accountOptions.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id} className="text-xs font-normal cursor-pointer">
                      @{acc.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                Ngày ghi nhận
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-full h-9 inline-flex items-center justify-between gap-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-normal text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer"
                  >
                    <span>
                      {newRevDate
                        ? format(new Date(newRevDate + "T00:00:00"), "dd/MM/yyyy")
                        : "Chọn ngày"}
                    </span>
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={6}
                  className="w-auto p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-[350]"
                >
                  <CalendarPicker
                    mode="single"
                    selected={
                      newRevDate
                        ? new Date(newRevDate + "T00:00:00")
                        : undefined
                    }
                    onSelect={(date) => {
                      if (date) setNewRevDate(format(date, "yyyy-MM-dd"));
                    }}
                    disabled={(date) => startOfDay(date) > startOfDay(new Date())}
                    className="p-0 font-normal"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Lượt xem (Views)
                </label>
                <Input
                  type="number"
                  placeholder="VD: 50000"
                  value={newRevViews}
                  onChange={(e) => setNewRevViews(e.target.value)}
                  className="h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
              </div>
              <div>
                <label className="block mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  RPM ($)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="VD: 0.85"
                  value={newRevRpm}
                  onChange={(e) => setNewRevRpm(e.target.value)}
                  className="h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="block mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                Tổng tiền ($)
              </label>
              <Input
                type="number"
                step="0.01"
                placeholder="VD: 42.50 (tự tính nếu bỏ trống)"
                value={newRevAmount}
                onChange={(e) => setNewRevAmount(e.target.value)}
                className="h-9 text-xs font-normal rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
              />
            </div>

            <div>
              <label className="block mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                Nguồn thu
              </label>
              <Select value={newRevSource} onValueChange={setNewRevSource}>
                <SelectTrigger className="w-full h-9 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-xs font-normal cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-72">
                  {REVENUE_SOURCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs font-normal cursor-pointer">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-3 sm:gap-3">
            <button
              type="button"
              onClick={() => setIsAddRevenueOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleCreateRevenue}
              disabled={upsertRevenueMutation.isPending}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              {upsertRevenueMutation.isPending ? "Đang lưu..." : "Lưu bản ghi"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialog}
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
