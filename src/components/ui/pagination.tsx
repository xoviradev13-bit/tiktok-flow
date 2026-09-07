"use client";
import React from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MoreHorizontal,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
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

export interface PaginationProps {
  currentPage: number;
  totalPages?: number;
  totalItems?: number;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  itemLabel?: string;
  className?: string;
  showItemCount?: boolean;
  showPageNumbers?: boolean;
}

export function Pagination({
  currentPage,
  totalPages: customTotalPages,
  totalItems,
  pageSize = 25,
  pageSizeOptions = [5, 10, 25, 50],
  onPageSizeChange,
  hasNextPage,
  hasPreviousPage,
  onPageChange,
  isLoading,
  itemLabel = "items",
  className,
  showItemCount = true,
  showPageNumbers = true,
}: PaginationProps) {
  const calculatedTotalPages =
    customTotalPages ??
    (totalItems !== undefined ? Math.max(1, Math.ceil(totalItems / pageSize)) : 1);
  const totalPages = Math.max(1, calculatedTotalPages);

  const effectiveHasPrev = hasPreviousPage ?? (currentPage > 1);
  const effectiveHasNext = hasNextPage ?? (currentPage < totalPages);

  // Calculate item range
  const startItem =
    totalItems === 0 || totalItems === undefined
      ? (currentPage - 1) * pageSize + 1
      : Math.min((currentPage - 1) * pageSize + 1, totalItems);
  const endItem =
    totalItems !== undefined
      ? Math.min(currentPage * pageSize, totalItems)
      : currentPage * pageSize;

  // Generate page numbers for direct jumping
  const getPageNumbers = () => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    if (currentPage <= 3) {
      return [1, 2, 3, 4, "ellipsis", totalPages];
    }

    if (currentPage >= totalPages - 2) {
      return [1, "ellipsis", totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }

    return [1, "ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", totalPages];
  };

  const pageNumbers = getPageNumbers();

  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-4 pb-2 border-t border-zinc-200/80 dark:border-zinc-800/80",
        className
      )}
    >
      {/* Left side: Results Count / Item Range */}
      {showItemCount && (
        <div className="flex items-center gap-2 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 font-medium">
          {totalItems !== undefined ? (
            <span>
              Showing{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {totalItems === 0 ? 0 : `${startItem}–${endItem}`}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {totalItems}
              </span>{" "}
              {itemLabel}
            </span>
          ) : (
            <span>
              Page <span className="font-semibold text-zinc-900 dark:text-zinc-100">{currentPage}</span>
              {totalPages > 1 && <span> of {totalPages}</span>}
            </span>
          )}

          {isLoading && (
            <span className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 ml-1.5 animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin" />
              Updating...
            </span>
          )}
        </div>
      )}

      {/* Right side: Page Size Selector + Page Navigation Buttons */}
      <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 sm:gap-4">
        {/* Page Size Selector */}
        {onPageSizeChange && pageSizeOptions.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-400">
            <span className="hidden md:inline whitespace-nowrap">Per page:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(val) => {
                onPageSizeChange(Number(val));
                onPageChange(1);
              }}
            >
              <SelectTrigger className="h-8 px-2.5 text-sm bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-xs focus:ring-1 focus:ring-zinc-400">
                <SelectValue placeholder={String(pageSize)}>
                  <span className="font-medium">{pageSize}</span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end" className="w-24 min-w-[5rem]">
                {pageSizeOptions.map((opt) => (
                  <SelectItem key={opt} value={String(opt)} className="text-sm">
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex items-center gap-1">
          {/* First Page */}
          {totalPages > 4 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onPageChange(1)}
                  disabled={!effectiveHasPrev || isLoading || currentPage === 1}
                  className={cn(
                    "hidden sm:flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 shadow-xs transition-all",
                    "hover:bg-zinc-100 hover:text-zinc-900 hover:border-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-zinc-100 dark:hover:border-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  )}
                  type="button"
                  aria-label="First page"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>First page</TooltipContent>
            </Tooltip>
          )}

          {/* Previous Page */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onPageChange(currentPage - 1)}
                disabled={!effectiveHasPrev || isLoading}
                className={cn(
                  "flex h-8 items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300 shadow-xs transition-all",
                  "hover:bg-zinc-100 hover:text-zinc-900 hover:border-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-zinc-100 dark:hover:border-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                )}
                type="button"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Prev</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>Previous page</TooltipContent>
          </Tooltip>

          {/* Direct Page Numbers (Desktop & Tablet) */}
          {showPageNumbers && (
            <div className="hidden sm:flex items-center gap-1 px-1">
              {pageNumbers.map((p, idx) => {
                if (p === "ellipsis") {
                  return (
                    <span
                      key={`ellipsis-${idx}`}
                      className="flex h-8 w-8 items-center justify-center text-zinc-400 text-xs"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </span>
                  );
                }

                const pageNum = Number(p);
                const isActive = pageNum === currentPage;

                return (
                  <button
                    key={pageNum}
                    onClick={() => onPageChange(pageNum)}
                    disabled={isLoading}
                    type="button"
                    className={cn(
                      "h-8 min-w-[32px] px-2 rounded-lg text-sm font-medium transition-all cursor-pointer flex items-center justify-center",
                      isActive
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm font-semibold ring-1 ring-zinc-900/10"
                        : "border border-transparent text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
          )}

          {/* Mobile Current Page Indicator */}
          <div className="sm:hidden flex items-center px-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {currentPage} / {totalPages}
          </div>

          {/* Next Page */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onPageChange(currentPage + 1)}
                disabled={!effectiveHasNext || isLoading}
                className={cn(
                  "flex h-8 items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300 shadow-xs transition-all",
                  "hover:bg-zinc-100 hover:text-zinc-900 hover:border-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-zinc-100 dark:hover:border-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                )}
                type="button"
                aria-label="Next page"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Next page</TooltipContent>
          </Tooltip>

          {/* Last Page */}
          {totalPages > 4 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onPageChange(totalPages)}
                  disabled={!effectiveHasNext || isLoading || currentPage === totalPages}
                  className={cn(
                    "hidden sm:flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 shadow-xs transition-all",
                    "hover:bg-zinc-100 hover:text-zinc-900 hover:border-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-zinc-100 dark:hover:border-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  )}
                  type="button"
                  aria-label="Last page"
                >
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Last page</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}