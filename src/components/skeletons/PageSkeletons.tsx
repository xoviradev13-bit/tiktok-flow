"use client";

import React from "react";
import { cn } from "@/lib/utils";

// ============================================================================
// Shared Skeleton Primitives
// ============================================================================

export function SkeletonBox({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "bg-slate-200/80 dark:bg-slate-800/70 animate-pulse rounded-2xl",
        className
      )}
      {...props}
    />
  );
}

export function SkeletonLine({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "bg-slate-200/80 dark:bg-slate-800/70 animate-pulse rounded-lg h-4",
        className
      )}
      {...props}
    />
  );
}

// ============================================================================
// 1. Accounts Page Skeleton
// ============================================================================
export function AccountsPageSkeleton() {
  return (
    <div className="space-y-6 w-full pb-20 animate-fadeIn">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBox className="h-8 w-72 rounded-xl" />
          <SkeletonLine className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBox className="h-10 w-28 rounded-xl" />
          <SkeletonBox className="h-10 w-36 rounded-xl" />
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-2 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <SkeletonLine className="h-3.5 w-20" />
              <SkeletonBox className="w-6 h-6 rounded-lg" />
            </div>
            <SkeletonBox className="h-7 w-24 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <SkeletonBox className="h-9 w-64 sm:w-80 rounded-xl" />
        <div className="flex items-center gap-2">
          <SkeletonBox className="h-9 w-28 rounded-xl" />
          <SkeletonBox className="h-9 w-28 rounded-xl" />
          <SkeletonBox className="h-9 w-20 rounded-xl" />
        </div>
      </div>

      {/* Card Grid Skeletons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 space-y-4 shadow-xs flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <SkeletonBox className="h-5 w-16 rounded-md" />
              <div className="flex items-center gap-1.5">
                <SkeletonBox className="h-5 w-20 rounded-full" />
                <SkeletonBox className="w-7 h-7 rounded-lg" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <SkeletonBox className="w-12 h-12 rounded-2xl shrink-0" />
              <div className="space-y-1.5 flex-1 min-w-0">
                <SkeletonLine className="h-4 w-32" />
                <SkeletonLine className="h-3 w-24" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-100 dark:border-slate-800/80">
              <div className="space-y-1">
                <SkeletonLine className="h-2.5 w-10" />
                <SkeletonLine className="h-4 w-16" />
              </div>
              <div className="space-y-1">
                <SkeletonLine className="h-2.5 w-10" />
                <SkeletonLine className="h-4 w-16" />
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
              <SkeletonLine className="h-3 w-20" />
              <SkeletonBox className="h-6 w-16 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 2. Account Detail Page Skeleton
// ============================================================================
export function AccountDetailSkeleton() {
  return (
    <div className="space-y-6 w-full pb-20 animate-fadeIn">
      {/* Top Breadcrumbs & Actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <SkeletonBox className="w-9 h-9 rounded-xl" />
          <SkeletonLine className="h-4 w-40" />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBox className="h-9 w-28 rounded-xl" />
          <SkeletonBox className="h-9 w-32 rounded-xl" />
        </div>
      </div>

      {/* Main Identity Banner Card */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <SkeletonBox className="w-20 h-20 rounded-3xl shrink-0" />
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <SkeletonBox className="h-6 w-48 rounded-lg" />
                <SkeletonBox className="h-5 w-16 rounded-full" />
              </div>
              <SkeletonLine className="h-4 w-32" />
              <div className="flex items-center gap-2 pt-1">
                <SkeletonBox className="h-5 w-20 rounded-md" />
                <SkeletonBox className="h-5 w-28 rounded-md" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start md:self-auto">
            <SkeletonBox className="h-10 w-32 rounded-xl" />
            <SkeletonBox className="h-10 w-28 rounded-xl" />
          </div>
        </div>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 space-y-2 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <SkeletonLine className="h-3.5 w-24" />
              <SkeletonBox className="w-7 h-7 rounded-lg" />
            </div>
            <SkeletonBox className="h-8 w-28 rounded-lg" />
            <SkeletonLine className="h-3 w-20" />
          </div>
        ))}
      </div>

      {/* Chart Section Skeleton */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <SkeletonBox className="h-5 w-40 rounded-lg" />
          <SkeletonBox className="h-8 w-48 rounded-xl" />
        </div>
        <SkeletonBox className="h-72 w-full rounded-2xl" />
      </div>
    </div>
  );
}

