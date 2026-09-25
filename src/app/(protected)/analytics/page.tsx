"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useUrlParams } from "@/hooks/useUrlState";
import { trpc } from "@/lib/trpc";
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Users,
  CheckSquare,
  ShieldAlert,
  Sparkles,
  Layers,
  Activity,
} from "lucide-react";
import AnalyticsFilterToolbar, {
  PeriodType,
} from "@/features/analytics/components/AnalyticsFilterToolbar";
import AnalyticsKpiRibbon from "@/features/analytics/components/AnalyticsKpiRibbon";
import OverviewTab from "@/features/analytics/components/OverviewTab";
import RevenueAnalyticsTab from "@/features/analytics/components/RevenueAnalyticsTab";
import FleetAnalyticsTab from "@/features/analytics/components/FleetAnalyticsTab";
import OperationsAnalyticsTab from "@/features/analytics/components/OperationsAnalyticsTab";
import RiskAuditTab from "@/features/analytics/components/RiskAuditTab";
import { exportAnalyticsToExcel } from "@/features/analytics/utils/exportAnalyticsExcel";
import { TeamScopeBanner } from "@/components/team/TeamScopeBanner";
import { toast } from "sonner";

type TabKey = "OVERVIEW" | "REVENUE" | "FLEET" | "OPERATIONS" | "RISK";

