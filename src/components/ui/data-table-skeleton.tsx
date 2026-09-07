"use client";

import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface DataTableSkeletonProps {
  columnCount?: number;
  columns?: number;
  rowCount?: number;
  rows?: number;
  showBorder?: boolean;
  className?: string;
}

export function DataTableSkeleton({
  columnCount,
  columns,
  rowCount,
  rows,
  showBorder = true,
  className,
}: DataTableSkeletonProps) {
  const finalColumnCount = columnCount ?? columns ?? 6;
  const finalRowCount = rowCount ?? rows ?? 8;

  return (
    <div
      className={cn(
        "w-full bg-white dark:bg-slate-900/70 transition-all duration-300 overflow-hidden",
        showBorder && "rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-xs",
        className
      )}
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/90">
            {Array.from({ length: finalColumnCount }).map((_, i) => (
              <TableHead key={i} className="py-3.5 px-4">
                <Skeleton
                  className={cn(
                    "h-4 rounded-md bg-slate-200/80 dark:bg-slate-800 animate-pulse",
                    i === 0 ? "w-28" : i === 1 ? "w-20" : i === 2 ? "w-16" : "w-24"
                  )}
                />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: finalRowCount }).map((_, i) => (
            <TableRow
              key={i}
              className="hover:bg-transparent border-b border-slate-100 dark:border-slate-800/50"
            >
              {Array.from({ length: finalColumnCount }).map((_, j) => (
                <TableCell key={j} className="py-4 px-4">
                  <div className="flex items-center gap-3">
                    {j === 0 ? (
                      <div className="flex items-center gap-2.5">
                        <Skeleton className="h-8 w-8 rounded-lg bg-slate-200/80 dark:bg-slate-800 shrink-0" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-4 w-28 rounded-md bg-slate-200 dark:bg-slate-800" />
                          <Skeleton className="h-3 w-16 rounded-md bg-slate-100 dark:bg-slate-800/60" />
                        </div>
                      </div>
                    ) : j === 1 ? (
                      <Skeleton className="h-6 w-20 rounded-full bg-slate-200/80 dark:bg-slate-800" />
                    ) : j === 2 ? (
                      <Skeleton className="h-5 w-12 rounded-md bg-slate-200/80 dark:bg-slate-800" />
                    ) : j === 3 ? (
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-6 w-6 rounded-full bg-slate-200/80 dark:bg-slate-800" />
                        <Skeleton className="h-3.5 w-20 rounded-md bg-slate-200/80 dark:bg-slate-800" />
                      </div>
                    ) : j === 4 ? (
                      <div className="space-y-1.5">
                        <Skeleton className="h-4 w-20 rounded-md bg-slate-200/80 dark:bg-slate-800" />
                        <Skeleton className="h-3 w-14 rounded-md bg-slate-100 dark:bg-slate-800/60" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Skeleton className="h-8 w-20 rounded-lg bg-slate-200/80 dark:bg-slate-800" />
                        <Skeleton className="h-8 w-8 rounded-lg bg-slate-200/80 dark:bg-slate-800" />
                      </div>
                    )}
                  </div>
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