// ============================================================================
// 3. Groups Page Skeleton
// ============================================================================
export function GroupsPageSkeleton() {
  return (
    <div className="space-y-6 w-full pb-20 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBox className="h-8 w-64 rounded-xl" />
          <SkeletonLine className="h-4 w-96 max-w-full" />
        </div>
        <SkeletonBox className="h-10 w-36 rounded-xl" />
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-2 shadow-xs"
          >
            <SkeletonLine className="h-3 w-20" />
            <SkeletonBox className="h-7 w-16 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 flex items-center justify-between shadow-xs">
        <SkeletonBox className="h-9 w-72 rounded-xl" />
        <SkeletonBox className="h-9 w-20 rounded-xl" />
      </div>

      {/* Group Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs flex flex-col justify-between"
          >
            <div className="h-2 w-full bg-slate-200 dark:bg-slate-800" />
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <SkeletonBox className="h-6 w-28 rounded-lg" />
                <SkeletonBox className="w-7 h-7 rounded-lg" />
              </div>
              <SkeletonLine className="h-3.5 w-full" />
              <div className="space-y-1.5 pt-1">
                <SkeletonLine className="h-3 w-20" />
                <div className="flex items-center gap-2">
                  <SkeletonBox className="w-7 h-7 rounded-full" />
                  <SkeletonLine className="h-3.5 w-24" />
                </div>
              </div>
              <div className="flex items-center -space-x-1.5 pt-1">
                {Array.from({ length: 4 }).map((_, j) => (
                  <SkeletonBox key={j} className="w-7 h-7 rounded-full border-2 border-white dark:border-slate-900" />
                ))}
              </div>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-950/50 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
              <SkeletonLine className="h-3 w-16" />
              <SkeletonLine className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 4. Users Page Skeleton
// ============================================================================
export function UsersPageSkeleton() {
  return (
    <div className="space-y-6 w-full pb-20 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBox className="h-8 w-72 rounded-xl" />
          <SkeletonLine className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBox className="h-10 w-32 rounded-xl" />
          <SkeletonBox className="h-10 w-36 rounded-xl" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <SkeletonBox className="h-9 w-40 rounded-xl" />
        <SkeletonBox className="h-9 w-36 rounded-xl" />
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-2 shadow-xs"
          >
            <SkeletonLine className="h-3 w-24" />
            <SkeletonBox className="h-7 w-16 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 flex items-center justify-between shadow-xs">
        <SkeletonBox className="h-9 w-64 sm:w-80 rounded-xl" />
        <div className="flex items-center gap-2">
          <SkeletonBox className="h-9 w-24 rounded-xl" />
          <SkeletonBox className="h-9 w-20 rounded-xl" />
        </div>
      </div>

      {/* User Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 space-y-4 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <SkeletonBox className="w-4 h-4 rounded" />
              <div className="flex items-center gap-1.5">
                <SkeletonBox className="h-5 w-16 rounded-full" />
                <SkeletonBox className="w-7 h-7 rounded-lg" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <SkeletonBox className="w-12 h-12 rounded-2xl shrink-0" />
              <div className="space-y-1.5 flex-1">
                <SkeletonLine className="h-4 w-28" />
                <SkeletonLine className="h-3 w-20" />
              </div>
            </div>
            <div className="space-y-2">
              <SkeletonLine className="h-3.5 w-full" />
              <SkeletonLine className="h-3.5 w-3/4" />
            </div>
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <SkeletonLine className="h-3 w-20" />
              <SkeletonLine className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 5. User Fleet Detail Page Skeleton
// ============================================================================
export function UserDetailSkeleton() {
  return (
    <div className="space-y-6 w-full pb-20 animate-fadeIn">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="flex items-center gap-4">
          <SkeletonBox className="w-10 h-10 rounded-xl shrink-0" />
          <div className="flex items-center gap-3">
            <SkeletonBox className="w-14 h-14 rounded-2xl shrink-0" />
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <SkeletonBox className="h-6 w-40 rounded-lg" />
                <SkeletonBox className="h-5 w-20 rounded-full" />
              </div>
              <SkeletonLine className="h-3.5 w-28" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBox className="h-9 w-28 rounded-xl" />
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-2 shadow-xs"
          >
            <SkeletonLine className="h-3 w-24" />
            <SkeletonBox className="h-7 w-20 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Accounts Table Skeleton */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <SkeletonBox className="h-6 w-48 rounded-lg" />
          <SkeletonBox className="h-9 w-64 rounded-xl" />
        </div>
        <div className="space-y-3 pt-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-2 border-b border-slate-100 dark:border-slate-800/60">
              <SkeletonBox className="w-8 h-8 rounded-lg shrink-0" />
              <SkeletonLine className="h-4 w-40 flex-1" />
              <SkeletonBox className="h-6 w-20 rounded-lg" />
              <SkeletonBox className="h-6 w-24 rounded-lg" />
              <SkeletonLine className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 6. Analytics Page Skeleton
// ============================================================================
export function AnalyticsPageSkeleton() {
  return (
    <div className="space-y-6 w-full pb-20 animate-fadeIn">
      <div className="space-y-2">
        <SkeletonBox className="h-8 w-72 rounded-xl" />
        <SkeletonLine className="h-4 w-96 max-w-full" />
      </div>

      {/* Filter Toolbar Skeleton */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SkeletonBox className="h-9 w-28 rounded-xl" />
          <SkeletonBox className="h-9 w-36 rounded-xl" />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBox className="h-9 w-28 rounded-xl" />
          <SkeletonBox className="h-9 w-28 rounded-xl" />
          <SkeletonBox className="h-9 w-24 rounded-xl" />
        </div>
      </div>

      {/* 6 KPI Cards Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-2 shadow-xs"
          >
            <SkeletonLine className="h-3 w-16" />
            <SkeletonBox className="h-7 w-20 rounded-lg" />
            <SkeletonLine className="h-2.5 w-12" />
          </div>
        ))}
      </div>

      {/* Tab Buttons */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonBox key={i} className="h-8 w-32 rounded-xl" />
        ))}
      </div>

      {/* Analytics Chart & Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
          <SkeletonBox className="h-5 w-48 rounded-lg" />
          <SkeletonBox className="h-80 w-full rounded-2xl" />
        </div>
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
          <SkeletonBox className="h-5 w-36 rounded-lg" />
          <SkeletonBox className="h-80 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 7. Leaderboard Page Skeleton
// ============================================================================
export function LeaderboardPageSkeleton() {
  return (
    <div className="space-y-8 w-full pb-20 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBox className="h-8 w-72 rounded-xl" />
          <SkeletonLine className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 rounded-xl">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBox key={i} className="h-7 w-20 rounded-lg" />
          ))}
        </div>
      </div>

      {/* Podium Top 3 Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 items-end">
        {/* Silver */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center space-y-3 shadow-sm order-2 md:order-1">
          <SkeletonBox className="w-12 h-12 rounded-full mx-auto" />
          <SkeletonBox className="h-5 w-32 mx-auto rounded-lg" />
          <SkeletonLine className="h-3 w-24 mx-auto" />
          <SkeletonBox className="h-7 w-28 mx-auto rounded-lg" />
        </div>
        {/* Gold */}
        <div className="bg-white dark:bg-slate-900/80 border-2 border-yellow-400/40 dark:border-yellow-500/40 rounded-3xl p-8 text-center space-y-4 shadow-lg order-1 md:order-2">
          <SkeletonBox className="w-16 h-16 rounded-full mx-auto" />
          <SkeletonBox className="h-6 w-36 mx-auto rounded-lg" />
          <SkeletonLine className="h-3.5 w-28 mx-auto" />
          <SkeletonBox className="h-8 w-32 mx-auto rounded-lg" />
        </div>
        {/* Bronze */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center space-y-3 shadow-sm order-3">
          <SkeletonBox className="w-12 h-12 rounded-full mx-auto" />
          <SkeletonBox className="h-5 w-32 mx-auto rounded-lg" />
          <SkeletonLine className="h-3 w-24 mx-auto" />
          <SkeletonBox className="h-7 w-28 mx-auto rounded-lg" />
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
        <SkeletonBox className="h-6 w-48 rounded-lg" />
        <div className="space-y-3 pt-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-2 border-b border-slate-100 dark:border-slate-800/60">
              <SkeletonBox className="w-6 h-6 rounded-md shrink-0" />
              <SkeletonLine className="h-4 w-36 flex-1" />
              <SkeletonLine className="h-4 w-24" />
              <SkeletonLine className="h-4 w-24" />
              <SkeletonBox className="h-6 w-28 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 8. Revenue Page Skeleton
// ============================================================================
export function RevenuePageSkeleton() {
  return (
    <div className="space-y-6 w-full pb-20 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBox className="h-8 w-72 rounded-xl" />
          <SkeletonLine className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBox className="h-9 w-48 rounded-xl" />
          <SkeletonBox className="h-9 w-28 rounded-xl" />
        </div>
      </div>

      {/* 4 Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 space-y-2 shadow-xs"
          >
            <SkeletonLine className="h-3 w-28" />
            <SkeletonBox className="h-8 w-32 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Chart Skeleton */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <SkeletonBox className="h-5 w-40 rounded-lg" />
          <SkeletonBox className="h-8 w-36 rounded-xl" />
        </div>
        <SkeletonBox className="h-80 w-full rounded-2xl" />
      </div>
    </div>
  );
}

// ============================================================================
// 9. Checklist Page Skeleton
// ============================================================================
export function ChecklistPageSkeleton() {
  return (
    <div className="space-y-6 w-full pb-24 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBox className="h-8 w-72 rounded-xl" />
          <SkeletonLine className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBox className="h-10 w-32 rounded-xl" />
          <SkeletonBox className="h-10 w-32 rounded-xl" />
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 space-y-1.5 shadow-xs"
          >
            <SkeletonLine className="h-3 w-16" />
            <SkeletonBox className="h-6 w-16 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <SkeletonBox className="h-8 w-48 rounded-xl" />
          <SkeletonBox className="h-8 w-32 rounded-xl" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <SkeletonBox className="h-9 w-64 rounded-xl" />
          <SkeletonBox className="h-9 w-48 rounded-xl" />
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-2.5 border-b border-slate-100 dark:border-slate-800/60">
              <SkeletonBox className="w-5 h-5 rounded" />
              <SkeletonLine className="h-4 w-36 flex-1" />
              <SkeletonBox className="h-6 w-20 rounded-full" />
              <SkeletonLine className="h-4 w-24" />
              <SkeletonBox className="h-6 w-24 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 10. Extensions Page Skeleton
// ============================================================================
export function ExtensionsPageSkeleton() {
  return (
    <div className="space-y-6 w-full pb-16 animate-fadeIn">
      <div className="space-y-2">
        <SkeletonBox className="h-8 w-72 rounded-xl" />
        <SkeletonLine className="h-4 w-96 max-w-full" />
      </div>

      {/* Hero Client Agent Banner Skeleton */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-3xl p-6 md:p-8 space-y-4 border border-slate-800">
        <SkeletonBox className="h-6 w-48 rounded-full bg-slate-800" />
        <SkeletonBox className="h-8 w-80 rounded-xl bg-slate-800" />
        <SkeletonLine className="h-4 w-96 max-w-full bg-slate-800" />
        <div className="flex items-center gap-3 pt-2">
          <SkeletonBox className="h-10 w-44 rounded-2xl bg-slate-800" />
          <SkeletonBox className="h-10 w-44 rounded-2xl bg-slate-800" />
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <SkeletonBox className="h-9 w-64 rounded-xl" />
        <div className="flex items-center gap-2">
          <SkeletonBox className="h-9 w-28 rounded-xl" />
          <SkeletonBox className="h-9 w-28 rounded-xl" />
        </div>
      </div>

      {/* Extension Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 space-y-4 shadow-xs flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <SkeletonBox className="h-5 w-24 rounded-full" />
                <SkeletonBox className="h-5 w-12 rounded-md" />
              </div>
              <div className="flex items-start gap-3 pt-1">
                <SkeletonBox className="w-12 h-12 rounded-2xl shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <SkeletonLine className="h-4 w-32" />
                  <SkeletonLine className="h-3 w-44" />
                </div>
              </div>
              <SkeletonLine className="h-3.5 w-full" />
            </div>
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <SkeletonLine className="h-3 w-20" />
              <SkeletonBox className="h-8 w-24 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 11. GPM Hub Page Skeleton
// ============================================================================
export function GpmPageSkeleton() {
  return (
    <div className="space-y-6 w-full pb-20 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBox className="h-8 w-72 rounded-xl" />
          <SkeletonLine className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBox className="h-10 w-36 rounded-xl" />
          <SkeletonBox className="h-10 w-28 rounded-xl" />
        </div>
      </div>

      {/* GPM Status Card */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SkeletonBox className="w-10 h-10 rounded-2xl" />
            <div className="space-y-1">
              <SkeletonBox className="h-5 w-40 rounded-lg" />
              <SkeletonLine className="h-3 w-28" />
            </div>
          </div>
          <SkeletonBox className="h-6 w-24 rounded-full" />
        </div>
      </div>

      {/* Linked Accounts Fleet Table Skeleton */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
        <SkeletonBox className="h-6 w-60 rounded-lg" />
        <div className="space-y-3 pt-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-2 border-b border-slate-100 dark:border-slate-800/60">
              <SkeletonLine className="h-4 w-36 flex-1" />
              <SkeletonLine className="h-4 w-40 font-mono" />
              <SkeletonLine className="h-4 w-24" />
              <SkeletonBox className="h-6 w-20 rounded-lg" />
              <SkeletonBox className="h-7 w-20 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 12. Settings Page Skeleton
// ============================================================================
export function SettingsPageSkeleton() {
  return (
    <div className="space-y-8 w-full pb-20 animate-fadeIn">
      <div className="space-y-2">
        <SkeletonBox className="h-8 w-72 rounded-xl" />
        <SkeletonLine className="h-4 w-96 max-w-full" />
      </div>

      {/* Setting Cards */}
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-sm"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <SkeletonBox className="w-9 h-9 rounded-xl" />
                <div className="space-y-1">
                  <SkeletonBox className="h-5 w-48 rounded-lg" />
                  <SkeletonLine className="h-3 w-64" />
                </div>
              </div>
              <SkeletonBox className="h-6 w-12 rounded-full" />
            </div>
            <div className="space-y-3 pt-2">
              <SkeletonLine className="h-4 w-full" />
              <SkeletonLine className="h-4 w-3/4" />
              <SkeletonBox className="h-10 w-full rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