function AnalyticsPageContent() {
  const { data: session } = useSession();

  // SaaS URL Query State Synchronization
  const { searchParams, updateUrlParams } = useUrlParams();

  const validTabs: TabKey[] = ["OVERVIEW", "REVENUE", "FLEET", "OPERATIONS", "RISK"];
  const paramTab = searchParams?.get("tab")?.toUpperCase() as TabKey;
  const initialTab = validTabs.includes(paramTab) ? paramTab : "OVERVIEW";
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  const rawPeriod = (searchParams?.get("period") || "28D") as PeriodType;
  // Legacy ALL → 365D (TikTok Studio daily data is capped at 365 days)
  const initialPeriod: PeriodType = rawPeriod === "ALL" ? "365D" : rawPeriod;
  const [period, setPeriod] = useState<PeriodType>(initialPeriod);

  const initialFrom = searchParams?.get("from") || undefined;
  const initialTo = searchParams?.get("to") || undefined;
  const [startDate, setStartDate] = useState<string | undefined>(initialFrom);
  const [endDate, setEndDate] = useState<string | undefined>(initialTo);

  const initialUser = searchParams?.get("user") || null;
  const [operatorId, setOperatorId] = useState<string | null>(initialUser);

  const initialTeam = searchParams?.get("team") || searchParams?.get("group") || null;
  const [teamId, setTeamId] = useState<string | null>(initialTeam);

  const initialCountry = searchParams?.get("country") || null;
  const [country, setCountry] = useState<string | null>(initialCountry);

  const [status, setStatus] = useState<any | null>(null);

  // Auto sync active state to URL
  useEffect(() => {
    updateUrlParams(
      {
        tab: activeTab,
        period: period,
        from: startDate,
        to: endDate,
        user: operatorId,
        team: teamId,
        country: country,
      },
      {
        period: "28D",
        from: undefined,
        to: undefined,
        user: null,
        team: null,
        country: null,
      }
    );
  }, [
    activeTab,
    period,
    startDate,
    endDate,
    operatorId,
    teamId,
    country,
    updateUrlParams,
  ]);

  const utils = trpc.useUtils();

  // Dynamic filter options
  const { data: filterOptions } = trpc.analytics.getFilterOptions.useQuery();

  // Query main dashboard analytics
  const {
    data,
    isLoading,
    isRefetching,
    refetch,
  } = trpc.analytics.getDashboardData.useQuery(
    {
      period,
      startDate,
      endDate,
      operatorId,
      teamId,
      country,
      status,
    },
    {
      staleTime: 30000,
    }
  );

  // Listen for global refresh event
  useEffect(() => {
    const handleRefresh = () => {
      utils.analytics.getDashboardData.invalidate();
    };
    window.addEventListener("refreshData", handleRefresh);
    return () => window.removeEventListener("refreshData", handleRefresh);
  }, [utils]);

  const normalizedFilterOptions = useMemo(() => {
    if (!filterOptions) return undefined;
    return {
      ...filterOptions,
      countries: filterOptions.countries.filter((c): c is string => Boolean(c)),
    };
  }, [filterOptions]);

  const sanitizedData = useMemo(() => {
    if (!data) return undefined;
    const sanitizeAccount = (acc: any) => ({
      ...acc,
      country: acc.country || "Chưa xác định",
    });
    return {
      ...data,
      topAccounts: data.topAccounts.map(sanitizeAccount),
      atRiskAccounts: data.atRiskAccounts.map(sanitizeAccount),
    };
  }, [data]);

  const handleExportExcel = () => {
    if (!sanitizedData) {
      toast.error("Chưa có dữ liệu để xuất Excel.");
      return;
    }
    try {
      exportAnalyticsToExcel(sanitizedData as any);
      toast.success("Xuất báo cáo Excel thành công!");
    } catch (err: any) {
      toast.error("Không thể xuất file Excel: " + (err?.message || "Lỗi không xác định"));
    }
  };

  const tabs: Array<{ key: TabKey; label: string; icon: any; count?: number }> = [
    { key: "OVERVIEW", label: "Tổng Quan Điều Hành", icon: Activity },
    { key: "REVENUE", label: "Doanh Thu & RPM", icon: DollarSign },
    { key: "FLEET", label: "Dàn Kênh & Thị Trường", icon: Users },
    { key: "OPERATIONS", label: "Vận Hành & Chấm Công", icon: CheckSquare },
    {
      key: "RISK",
      label: "Rủi Ro & Cảnh Báo",
      icon: ShieldAlert,
      count: data ? data.kpi.openCriticalAlertsCount + data.kpi.openWarningAlertsCount : undefined,
    },
  ];

  return (
    <div className="space-y-6 animate-fadeIn pb-16">
      <TeamScopeBanner className="mb-2" />
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5 min-w-0">
            <BarChart3 className="w-6 h-6 text-pink-500 shrink-0" />
            <span className="truncate">Trung Tâm Phân Tích & Báo Cáo</span>
            <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-xs font-extrabold uppercase bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 shrink-0">
              Tổng Hợp
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
            Hệ thống phân tích thông minh hợp nhất toàn bộ dữ liệu tài khoản, doanh thu, KPI chấm công và cảnh báo rủi ro.
          </p>
        </div>
      </div>

      {/* 1. Filter Toolbar */}
      <AnalyticsFilterToolbar
        period={period}
        setPeriod={setPeriod}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        operatorId={operatorId}
        setOperatorId={setOperatorId}
        teamId={teamId}
        setTeamId={setTeamId}
        country={country}
        setCountry={setCountry}
        status={status}
        setStatus={setStatus}
        filterOptions={normalizedFilterOptions as any}
        isLoading={isLoading || isRefetching}
        onRefresh={() => refetch()}
        onExportExcel={handleExportExcel}
      />

      {/* 2. KPI Summary Ribbon */}
      {isLoading && !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-28 rounded-2xl bg-slate-100 dark:bg-slate-800/60 animate-pulse border border-slate-200/50 dark:border-slate-800/50"
            />
          ))}
        </div>
      ) : data ? (
        <AnalyticsKpiRibbon kpi={data.kpi} isStaff={data.isStaff} />
      ) : null}

      {/* 3. Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-200 dark:border-slate-800 pb-2 scrollbar-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                active
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/50"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {typeof tab.count === "number" && tab.count > 0 && (
                <span
                  className={`text-xs font-black px-1.5 py-0.2 rounded-full ${
                    active
                      ? "bg-rose-500 text-white"
                      : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 4. Active Tab Content */}
      {isLoading && (!data || !sanitizedData) ? (
        <div className="h-96 rounded-2xl bg-slate-100 dark:bg-slate-800/40 animate-pulse flex items-center justify-center text-slate-400 text-xs">
          Đang tải dữ liệu phân tích hệ thống...
        </div>
      ) : data && sanitizedData ? (
        <>
          {activeTab === "OVERVIEW" && (
            <OverviewTab
              timeSeries={data.timeSeries}
              distributions={data.distributions}
              topAccounts={sanitizedData.topAccounts as any}
              atRiskAccounts={sanitizedData.atRiskAccounts as any}
              isStaff={data.isStaff}
            />
          )}

          {activeTab === "REVENUE" && (
            <RevenueAnalyticsTab
              timeSeries={data.timeSeries}
              countryDistribution={data.distributions.country}
              topAccounts={sanitizedData.topAccounts as any}
            />
          )}

          {activeTab === "FLEET" && (
            <FleetAnalyticsTab
              statusDistribution={data.distributions.status}
              countryDistribution={data.distributions.country}
              totalAccountsCount={data.kpi.totalAccountsCount}
              healthyAccountsCount={data.kpi.healthyAccountsCount}
              fleetHealthScore={data.kpi.fleetHealthScore}
            />
          )}

          {activeTab === "OPERATIONS" && (
            <OperationsAnalyticsTab
              timeSeries={data.timeSeries}
              operatorBenchmarks={data.operatorBenchmarks}
              personalBenchmark={data.personalBenchmark}
              isStaff={data.isStaff}
            />
          )}

          {activeTab === "RISK" && (
            <RiskAuditTab
              alertsBreakdown={data.alertsBreakdown}
              recentLogs={data.recentLogs}
            />
          )}
        </>
      ) : (
        <div className="py-12 text-center text-slate-400 text-xs">
          Không tìm thấy dữ liệu phù hợp với bộ lọc hiện tại.
        </div>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400 text-xs">Đang tải thống kê...</div>}>
      <AnalyticsPageContent />
    </Suspense>
  );
}
