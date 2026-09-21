"use client";

import React from "react";
import {
  DollarSign,
  Eye,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  CheckSquare,
  AlertTriangle,
  Minus,
  Sparkles,
} from "lucide-react";

interface AnalyticsKpiRibbonProps {
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
  isStaff?: boolean;
}

function formatCompactNumber(num: number): string {
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + "B";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toLocaleString();
}

export default function AnalyticsKpiRibbon({ kpi, isStaff }: AnalyticsKpiRibbonProps) {
  const cards = [
    {
      label: isStaff ? "Doanh Thu Của Bạn" : "Tổng Doanh Thu Studio",
      value: `$${kpi.totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      delta: kpi.revenueGrowthPct,
      deltaLabel: `vs kỳ trước ($${Number(kpi.prevTotalRevenue).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`,
      icon: DollarSign,
      gradient: "from-pink-500/10 via-rose-500/5 to-transparent",
      accent: "text-pink-600 dark:text-pink-400 bg-pink-500/10 border-pink-500/20",
    },
    {
      label: isStaff ? "Views Tài Khoản Của Bạn" : "Tổng Lượt Views",
      value: formatCompactNumber(kpi.totalViews),
      delta: kpi.viewsGrowthPct,
      deltaLabel: `vs kỳ trước (${formatCompactNumber(kpi.prevTotalViews)})`,
      icon: Eye,
      gradient: "from-cyan-500/10 via-blue-500/5 to-transparent",
      accent: "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    },
    {
      label: "RPM Trung Bình",
      value: `$${kpi.avgRpm.toFixed(2)}`,
      delta: kpi.rpmGrowthPct,
      deltaLabel: `kỳ trước: $${kpi.prevAvgRpm.toFixed(2)}`,
      icon: Sparkles,
      gradient: "from-amber-500/10 via-orange-500/5 to-transparent",
      accent: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
    },
    {
      label: "Sức Khỏe Dàn Account",
      value: `${kpi.fleetHealthScore}%`,
      subText: `${kpi.healthyAccountsCount}/${kpi.totalAccountsCount} kênh an toàn`,
      isHealth: true,
      icon: ShieldCheck,
      gradient: "from-emerald-500/10 via-teal-500/5 to-transparent",
      accent: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    },
    {
      label: isStaff ? "Tỉ Lệ Chấm Công Cá Nhân" : "Tỉ Lệ Hoàn Thành KPI",
      value: `${kpi.checklistCompletionRate}%`,
      delta: kpi.checklistRateDeltaPct,
      deltaLabel: `vs kỳ trước (${kpi.prevChecklistCompletionRate}%)`,
      icon: CheckSquare,
      gradient: "from-purple-500/10 via-indigo-500/5 to-transparent",
      accent: "text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/20",
    },
    {
      label: "Cảnh Báo & Rủi Ro",
      value: `${kpi.openCriticalAlertsCount + kpi.openWarningAlertsCount}`,
      subText: `${kpi.openCriticalAlertsCount} Nghiêm trọng | ${kpi.openWarningAlertsCount} Chú ý`,
      isAlert: true,
      hasCritical: kpi.openCriticalAlertsCount > 0,
      icon: AlertTriangle,
      gradient: "from-rose-500/10 via-red-500/5 to-transparent",
      accent: "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        const isPositive = (card.delta ?? 0) > 0;
        const isZero = (card.delta ?? 0) === 0;

        return (
          <div
            key={idx}
            className={`relative overflow-hidden bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all group`}
          >
            {/* Ambient Background Gradient */}
            <div
              className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${card.gradient} rounded-full blur-2xl pointer-events-none -mr-10 -mt-10 group-hover:scale-125 transition-transform duration-500`}
            />

            <div className="relative flex items-center justify-between gap-2 mb-2 min-w-0">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate flex-1 min-w-0" title={card.label}>
                {card.label}
              </span>
              <div className={`w-7 h-7 rounded-xl border flex items-center justify-center ${card.accent} shrink-0`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="relative">
              <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {card.value}
              </div>

              {/* Delta or Subtext */}
              <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium">
                {card.isHealth ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    {card.subText}
                  </span>
                ) : card.isAlert ? (
                  <span
                    className={`font-semibold ${
                      card.hasCritical
                        ? "text-rose-600 dark:text-rose-400 animate-pulse"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {card.subText}
                  </span>
                ) : (
                  <>
                    <span
                      className={`inline-flex items-center gap-0.5 font-bold px-1.5 py-0.5 rounded-md text-xs ${
                        isPositive
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : isZero
                          ? "bg-slate-500/10 text-slate-500 dark:text-slate-400"
                          : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {isPositive ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : isZero ? (
                        <Minus className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {isPositive ? "+" : ""}
                      {card.delta}%
                    </span>
                    <span className="text-slate-400 dark:text-slate-500 truncate">
                      {card.deltaLabel}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
