import * as XLSX from "xlsx";

interface ExportDataParams {
  period: string;
  dateRange: { start: string | null; end: string | null };
  kpi: {
    totalRevenue: number;
    prevTotalRevenue: number;
    revenueGrowthPct: number;
    totalViews: number;
    prevTotalViews: number;
    viewsGrowthPct: number;
    avgRpm: number;
    prevAvgRpm: number;
    rpmGrowthPct: number;
    fleetHealthScore: number;
    totalAccountsCount: number;
    healthyAccountsCount: number;
    checklistCompletionRate: number;
    prevChecklistCompletionRate: number;
    checklistRateDeltaPct: number;
    openCriticalAlertsCount: number;
    openWarningAlertsCount: number;
  };
  timeSeries: Array<{
    date: string;
    revenue: number;
    views: number;
    rpm: number;
    tasksCompleted: number;
    tasksAssigned: number;
    completionRate: number;
  }>;
  distributions: {
    status: Array<{ status: string; count: number; percentage: number }>;
    country: Array<{ country: string; accountsCount: number; revenue: number; views: number; rpm: number }>;
    source: Array<{ source: string; revenue: number; percentage: number }>;
  };
  topAccounts: Array<{
    username: string;
    country: string;
    status: string;
    periodRevenue: number;
    periodViews: number;
    rpm: number;
    operatorName: string;
    openAlertsCount: number;
  }>;
  operatorBenchmarks?: Array<{
    operatorName: string;
    role: string;
    groupName: string | null;
    accountsCount: number;
    totalRevenue: number;
    totalViews: number;
    avgRpm: number;
    completionRate: number;
  }>;
}

