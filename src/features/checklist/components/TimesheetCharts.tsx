"use client";

import React, { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  BarChart,
  LineChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  Award,
  CheckCircle2,
  AlertCircle,
  Clock,
  Video,
  RefreshCw,
  Users,
  Percent,
  Calendar as CalendarIcon,
  ChevronRight,
  ExternalLink,
} from "lucide-react";

interface TimesheetChartsProps {
  checklists: any[];
  selectedUserId: string;
  staffList: any[];
  onSelectDate?: (dateStr: string) => void;
  isLoading?: boolean;
}

const SCORE_COLORS = {
  FULL: "#10b981", // emerald-500
  HALF: "#f59e0b", // amber-500
  ZERO: "#ef4444", // rose-500
};

export default function TimesheetCharts({
  checklists,
  selectedUserId,
  staffList,
  onSelectDate,
  isLoading,
}: TimesheetChartsProps) {
  const [metricTab, setMetricTab] = useState<"ALL" | "SCORES" | "VIDEOS" | "RATE">("ALL");

  const isSingleUser = selectedUserId !== "ALL";

  // 1. Process Time-Series Data sorted chronologically (oldest to newest)
  const timeSeriesData = useMemo(() => {
    const map = new Map<string, any>();

    for (const c of checklists) {
      const dStr = format(new Date(c.date), "yyyy-MM-dd");
      if (!map.has(dStr)) {
        map.set(dStr, {
          date: dStr,
          displayDate: format(new Date(c.date), "dd/MM"),
          fullWorkdays: 0,
          halfWorkdays: 0,
          zeroWorkdays: 0,
          totalScore: 0,
          totalCompletion: 0,
          count: 0,
          totalVideos: 0,
          totalSynced: 0,
          totalAssigned: 0,
        });
      }

      const item = map.get(dStr)!;
      const score = Number(c.workdayScore || 0);
      item.totalScore += score;
      item.totalCompletion += Number(c.completionRate || 0);
      item.count += 1;
      item.totalAssigned += c.items?.length || 0;

      if (score >= 1.0) item.fullWorkdays += 1;
      else if (score === 0.5) item.halfWorkdays += 1;
      else item.zeroWorkdays += 1;

      for (const it of c.items || []) {
        if (it.isPosted) item.totalVideos += 1;
        if (it.isSynced) item.totalSynced += 1;
      }
    }

    // Sort chronologically
    const sorted = Array.from(map.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Compute averages & cumulative score
    let cumulative = 0;
    return sorted.map((d) => {
      cumulative += d.totalScore;
      return {
        ...d,
        avgCompletionRate:
          d.count > 0 ? Math.round((d.totalCompletion / d.count) * 10) / 10 : 0,
        cumulativeScore: Math.round(cumulative * 10) / 10,
      };
    });
  }, [checklists]);

  // 2. High-level Summary Metrics
  const summaryMetrics = useMemo(() => {
    let totalScore = 0;
    let fullDays = 0;
    let halfDays = 0;
    let zeroDays = 0;
    let totalVideos = 0;
    let totalSynced = 0;
    let totalAssigned = 0;
    let totalRateSum = 0;

    for (const c of checklists) {
      const score = Number(c.workdayScore || 0);
      totalScore += score;
      if (score >= 1.0) fullDays++;
      else if (score === 0.5) halfDays++;
      else zeroDays++;

      totalRateSum += Number(c.completionRate || 0);
      totalAssigned += c.items?.length || 0;

      for (const it of c.items || []) {
        if (it.isPosted) totalVideos++;
        if (it.isSynced) totalSynced++;
      }
    }

    const avgRate =
      checklists.length > 0
        ? Math.round((totalRateSum / checklists.length) * 10) / 10
        : 0;
    const syncRate =
      totalAssigned > 0 ? Math.round((totalSynced / totalAssigned) * 100) : 0;

    return {
      totalScore: Math.round(totalScore * 10) / 10,
      fullDays,
      halfDays,
      zeroDays,
      totalRecords: checklists.length,
      avgRate,
      totalVideos,
      totalSynced,
      totalAssigned,
      syncRate,
    };
  }, [checklists]);

  // 3. Score Distribution Data for Donut Chart
  const scoreDistributionData = useMemo(() => {
    const total = summaryMetrics.totalRecords || 1;
    return [
      {
        name: "1.0 Công (Đạt)",
        value: summaryMetrics.fullDays,
        percentage: Math.round((summaryMetrics.fullDays / total) * 100),
        color: SCORE_COLORS.FULL,
      },
      {
        name: "0.5 Công (Nửa công)",
        value: summaryMetrics.halfDays,
        percentage: Math.round((summaryMetrics.halfDays / total) * 100),
        color: SCORE_COLORS.HALF,
      },
      {
        name: "0 Công (Không đạt)",
        value: summaryMetrics.zeroDays,
        percentage: Math.round((summaryMetrics.zeroDays / total) * 100),
        color: SCORE_COLORS.ZERO,
      },
    ];
  }, [summaryMetrics]);

  // 4. Staff Performance Ranking (Leaderboard) for Team View
  const staffRanking = useMemo(() => {
    const staffMap = new Map<string, any>();

    for (const c of checklists) {
      const uId = c.userId;
      if (!staffMap.has(uId)) {
        staffMap.set(uId, {
          id: uId,
          name: c.user?.fullName || c.user?.username || "Nhân sự",
          username: c.user?.username,
          avatar: c.user?.avatar,
          role: c.user?.role,
          totalScore: 0,
          perfectDays: 0,
          halfDays: 0,
          zeroDays: 0,
          totalVideos: 0,
          totalAssigned: 0,
          rateSum: 0,
          recordCount: 0,
        });
      }

      const s = staffMap.get(uId)!;
      const score = Number(c.workdayScore || 0);
      s.totalScore += score;
      s.recordCount += 1;
      s.rateSum += Number(c.completionRate || 0);
      s.totalAssigned += c.items?.length || 0;

      if (score >= 1.0) s.perfectDays += 1;
      else if (score === 0.5) s.halfDays += 1;
      else s.zeroDays += 1;

      for (const it of c.items || []) {
        if (it.isPosted) s.totalVideos += 1;
      }
    }

    const list = Array.from(staffMap.values()).map((s) => ({
      ...s,
      totalScore: Math.round(s.totalScore * 10) / 10,
      avgRate:
        s.recordCount > 0 ? Math.round((s.rateSum / s.recordCount) * 10) / 10 : 0,
    }));

    // Sort descending by total score, then avgRate
    return list.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return b.avgRate - a.avgRate;
    });
  }, [checklists]);

  // Custom Chart Tooltips
  const CustomComposedTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900/95 backdrop-blur-md border border-slate-800 p-3.5 rounded-2xl shadow-2xl text-xs space-y-1.5 text-slate-100 min-w-[200px]">
          <div className="font-bold text-slate-300 pb-1.5 border-b border-slate-800 flex items-center justify-between">
            <span>Ngày: {data.displayDate}</span>
            <span className="font-mono text-slate-400 text-[11px]">{data.date}</span>
          </div>

          {!isSingleUser ? (
            <>
              <div className="flex justify-between items-center text-emerald-400 font-semibold">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>1.0 Công (Đạt):</span>
                </span>
                <span>{data.fullWorkdays} NV</span>
              </div>
              <div className="flex justify-between items-center text-amber-400 font-semibold">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>0.5 Công:</span>
                </span>
                <span>{data.halfWorkdays} NV</span>
              </div>
              <div className="flex justify-between items-center text-rose-400 font-semibold">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span>0 Công:</span>
                </span>
                <span>{data.zeroWorkdays} NV</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between items-center text-emerald-400 font-semibold">
              <span>Điểm ngày công:</span>
              <span className="font-black text-sm">
                {data.totalScore >= 1.0
                  ? "1.0 Công"
                  : data.totalScore === 0.5
                  ? "0.5 Công"
                  : "0 Công"}
              </span>
            </div>
          )}

          <div className="pt-1.5 border-t border-slate-800 space-y-1">
            <div className="flex justify-between items-center text-cyan-400 font-semibold">
              <span>Tiến độ KPI:</span>
              <span>{data.avgCompletionRate}%</span>
            </div>
            <div className="flex justify-between items-center text-pink-400 font-semibold">
              <span>Video đã đăng:</span>
              <span>{data.totalVideos} videos</span>
            </div>
            {isSingleUser && (
              <div className="flex justify-between items-center text-purple-400 font-semibold">
                <span>Tích lũy công:</span>
                <span>{data.cumulativeScore} Công</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 1. Metric Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Score */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Tổng Công Tích Lũy
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              {summaryMetrics.totalScore}
            </span>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
              Ngày Công
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {summaryMetrics.fullDays} ngày đủ (1.0) • {summaryMetrics.halfDays} nửa ngày (0.5)
          </div>
        </div>

        {/* Avg KPI Rate */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              KPI Hoàn Thành TB
            </span>
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-cyan-600 dark:text-cyan-400">
              {summaryMetrics.avgRate}%
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Đạt chỉ tiêu &ge;85% KPI theo quy chế
          </div>
        </div>

        {/* Total Videos Posted */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Video Đã Lên Kênh
            </span>
            <div className="w-8 h-8 rounded-xl bg-pink-500/10 text-pink-600 dark:text-pink-400 flex items-center justify-center">
              <Video className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-pink-600 dark:text-pink-400">
              {summaryMetrics.totalVideos}
            </span>
            <span className="text-xs font-bold text-slate-400">Videos</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Tổng video hợp lệ được đăng trong kỳ
          </div>
        </div>

        {/* GPM Sync Health */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Tỷ Lệ Sync Live GPM
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <RefreshCw className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-purple-600 dark:text-purple-400">
              {summaryMetrics.syncRate}%
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {summaryMetrics.totalSynced}/{summaryMetrics.totalAssigned} kênh đã đồng bộ
          </div>
        </div>
      </div>

      {/* 2. Hero Chart: Daily Workday Scores & KPI Progress Over Time */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <span>Biến Động Chấm Công & Tiến Độ KPI Theo Ngày</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Phân tích số lượng nhân sự đạt công, ngày công tích lũy và tỷ lệ hoàn thành KPI từng ngày.
            </p>
          </div>

          {/* Metric Selector Filter */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl text-xs self-start sm:self-auto">
            {[
              { key: "ALL" as const, label: "Tất cả" },
              { key: "SCORES" as const, label: "Ngày Công" },
              { key: "RATE" as const, label: "Tỷ Lệ KPI (%)" },
              { key: "VIDEOS" as const, label: "Videos" },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setMetricTab(tab.key)}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  metricTab === tab.key
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Recharts Chart View */}
        {timeSeriesData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-xs text-slate-400">
            Không có dữ liệu trong khoảng ngày đã chọn.
          </div>
        ) : (
          <div className="h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={timeSeriesData}
                margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                onClick={(e: any) => {
                  if (e?.activePayload?.[0]?.payload?.date && onSelectDate) {
                    onSelectDate(e.activePayload[0].payload.date);
                  }
                }}
              >
                <defs>
                  <linearGradient id="kpiGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="cumScoreGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#334155"
                  opacity={0.2}
                />
                <XAxis
                  dataKey="displayDate"
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "#334155", opacity: 0.3 }}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  unit={!isSingleUser && (metricTab === "ALL" || metricTab === "SCORES") ? " NV" : ""}
                  domain={isSingleUser && (metricTab === "ALL" || metricTab === "SCORES") ? [0, 1] : ["auto", "auto"]}
                  ticks={isSingleUser && (metricTab === "ALL" || metricTab === "SCORES") ? [0, 0.5, 1] : undefined}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 100]}
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  unit="%"
                />
                <Tooltip content={<CustomComposedTooltip />} />
                <Legend
                  wrapperStyle={{ paddingTop: "15px", fontSize: "12px" }}
                  iconType="circle"
                />

                {/* Team Mode: Stacked Bars for 1.0, 0.5, 0 Công */}
                {!isSingleUser && (metricTab === "ALL" || metricTab === "SCORES") && (
                  <>
                    <Bar
                      yAxisId="left"
                      dataKey="fullWorkdays"
                      name="1.0 Công (Đạt)"
                      stackId="score"
                      fill="#10b981"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="halfWorkdays"
                      name="0.5 Công"
                      stackId="score"
                      fill="#f59e0b"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="zeroWorkdays"
                      name="0 Công"
                      stackId="score"
                      fill="#ef4444"
                      radius={[4, 4, 0, 0]}
                    />
                  </>
                )}

                {/* Single User Mode: Bar for Workday Score, color-coded by score */}
                {isSingleUser && (metricTab === "ALL" || metricTab === "SCORES") && (
                  <Bar
                    yAxisId="left"
                    dataKey="totalScore"
                    name="Ngày Công"
                    radius={[4, 4, 0, 0]}
                  >
                    {timeSeriesData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          entry.totalScore >= 1.0
                            ? SCORE_COLORS.FULL
                            : entry.totalScore === 0.5
                            ? SCORE_COLORS.HALF
                            : SCORE_COLORS.ZERO
                        }
                      />
                    ))}
                  </Bar>
                )}

                {/* Video Count Bar (If Videos tab selected) */}
                {metricTab === "VIDEOS" && (
                  <Bar
                    yAxisId="left"
                    dataKey="totalVideos"
                    name="Video Đã Đăng"
                    fill="#ec4899"
                    radius={[4, 4, 0, 0]}
                  />
                )}

                {/* Cumulative Score for Single User */}
                {isSingleUser && (metricTab === "ALL" || metricTab === "SCORES") && (
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="cumulativeScore"
                    name="Tích Lũy Công"
                    stroke="#8b5cf6"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: "#8b5cf6", stroke: "#ffffff", strokeWidth: 1.5 }}
                  />
                )}

                {/* Avg Completion Rate Smooth Area Line (Rendered on top of bars) */}
                {(metricTab === "ALL" || metricTab === "RATE") && (
                  <>
                    <Area
                      yAxisId="right"
                      type="monotone"
                      dataKey="avgCompletionRate"
                      name="Tiến Độ KPI (Nền)"
                      stroke="transparent"
                      fill="url(#kpiGradient)"
                      legendType="none"
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="avgCompletionRate"
                      name="Tiến Độ KPI (%)"
                      stroke="#06b6d4"
                      strokeWidth={3}
                      dot={{ r: 4, fill: "#06b6d4", stroke: "#ffffff", strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: "#0891b2", stroke: "#ffffff", strokeWidth: 2 }}
                    />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 3. Row 2: Score Distribution Donut Chart + Video/Sync Velocity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Score Distribution Donut */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-500" />
              <span>Cơ Cấu Điểm Ngày Công</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Tỷ trọng hoàn thành 1.0 công, 0.5 công và 0 công trong kỳ.
            </p>
          </div>

          <div className="my-3 relative h-56 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={scoreDistributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={62}
                  outerRadius={85}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {scoreDistributionData.map((entry, idx) => (
                    <Cell key={`cell-${idx}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: any, name: any, item: any) => [
                    `${val} ca (${item.payload.percentage}%)`,
                    name,
                  ]}
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#1e293b",
                    borderRadius: "12px",
                    fontSize: "12px",
                    color: "#fff",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Donut Center Label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {summaryMetrics.totalScore}
              </span>
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Tổng Công
              </span>
            </div>
          </div>

          {/* Breakdown Legend List */}
          <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs">
            {scoreDistributionData.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between font-semibold"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-slate-700 dark:text-slate-300">
                    {item.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-900 dark:text-white font-bold">
                    {item.value} ca
                  </span>
                  <span className="text-slate-400 font-mono text-[11px]">
                    ({item.percentage}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Daily Video Posting Velocity */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Video className="w-4 h-4 text-pink-500" />
              <span>Tiến Độ Đăng Video Theo Ngày</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Theo dõi số lượng video được nhân sự đăng tải theo từng ngày.
            </p>
          </div>

          <div className="h-60 w-full my-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={timeSeriesData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="vidGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ec4899" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#ec4899" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#334155"
                  opacity={0.2}
                />
                <XAxis
                  dataKey="displayDate"
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "#334155", opacity: 0.3 }}
                />
                <YAxis
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#1e293b",
                    borderRadius: "12px",
                    fontSize: "12px",
                    color: "#fff",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="totalVideos"
                  name="Video Đã Đăng"
                  stroke="#ec4899"
                  strokeWidth={2.5}
                  fill="url(#vidGrad)"
                  dot={{ r: 3.5, fill: "#ec4899", stroke: "#ffffff", strokeWidth: 1.5 }}
                  activeDot={{ r: 5.5, fill: "#ec4899", stroke: "#ffffff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
            <span>Tổng video hoàn thành: <strong className="text-pink-500">{summaryMetrics.totalVideos} videos</strong></span>
            <span>Tỷ lệ hoàn thành trung bình: <strong className="text-emerald-500">{summaryMetrics.avgRate}%</strong></span>
          </div>
        </div>
      </div>

      {/* 4. Staff Performance & Attendance Leaderboard (Only when Team mode) */}
      {!isSingleUser && staffRanking.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-500" />
                <span>Bảng Xếp Hạng & Đánh Giá Năng Lực Nhân Sự</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Xếp hạng dựa trên tổng ngày công đạt được, số ngày đạt 100% KPI và số lượng video lên kênh.
              </p>
            </div>
            <span className="text-xs font-bold text-slate-400">
              {staffRanking.length} Nhân sự
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[700px]">
              <thead className="bg-slate-50/80 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-3 w-12 text-center">#</th>
                  <th className="py-2.5 px-4">Nhân sự</th>
                  <th className="py-2.5 px-3 text-center">Vai trò</th>
                  <th className="py-2.5 px-3 text-center">Tổng công</th>
                  <th className="py-2.5 px-3 text-center">Ngày đạt 100%</th>
                  <th className="py-2.5 px-3 text-center">Video đã đăng</th>
                  <th className="py-2.5 px-4">Tiến độ KPI TB</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {staffRanking.map((s, idx) => (
                  <tr
                    key={s.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="py-3 px-3 text-center font-bold">
                      {idx === 0 ? (
                        <span className="inline-block w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-black text-xs leading-6">
                          1
                        </span>
                      ) : idx === 1 ? (
                        <span className="inline-block w-6 h-6 rounded-full bg-slate-300 dark:bg-slate-700 text-slate-900 dark:text-white font-black text-xs leading-6">
                          2
                        </span>
                      ) : idx === 2 ? (
                        <span className="inline-block w-6 h-6 rounded-full bg-amber-600 text-white font-black text-xs leading-6">
                          3
                        </span>
                      ) : (
                        <span className="text-slate-400">{idx + 1}</span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-pink-500 to-rose-500 text-white font-bold flex items-center justify-center shrink-0 uppercase text-xs">
                          {s.name.slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 dark:text-white truncate">
                            {s.name}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono truncate">
                            @{s.username}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-3 text-center">
                      <span className={`text-[11px] px-2 py-0.5 rounded-lg font-bold ${
                        s.role === "ADMIN"
                          ? "bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20"
                          : s.role === "LEAD"
                          ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                      }`}>
                        {s.role === "ADMIN" ? "Quản trị viên" : s.role === "LEAD" ? "Trưởng nhóm" : "Nhân viên"}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-center font-black text-emerald-600 dark:text-emerald-400 text-sm">
                      {s.totalScore}
                    </td>

                    <td className="py-3 px-3 text-center font-bold text-slate-700 dark:text-slate-300">
                      {s.perfectDays} / {s.recordCount} ngày
                    </td>

                    <td className="py-3 px-3 text-center font-bold text-pink-600 dark:text-pink-400">
                      {s.totalVideos}
                    </td>

                    <td className="py-3 px-4 min-w-[160px]">
                      <div className="flex items-center justify-between text-xs font-bold mb-1">
                        <span className="text-slate-700 dark:text-slate-300">
                          {s.avgRate}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            s.avgRate >= 85
                              ? "bg-emerald-500"
                              : s.avgRate >= 50
                              ? "bg-amber-500"
                              : "bg-rose-500"
                          }`}
                          style={{ width: `${Math.min(100, s.avgRate)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
