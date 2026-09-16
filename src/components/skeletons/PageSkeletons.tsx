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
          <SkeletonBox className="h-8 w-80 rounded-xl" />
          <SkeletonLine className="h-4 w-96 max-w-full" />
        </div>
        <SkeletonBox className="h-10 w-36 rounded-xl" />
      </div>

      {/* 7-card KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-1.5 shadow-xs"
          >
            <SkeletonLine className="h-3 w-20" />
            <SkeletonBox className="h-6 w-14 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Sticky Toolbar */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <SkeletonBox className="h-9 w-56 rounded-xl" />
            <SkeletonBox className="h-9 w-36 rounded-xl" />
            <SkeletonBox className="h-9 w-40 rounded-xl" />
            <SkeletonBox className="h-9 w-24 rounded-xl" />
          </div>
          <div className="flex items-center gap-2">
            <SkeletonBox className="h-9 w-28 rounded-xl" />
            <SkeletonBox className="h-9 w-9 rounded-xl" />
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <SkeletonBox className="h-7 w-7 rounded-lg" />
              <SkeletonBox className="h-7 w-7 rounded-lg" />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-4 px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <SkeletonBox className="w-4 h-4 rounded" />
          <SkeletonLine className="h-3 w-28" />
          <SkeletonLine className="h-3 w-20" />
          <SkeletonLine className="h-3 w-16 ml-auto" />
          <SkeletonLine className="h-3 w-16" />
          <SkeletonLine className="h-3 w-20" />
          <SkeletonLine className="h-3 w-16" />
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800/60"
          >
            <SkeletonBox className="w-4 h-4 rounded shrink-0" />
            <SkeletonBox className="w-8 h-8 rounded-xl shrink-0" />
            <div className="space-y-1 flex-1 min-w-0">
              <SkeletonLine className="h-3.5 w-28" />
              <SkeletonLine className="h-2.5 w-20" />
            </div>
            <SkeletonBox className="h-5 w-16 rounded-full" />
            <SkeletonBox className="h-5 w-8 rounded-md" />
            <SkeletonLine className="h-3 w-20" />
            <SkeletonLine className="h-3 w-20" />
            <SkeletonLine className="h-3 w-16" />
            <SkeletonBox className="h-7 w-7 rounded-lg shrink-0" />
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex items-center justify-between">
        <SkeletonLine className="h-3.5 w-32" />
        <div className="flex items-center gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonBox key={i} className="h-8 w-8 rounded-lg" />
          ))}
        </div>
        <SkeletonBox className="h-9 w-24 rounded-xl" />
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
          <SkeletonBox className="h-8 w-80 rounded-xl" />
          <SkeletonLine className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <SkeletonBox className="h-10 w-44 rounded-xl" />
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
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <SkeletonBox className="h-9 w-56 rounded-xl" />
            <SkeletonBox className="h-9 w-32 rounded-xl" />
            <SkeletonBox className="h-9 w-36 rounded-xl" />
            <SkeletonBox className="h-9 w-24 rounded-xl" />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <SkeletonBox className="h-7 w-7 rounded-lg" />
              <SkeletonBox className="h-7 w-7 rounded-lg" />
            </div>
          </div>
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
      {/* Top Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <SkeletonBox className="w-6 h-6 rounded-lg" />
            <SkeletonBox className="h-8 w-80 rounded-xl" />
          </div>
          <SkeletonLine className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex items-center gap-2.5">
          <SkeletonBox className="h-10 w-44 rounded-xl" />
          <SkeletonBox className="h-10 w-36 rounded-xl" />
          <SkeletonBox className="h-10 w-36 rounded-xl" />
        </div>
      </div>

      {/* Cutoff Countdown & Auto-Scan Status Banner */}
      <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
            <SkeletonBox className="w-10 h-10 rounded-xl shrink-0" />
            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <SkeletonBox className="h-5 w-56 rounded-lg" />
                <SkeletonBox className="h-5 w-32 rounded-full" />
              </div>
              <SkeletonLine className="h-3.5 w-full max-w-lg" />
            </div>
          </div>

          {/* 4 Segmented KPI Counters */}
          <div className="w-full xl:w-auto grid grid-cols-2 sm:grid-cols-4 bg-slate-50 dark:bg-slate-950 p-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 gap-1.5 shrink-0">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="px-4 py-2 text-center bg-white dark:bg-slate-900/60 rounded-xl border border-slate-200/60 dark:border-slate-800/60 shadow-2xs space-y-1"
              >
                <SkeletonLine className="h-3 w-16 mx-auto" />
                <SkeletonBox className="h-5 w-12 mx-auto rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filter & Toolbar Box */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 shadow-sm space-y-3.5">
        {/* Row 1: Mode Switcher & Time Presets */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SkeletonBox className="h-9 w-44 rounded-xl" />
            <SkeletonBox className="h-9 w-44 rounded-xl" />
          </div>
          <div className="flex items-center gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBox key={i} className="h-8 w-20 rounded-xl" />
            ))}
            <SkeletonBox className="h-9 w-36 rounded-xl" />
          </div>
        </div>

        {/* Row 2: Search & Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100 dark:border-slate-800/80">
          <SkeletonBox className="h-10 w-72 sm:w-80 rounded-xl" />
          <div className="flex items-center gap-2">
            <SkeletonBox className="h-10 w-36 rounded-xl" />
            <SkeletonBox className="h-10 w-36 rounded-xl" />
            <SkeletonBox className="h-10 w-28 rounded-xl" />
          </div>
        </div>
      </div>

      {/* Master Table Skeleton */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
        {/* Table Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 text-xs">
          <SkeletonBox className="h-4 w-12 rounded" />
          <SkeletonBox className="h-4 w-36 rounded" />
          <SkeletonBox className="h-4 w-28 rounded" />
          <SkeletonBox className="h-4 w-32 rounded" />
          <SkeletonBox className="h-4 w-28 rounded" />
          <SkeletonBox className="h-4 w-24 rounded" />
          <SkeletonBox className="h-4 w-20 rounded" />
        </div>

        {/* Rows */}
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800/60"
            >
              <SkeletonBox className="w-5 h-5 rounded" />
              <div className="flex items-center gap-2.5 w-44">
                <SkeletonBox className="w-8 h-8 rounded-full shrink-0" />
                <div className="space-y-1">
                  <SkeletonLine className="h-3.5 w-24" />
                  <SkeletonLine className="h-2.5 w-16" />
                </div>
              </div>
              <SkeletonBox className="h-6 w-20 rounded-full" />
              <div className="w-36 space-y-1">
                <SkeletonLine className="h-3 w-28" />
                <SkeletonBox className="h-2 w-full rounded-full" />
              </div>
              <SkeletonBox className="h-6 w-20 rounded-full" />
              <SkeletonBox className="h-6 w-24 rounded-xl" />
              <SkeletonBox className="h-8 w-20 rounded-xl" />
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
    <div className="space-y-6 w-full pb-24 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBox className="h-8 w-72 rounded-xl" />
          <SkeletonLine className="h-4 w-96 max-w-full" />
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <SkeletonBox className="h-9 w-full md:w-80 rounded-xl" />
          <div className="flex items-center gap-2">
            <SkeletonLine className="h-3.5 w-16" />
            <SkeletonBox className="h-9 w-44 rounded-xl" />
          </div>
        </div>
        {/* Category pill row */}
        <div className="flex items-center gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonBox key={i} className="h-8 w-24 rounded-xl" />
          ))}
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
    <div className="space-y-6 w-full pb-16 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBox className="h-8 w-80 rounded-xl" />
          <SkeletonLine className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SkeletonBox className="h-8 w-40 rounded-xl" />
          <SkeletonBox className="h-10 w-44 rounded-xl" />
        </div>
      </div>

      {/* 4 KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="p-5 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-3"
          >
            <div className="flex items-center justify-between">
              <SkeletonLine className="h-3 w-28" />
              <SkeletonBox className="w-9 h-9 rounded-xl" />
            </div>
            <SkeletonBox className="h-8 w-20 rounded-lg" />
            <SkeletonLine className="h-3 w-36" />
          </div>
        ))}
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <SkeletonBox className="h-9 w-64 rounded-xl" />
            <SkeletonBox className="h-9 w-36 rounded-xl" />
          </div>
          <SkeletonBox className="h-9 w-9 rounded-xl" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-4 px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <SkeletonLine className="h-3 w-28" />
          <SkeletonLine className="h-3 w-36" />
          <SkeletonLine className="h-3 w-24" />
          <SkeletonLine className="h-3 w-20 ml-auto" />
          <SkeletonLine className="h-3 w-20" />
          <SkeletonLine className="h-3 w-16" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800/60"
          >
            <SkeletonBox className="w-8 h-8 rounded-xl shrink-0" />
            <div className="space-y-1 flex-1 min-w-0">
              <SkeletonLine className="h-3.5 w-28" />
              <SkeletonLine className="h-2.5 w-20" />
            </div>
            <SkeletonLine className="h-3 w-36 font-mono" />
            <SkeletonLine className="h-3 w-20" />
            <SkeletonBox className="h-5 w-16 rounded-full" />
            <div className="flex items-center gap-1.5">
              <SkeletonBox className="h-8 w-20 rounded-xl" />
              <SkeletonBox className="h-8 w-8 rounded-lg" />
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex items-center justify-between">
        <SkeletonLine className="h-3.5 w-32" />
        <div className="flex items-center gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonBox key={i} className="h-8 w-8 rounded-lg" />
          ))}
        </div>
        <SkeletonBox className="h-9 w-24 rounded-xl" />
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
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <SkeletonBox className="w-6 h-6 rounded-lg" />
            <SkeletonBox className="h-8 w-64 rounded-xl" />
          </div>
          <SkeletonLine className="h-4 w-96 max-w-full" />
        </div>

        {/* User Profile Chip */}
        <div className="flex items-center gap-3 px-3.5 py-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs self-start sm:self-auto">
          <SkeletonBox className="w-9 h-9 rounded-full shrink-0" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <SkeletonBox className="h-4 w-24 rounded-md" />
              <SkeletonBox className="h-4 w-14 rounded-md" />
            </div>
            <SkeletonLine className="h-3 w-16" />
          </div>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="flex items-center gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-x-auto scrollbar-none w-full">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBox key={i} className="h-10 flex-1 min-w-[120px] rounded-xl" />
        ))}
      </div>

      {/* Main Settings Card */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
        {/* Profile Header / Avatar Section */}
        <div className="flex flex-col sm:flex-row items-center gap-5 pb-6 border-b border-slate-100 dark:border-slate-800">
          <SkeletonBox className="w-20 h-20 rounded-full shrink-0" />
          <div className="space-y-2 text-center sm:text-left flex-1">
            <SkeletonBox className="h-6 w-48 rounded-lg mx-auto sm:mx-0" />
            <SkeletonLine className="h-4 w-64 mx-auto sm:mx-0" />
            <div className="flex items-center justify-center sm:justify-start gap-2 pt-1">
              <SkeletonBox className="h-6 w-20 rounded-full" />
              <SkeletonBox className="h-6 w-24 rounded-full" />
            </div>
          </div>
        </div>

        {/* Form Inputs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <SkeletonLine className="h-3.5 w-28" />
              <SkeletonBox className="h-11 w-full rounded-xl" />
            </div>
          ))}
        </div>

        {/* Action Button */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <SkeletonBox className="h-11 w-36 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 13. Logs & Bug Reports Page Skeleton
// ============================================================================
export function LogsPageSkeleton() {
  return (
    <div className="space-y-6 w-full pb-20 animate-fadeIn">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <SkeletonBox className="w-6 h-6 rounded-lg" />
            <SkeletonBox className="h-8 w-80 rounded-xl" />
          </div>
          <SkeletonLine className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex items-center gap-3">
          <SkeletonBox className="h-10 w-28 rounded-xl" />
          <SkeletonBox className="h-10 w-36 rounded-xl" />
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="p-5 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-3"
          >
            <div className="flex items-center justify-between">
              <SkeletonLine className="h-3 w-28" />
              <SkeletonBox className="w-9 h-9 rounded-xl" />
            </div>
            <SkeletonBox className="h-8 w-24 rounded-lg" />
            <SkeletonLine className="h-3 w-40" />
          </div>
        ))}
      </div>

      {/* Modern Navigation Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl w-fit">
        <SkeletonBox className="h-9 w-48 rounded-xl" />
        <SkeletonBox className="h-9 w-44 rounded-xl" />
      </div>

      {/* Filter Toolbar — search + pill buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
        <SkeletonBox className="h-9 w-full sm:w-80 rounded-xl" />
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonBox key={i} className="h-8 w-20 rounded-xl shrink-0" />
          ))}
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-2.5 border-b border-slate-100 dark:border-slate-800/60"
            >
              <SkeletonLine className="h-4 w-32" />
              <SkeletonBox className="h-6 w-24 rounded-full" />
              <SkeletonLine className="h-4 w-48 flex-1 mx-6" />
              <SkeletonBox className="h-6 w-28 rounded-lg" />
              <SkeletonLine className="h-4 w-28 text-right" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 14. Revenue Details Page Skeleton
// ============================================================================
export function RevenueDetailsSkeleton() {
  return (
    <div className="space-y-6 w-full pb-20 animate-fadeIn">
      {/* Top Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <SkeletonBox className="w-9 h-9 rounded-xl shrink-0" />
          <div className="space-y-1.5">
            <SkeletonBox className="h-7 w-80 rounded-xl" />
            <SkeletonLine className="h-3.5 w-96 max-w-full" />
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <SkeletonBox className="h-10 w-36 rounded-xl" />
          <SkeletonBox className="h-10 w-32 rounded-xl" />
        </div>
      </div>

      {/* 4 Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-2 shadow-xs"
          >
            <SkeletonLine className="h-3 w-28" />
            <SkeletonBox className="h-7 w-24 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <SkeletonBox className="h-10 w-64 rounded-xl" />
        <div className="flex items-center gap-2">
          <SkeletonBox className="h-10 w-44 rounded-xl" />
          <SkeletonBox className="h-10 w-36 rounded-xl" />
          <SkeletonBox className="h-10 w-28 rounded-xl" />
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-2.5 border-b border-slate-100 dark:border-slate-800/60"
            >
              <SkeletonBox className="w-4 h-4 rounded" />
              <SkeletonLine className="h-4 w-32" />
              <SkeletonLine className="h-4 w-28" />
              <SkeletonLine className="h-4 w-24" />
              <SkeletonBox className="h-5 w-20 rounded-md" />
              <SkeletonBox className="h-5 w-16 rounded-md" />
              <SkeletonBox className="h-6 w-24 rounded-full" />
              <SkeletonBox className="h-7 w-16 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