export function exportAnalyticsToExcel(data: ExportDataParams) {
  const wb = XLSX.utils.book_new();

  // 1. Sheet: KPI Tong Quan
  const kpiRows = [
    { "Chỉ Số Điều Hành": "Khung Thời Gian", "Giá Trị Hiện Tại": data.period, "Ghi Chú": `${data.dateRange.start || "Toàn bộ"} đến ${data.dateRange.end || "Hiện tại"}` },
    { "Chỉ Số Điều Hành": "Tổng Doanh Thu ($)", "Giá Trị Hiện Tại": data.kpi.totalRevenue, "Ghi Chú": `Tăng trưởng: ${data.kpi.revenueGrowthPct > 0 ? "+" : ""}${data.kpi.revenueGrowthPct}% vs kỳ trước ($${data.kpi.prevTotalRevenue})` },
    { "Chỉ Số Điều Hành": "Tổng Lượt Views", "Giá Trị Hiện Tại": data.kpi.totalViews, "Ghi Chú": `Tăng trưởng: ${data.kpi.viewsGrowthPct > 0 ? "+" : ""}${data.kpi.viewsGrowthPct}% vs kỳ trước (${data.kpi.prevTotalViews})` },
    { "Chỉ Số Điều Hành": "RPM Trung Bình ($/1k views)", "Giá Trị Hiện Tại": data.kpi.avgRpm, "Ghi Chú": `Biến động: ${data.kpi.rpmGrowthPct > 0 ? "+" : ""}${data.kpi.rpmGrowthPct}%` },
    { "Chỉ Số Điều Hành": "Điểm Sức Khỏe Dàn Account (%)", "Giá Trị Hiện Tại": `${data.kpi.fleetHealthScore}%`, "Ghi Chú": `${data.kpi.healthyAccountsCount}/${data.kpi.totalAccountsCount} tài khoản an toàn & đang nuôi` },
    { "Chỉ Số Điều Hành": "Tỉ Lệ Hoàn Thành Checklist KPI (%)", "Giá Trị Hiện Tại": `${data.kpi.checklistCompletionRate}%`, "Ghi Chú": `Chênh lệch: ${data.kpi.checklistRateDeltaPct > 0 ? "+" : ""}${data.kpi.checklistRateDeltaPct}%` },
    { "Chỉ Số Điều Hành": "Cảnh Báo Nguy Hiểm (Critical)", "Giá Trị Hiện Tại": data.kpi.openCriticalAlertsCount, "Ghi Chú": "Cần can thiệp ngay (Disqualified, Strike, Checkpoint)" },
    { "Chỉ Số Điều Hành": "Cảnh Báo Chú Ý (Warning)", "Giá Trị Hiện Tại": data.kpi.openWarningAlertsCount, "Ghi Chú": "Cần theo dõi" },
  ];
  const wsKpi = XLSX.utils.json_to_sheet(kpiRows);
  XLSX.utils.book_append_sheet(wb, wsKpi, "KPI_Tong_Quan");

  // 2. Sheet: Theo Doi Hang Ngay
  if (data.timeSeries.length > 0) {
    const timeSeriesRows = data.timeSeries.map((row) => ({
      "Ngày (YYYY-MM-DD)": row.date,
      "Doanh Thu ($)": row.revenue,
      "Lượt Views": row.views,
      "RPM ($)": row.rpm,
      "Tasks Đã Đăng/Xong": row.tasksCompleted,
      "Tasks Được Giao": row.tasksAssigned,
      "Tỉ Lệ Hoàn Thành (%)": `${row.completionRate}%`,
    }));
    const wsTimeSeries = XLSX.utils.json_to_sheet(timeSeriesRows);
    XLSX.utils.book_append_sheet(wb, wsTimeSeries, "Theo_Doi_Hang_Ngay");
  }

  // 3. Sheet: Top Tai Khoan
  if (data.topAccounts.length > 0) {
    const topAccRows = data.topAccounts.map((a, idx) => ({
      "Hạng": idx + 1,
      "Username TikTok": a.username,
      "Quốc Gia": a.country,
      "Trạng Thái": a.status,
      "Doanh Thu Kỳ Này ($)": a.periodRevenue,
      "Lượt Views Kỳ Này": a.periodViews,
      "RPM ($)": a.rpm,
      "Nhân Sự Phụ Trách": a.operatorName,
      "Số Cảnh Báo Mở": a.openAlertsCount,
    }));
    const wsTopAcc = XLSX.utils.json_to_sheet(topAccRows);
    XLSX.utils.book_append_sheet(wb, wsTopAcc, "Top_Tai_Khoan");
  }

  // 4. Sheet: Phan Bo Quoc Gia
  if (data.distributions.country.length > 0) {
    const countryRows = data.distributions.country.map((c) => ({
      "Quốc Gia / Thị Trường": c.country,
      "Số Lượng Tài Khoản": c.accountsCount,
      "Tổng Doanh Thu ($)": c.revenue,
      "Tổng Views": c.views,
      "RPM Bình Quân ($)": c.rpm,
    }));
    const wsCountry = XLSX.utils.json_to_sheet(countryRows);
    XLSX.utils.book_append_sheet(wb, wsCountry, "Phan_Bo_Quoc_Gia");
  }

  // 5. Sheet: Nhan Su Van Hanh (Admin view)
  if (data.operatorBenchmarks && data.operatorBenchmarks.length > 0) {
    const opRows = data.operatorBenchmarks.map((op, idx) => ({
      "Hạng": idx + 1,
      "Nhân Sự": op.operatorName,
      "Vai Trò": op.role,
      "Đội / Nhóm": op.groupName || "Chưa phân nhóm",
      "Số Account Quản Lý": op.accountsCount,
      "Doanh Thu Tạo Ra ($)": op.totalRevenue,
      "Views Tạo Ra": op.totalViews,
      "RPM Trung Bình ($)": op.avgRpm,
      "Tỉ Lệ Chấm Công (%)": `${op.completionRate}%`,
    }));
    const wsOp = XLSX.utils.json_to_sheet(opRows);
    XLSX.utils.book_append_sheet(wb, wsOp, "Nhan_Su_Van_Hanh");
  }

  const exportDateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Bao_Cao_Phan_Tich_TikTokFlow_${data.period}_${exportDateStr}.xlsx`);
}
